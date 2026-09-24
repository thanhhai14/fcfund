import { desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  activityLogs,
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberCharges,
  memberMatchStats,
  members,
} from "../src/db/schema";
import { hasRecordedMatchResult } from "../src/lib/match-lifecycle-core";

type Issue = {
  code: string;
  matchId: string;
  detail: string;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client);

async function main() {
  const issues: Issue[] = [];

  const [matchRows, versionRows, statRows, participantRows, teamMemberRows, activeChargeRows, logRows] = await Promise.all([
    db.select({
      id: matches.id,
      playedOn: matches.playedOn,
      note: matches.note,
      deletedAt: matches.deletedAt,
      createdAt: matches.createdAt,
      updatedAt: matches.updatedAt,
    }).from(matches),
    db.select({
      id: matchTeamVersions.id,
      matchId: matchTeamVersions.matchId,
      version: matchTeamVersions.version,
      status: matchTeamVersions.status,
      metrics: matchTeamVersions.metrics,
      confirmedAt: matchTeamVersions.confirmedAt,
      createdAt: matchTeamVersions.createdAt,
      updatedAt: matchTeamVersions.updatedAt,
    }).from(matchTeamVersions),
    db.select({
      matchId: memberMatchStats.matchId,
      memberId: memberMatchStats.memberId,
      memberName: members.fullName,
      teamVersionId: memberMatchStats.teamVersionId,
      teamId: memberMatchStats.teamId,
      playedOn: memberMatchStats.playedOn,
      result: memberMatchStats.result,
      placement: memberMatchStats.placement,
    }).from(memberMatchStats)
      .leftJoin(members, eq(memberMatchStats.memberId, members.id)),
    db.select({
      matchId: matchParticipants.matchId,
      memberId: matchParticipants.memberId,
      memberName: members.fullName,
    }).from(matchParticipants)
      .leftJoin(members, eq(matchParticipants.memberId, members.id)),
    db.select({
      versionId: matchTeamMembers.versionId,
      memberId: matchTeamMembers.memberId,
      memberName: members.fullName,
      snapshotName: matchTeamMembers.displayNameSnapshot,
      teamId: matchTeamMembers.teamId,
      teamName: matchTeams.name,
      assignedAsGoalkeeper: matchTeamMembers.assignedAsGoalkeeper,
    }).from(matchTeamMembers)
      .leftJoin(members, eq(matchTeamMembers.memberId, members.id))
      .leftJoin(matchTeams, eq(matchTeamMembers.teamId, matchTeams.id)),
    db.select({
      matchId: memberCharges.matchId,
      memberId: memberCharges.memberId,
      chargeTypeId: memberCharges.chargeTypeId,
      quantity: memberCharges.quantity,
      note: memberCharges.note,
    }).from(memberCharges).where(isNull(memberCharges.deletedAt)),
    db.select({
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      action: activityLogs.action,
      message: activityLogs.message,
      beforeData: activityLogs.beforeData,
      afterData: activityLogs.afterData,
      createdAt: activityLogs.createdAt,
    }).from(activityLogs).orderBy(desc(activityLogs.createdAt)),
  ]);

  const versionsByMatch = new Map<string, typeof versionRows>();
  for (const row of versionRows) {
    versionsByMatch.set(row.matchId, [...(versionsByMatch.get(row.matchId) ?? []), row]);
  }

  const statsByMatch = new Map<string, typeof statRows>();
  for (const row of statRows) {
    statsByMatch.set(row.matchId, [...(statsByMatch.get(row.matchId) ?? []), row]);
  }

  const participantsByMatch = new Map<string, Set<string>>();
  for (const row of participantRows) {
    if (!row.memberId) continue;
    const set = participantsByMatch.get(row.matchId) ?? new Set<string>();
    set.add(row.memberId);
    participantsByMatch.set(row.matchId, set);
  }

  const teamMembersByVersion = new Map<string, Set<string>>();
  for (const row of teamMemberRows) {
    if (!row.memberId) continue;
    const set = teamMembersByVersion.get(row.versionId) ?? new Set<string>();
    set.add(row.memberId);
    teamMembersByVersion.set(row.versionId, set);
  }

  const activeChargeCountByMatch = new Map<string, number>();
  for (const row of activeChargeRows) {
    if (!row.matchId) continue;
    activeChargeCountByMatch.set(row.matchId, (activeChargeCountByMatch.get(row.matchId) ?? 0) + 1);
  }

  for (const match of matchRows) {
    const versions = versionsByMatch.get(match.id) ?? [];
    const confirmed = versions.find((row) => row.status === "CONFIRMED") ?? null;
    const resultVersions = versions.filter((row) => hasRecordedMatchResult(row.metrics));
    const supersededResult = versions.find(
      (row) => row.status === "SUPERSEDED" && hasRecordedMatchResult(row.metrics),
    );

    if (supersededResult && (!confirmed || !hasRecordedMatchResult(confirmed.metrics))) {
      issues.push({
        code: "SUPERSEDED_RESULT_WITHOUT_CURRENT_RESULT",
        matchId: match.id,
        detail: `Version ${supersededResult.id} đã có result nhưng current CONFIRMED không có result.`,
      });
    }

    if (resultVersions.length > 1) {
      issues.push({
        code: "MULTIPLE_RESULT_VERSIONS",
        matchId: match.id,
        detail: `Có ${resultVersions.length} Team Version chứa result-like metrics.`,
      });
    }

    if (resultVersions.length && !confirmed) {
      issues.push({
        code: "RESULT_WITHOUT_CONFIRMED",
        matchId: match.id,
        detail: "Có version chứa result nhưng Match không có CONFIRMED version.",
      });
    }

    for (const stat of statsByMatch.get(match.id) ?? []) {
      if (confirmed && stat.teamVersionId !== confirmed.id) {
        issues.push({
          code: "STAT_VERSION_MISMATCH",
          matchId: match.id,
          detail: `member ${stat.memberId}: stat version=${stat.teamVersionId ?? "null"}, confirmed=${confirmed.id}.`,
        });
      }
      if (stat.playedOn !== match.playedOn) {
        issues.push({
          code: "STAT_DATE_MISMATCH",
          matchId: match.id,
          detail: `member ${stat.memberId}: stat playedOn=${stat.playedOn}, match playedOn=${match.playedOn}.`,
        });
      }
    }

    if (confirmed) {
      const participantIds = participantsByMatch.get(match.id) ?? new Set<string>();
      const lineupIds = teamMembersByVersion.get(confirmed.id) ?? new Set<string>();
      const missingFromParticipants = [...lineupIds].filter((id) => !participantIds.has(id));
      const missingFromLineup = [...participantIds].filter((id) => !lineupIds.has(id));
      if (missingFromParticipants.length || missingFromLineup.length) {
        const participantNameById = new Map(
          participantRows
            .filter((row) => row.matchId === match.id && row.memberId)
            .map((row) => [row.memberId!, row.memberName ?? row.memberId!]),
        );
        const confirmedTeamRows = teamMemberRows
          .filter((row) => row.versionId === confirmed.id && row.memberId);
        const lineupNameById = new Map(
          confirmedTeamRows.map((row) => [row.memberId!, row.memberName ?? row.snapshotName ?? row.memberId!]),
        );
        const lineupTeamById = new Map(
          confirmedTeamRows.map((row) => [row.memberId!, row.teamName ?? row.teamId]),
        );
        const lineupGoalkeeperById = new Map(
          confirmedTeamRows.map((row) => [row.memberId!, row.assignedAsGoalkeeper]),
        );
        const statsByMemberId = new Map(
          (statsByMatch.get(match.id) ?? []).map((row) => [row.memberId, row]),
        );
        const relevantLogs = logRows
          .filter((log) => log.entityId === match.id || log.entityId === confirmed.id)
          .slice(0, 8)
          .map((log) => `${log.createdAt.toISOString()} [${log.entityType}/${log.action}] ${log.message ?? ""}`);
        issues.push({
          code: "PARTICIPANT_LINEUP_MISMATCH",
          matchId: match.id,
          detail: [
            `playedOn=${match.playedOn}`,
            `confirmed=v${confirmed.version} (${confirmed.id})`,
            `lineup-only=${missingFromParticipants.map((id) => {
              const stat = statsByMemberId.get(id);
              const statText = stat ? `, stat=${stat.result}/hạng ${stat.placement ?? "?"}` : ", stat=none";
              const charges = activeChargeRows
                .filter((row) => row.matchId === match.id && row.memberId === id)
                .map((row) => `${row.quantity}x ${row.note ?? row.chargeTypeId}`)
                .join(" | ");
              const goalkeeperText = lineupGoalkeeperById.get(id) ? ", goalkeeper=yes" : ", goalkeeper=no";
              return `${lineupNameById.get(id) ?? id} [${id}] @ ${lineupTeamById.get(id) ?? "unknown team"}${statText}${goalkeeperText}, activeCharges=${charges || "none"}`;
            }).join(", ") || "none"}`,
            `participant-only=${missingFromLineup.map((id) => `${participantNameById.get(id) ?? id} [${id}]`).join(", ") || "none"}`,
            relevantLogs.length ? `logs=${relevantLogs.join(" | ")}` : "logs=none",
          ].join("; "),
        });
      }
    }

    if (match.deletedAt && (activeChargeCountByMatch.get(match.id) ?? 0) > 0) {
      issues.push({
        code: "CANCELLED_WITH_ACTIVE_CHARGES",
        matchId: match.id,
        detail: `Match đã hủy nhưng còn ${activeChargeCountByMatch.get(match.id)} active charge(s).`,
      });
    }
  }

  if (!issues.length) {
    console.log(`Match lifecycle audit passed: ${matchRows.length} match(es), no known inconsistency found.`);
    return;
  }

  console.log(`Match lifecycle audit found ${issues.length} issue(s) across ${matchRows.length} match(es):`);
  for (const issue of issues) {
    console.log(`- [${issue.code}] ${issue.matchId}: ${issue.detail}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Match lifecycle audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
