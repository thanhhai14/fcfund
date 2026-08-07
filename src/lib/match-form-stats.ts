import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberCharges,
} from "@/db/schema";

export type MatchFormStat = {
  matchCount: number;
  lossCount: number;
  winCount: number;
  lossRate: number | null;
};

export type MemberCareerStats = {
  matchCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
};

function metricsRecord(metrics: unknown): Record<string, unknown> {
  if (typeof metrics === "string") {
    try {
      return metricsRecord(JSON.parse(metrics));
    } catch {
      return {};
    }
  }
  return metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? metrics as Record<string, unknown>
    : {};
}

export async function getMemberCareerStats(input: { clubId: string; memberId: string }): Promise<MemberCareerStats> {
  const rows = await db.select({
    matchId: matches.id,
    teamName: matchTeams.name,
    metrics: matchTeamVersions.metrics,
  })
    .from(matchTeamMembers)
    .innerJoin(matchTeams, eq(matchTeamMembers.teamId, matchTeams.id))
    .innerJoin(matchTeamVersions, eq(matchTeamMembers.versionId, matchTeamVersions.id))
    .innerJoin(matches, eq(matchTeamVersions.matchId, matches.id))
    .where(and(
      eq(matchTeamMembers.memberId, input.memberId),
      eq(matches.clubId, input.clubId),
      isNull(matches.deletedAt),
      eq(matchTeamVersions.status, "CONFIRMED"),
      sql`${matchTeamVersions.metrics} ? 'placements'`,
    ));

  let winCount = 0;
  let lossCount = 0;
  const countedMatches = new Set<string>();
  for (const row of rows) {
    if (countedMatches.has(row.matchId)) continue;
    const placements = metricsRecord(metricsRecord(row.metrics).placements);
    const place = Number(placements[row.teamName]);
    if (!Number.isInteger(place) || place < 1) continue;
    countedMatches.add(row.matchId);
    if (place === 1) winCount += 1;
    else lossCount += 1;
  }

  const matchCount = winCount + lossCount;
  return {
    matchCount,
    winCount,
    lossCount,
    winRate: matchCount ? Math.round((winCount / matchCount) * 1_000) / 10 : null,
  };
}

export async function getMatchFormStats(input: {
  clubId: string;
  playedOn: string;
  memberIds: string[];
  lookbackMatches: number;
}) {
  const result = new Map<string, MatchFormStat>();
  for (const memberId of input.memberIds) {
    result.set(memberId, { matchCount: 0, lossCount: 0, winCount: 0, lossRate: null });
  }
  if (!input.memberIds.length) return result;

  const [penaltyMatchRows, resultMatchRows] = await Promise.all([
    db.selectDistinct({ matchId: memberCharges.matchId })
      .from(memberCharges)
      .where(and(
        eq(memberCharges.clubId, input.clubId),
        eq(memberCharges.isLossPenaltySnapshot, true),
        isNull(memberCharges.deletedAt),
        isNotNull(memberCharges.matchId),
      )),
    db.select({ matchId: matchTeamVersions.matchId })
      .from(matchTeamVersions)
      .innerJoin(matches, eq(matchTeamVersions.matchId, matches.id))
      .where(and(
        eq(matches.clubId, input.clubId),
        isNull(matches.deletedAt),
        eq(matchTeamVersions.status, "CONFIRMED"),
        sql`${matchTeamVersions.metrics} ? 'placements'`,
      )),
  ]);
  const completedMatchIds = [...new Set([
    ...penaltyMatchRows.flatMap((row) => row.matchId ? [row.matchId] : []),
    ...resultMatchRows.map((row) => row.matchId),
  ])];
  if (!completedMatchIds.length) return result;

  const history = await db.select({
    memberId: matchParticipants.memberId,
    matchId: matches.id,
    playedOn: matches.playedOn,
  })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(and(
      eq(matches.clubId, input.clubId),
      isNull(matches.deletedAt),
      lt(matches.playedOn, input.playedOn),
      inArray(matches.id, completedMatchIds),
      inArray(matchParticipants.memberId, input.memberIds),
    ))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));

  const recentByMember = new Map<string, string[]>();
  for (const row of history) {
    if (!row.memberId) continue;
    const rows = recentByMember.get(row.memberId) ?? [];
    if (!rows.includes(row.matchId) && rows.length < input.lookbackMatches) rows.push(row.matchId);
    recentByMember.set(row.memberId, rows);
  }

  const relevantMatchIds = [...new Set([...recentByMember.values()].flat())];
  const penaltyRows = relevantMatchIds.length ? await db.select({
    memberId: memberCharges.memberId,
    matchId: memberCharges.matchId,
  })
    .from(memberCharges)
    .where(and(
      eq(memberCharges.clubId, input.clubId),
      eq(memberCharges.isLossPenaltySnapshot, true),
      isNull(memberCharges.deletedAt),
      inArray(memberCharges.memberId, input.memberIds),
      inArray(memberCharges.matchId, relevantMatchIds),
    )) : [];
  const lossKeys = new Set(penaltyRows.flatMap((row) => row.matchId ? [`${row.memberId}|${row.matchId}`] : []));

  for (const memberId of input.memberIds) {
    const matchIds = recentByMember.get(memberId) ?? [];
    const lossCount = matchIds.filter((matchId) => lossKeys.has(`${memberId}|${matchId}`)).length;
    result.set(memberId, {
      matchCount: matchIds.length,
      lossCount,
      winCount: matchIds.length - lossCount,
      lossRate: matchIds.length ? Math.round((lossCount / matchIds.length) * 10_000) : null,
    });
  }
  return result;
}
