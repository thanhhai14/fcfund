"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activityLogs,
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  members,
} from "@/db/schema";
import { PERMISSIONS } from "@/lib/constants";
import { FORM_SCORE_LOW_THRESHOLD, FORM_SCORE_MIN_SAMPLE, getMatchFormStats } from "@/lib/match-form-stats";
import { requirePermission } from "@/lib/permissions";
import { generateBalancedTeams, type BalanceParticipant, type SeedTier } from "@/lib/team-balancer";

type MutationResult = { ok: boolean; message: string };
type TeamDrawResult = MutationResult & {
  draw?: {
    runId: string;
    teams: Array<{
      id: string;
      index: number;
      name: string;
      color: string;
      members: Array<{
        participantId: string;
        memberId: string | null;
        name: string;
        seedTier: SeedTier;
        isLocked: boolean;
      }>;
    }>;
  };
};
const SEED_TIERS = new Set<SeedTier>(["TIER_1", "TIER_2", "TIER_3", "TIER_4", "GOALKEEPER"]);

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function getManagedMatch(matchId: string, clubId: string) {
  const [match] = await db.select().from(matches).where(and(
    eq(matches.id, matchId),
    eq(matches.clubId, clubId),
    isNull(matches.deletedAt),
  )).limit(1);
  return match;
}

async function currentParticipants(matchId: string) {
  return db.select({
    id: matchParticipants.id,
    memberId: matchParticipants.memberId,
    guestName: matchParticipants.guestName,
    seedTier: matchParticipants.seedTier,
    memberName: members.fullName,
  })
    .from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .where(eq(matchParticipants.matchId, matchId));
}

async function draftForMatch(matchId: string) {
  const [draft] = await db.select().from(matchTeamVersions).where(and(
    eq(matchTeamVersions.matchId, matchId),
    eq(matchTeamVersions.status, "DRAFT"),
  )).limit(1);
  return draft;
}

export async function saveAndLockMatchSeedsAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_SEED_MANAGE);
  const matchId = str(formData, "matchId");
  const match = await getManagedMatch(matchId, actor.clubId);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };

  const participants = await currentParticipants(matchId);
  if (!participants.length) return { ok: false, message: "Trận chưa có người tham gia." };
  const seeds = new Map<string, SeedTier>();
  for (const participant of participants) {
    const seed = str(formData, `seed_${participant.id}`) as SeedTier;
    if (!SEED_TIERS.has(seed)) {
      return { ok: false, message: `Chưa đánh giá Seed cho ${participant.memberName ?? participant.guestName ?? "thành viên"}.` };
    }
    seeds.set(participant.id, seed);
  }

  const existingDraft = await draftForMatch(matchId);
  const [latest] = await db.select({ version: matchTeamVersions.version })
    .from(matchTeamVersions)
    .where(eq(matchTeamVersions.matchId, matchId))
    .orderBy(desc(matchTeamVersions.version))
    .limit(1);
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const participant of participants) {
      await tx.update(matchParticipants).set({
        seedTier: seeds.get(participant.id),
        seedEvaluatedAt: now,
        seedEvaluatedBy: actor.id,
      }).where(eq(matchParticipants.id, participant.id));
    }

    let versionId = existingDraft?.id;
    if (existingDraft) {
      await tx.delete(matchTeams).where(eq(matchTeams.versionId, existingDraft.id));
      await tx.update(matchTeamVersions).set({
        tierLockedAt: now,
        tierLockedBy: actor.id,
        randomKey: null,
        metrics: {},
        updatedAt: now,
      }).where(eq(matchTeamVersions.id, existingDraft.id));
    } else {
      const [created] = await tx.insert(matchTeamVersions).values({
        matchId,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        teamCount: 2,
        lookbackMatches: 10,
        tierLockedAt: now,
        tierLockedBy: actor.id,
        createdBy: actor.id,
      }).returning();
      versionId = created.id;
    }

    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match_team_version",
      entityId: versionId!,
      action: existingDraft ? "UPDATE" : "CREATE",
      actorId: actor.id,
      message: `Đánh giá và khóa Seed cho ${participants.length} người của trận ${match.playedOn}`,
      afterData: Object.fromEntries(seeds),
    });
  });

  revalidatePath(`/matches/${matchId}/teams`);
  return { ok: true, message: "Đã lưu và khóa Seed của trận. Có thể tạo đội." };
}

export async function unlockMatchSeedsAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_SEED_MANAGE);
  const matchId = str(formData, "matchId");
  const match = await getManagedMatch(matchId, actor.clubId);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  const draft = await draftForMatch(matchId);
  if (!draft) return { ok: false, message: "Chưa có phiên bản nháp để mở khóa." };

  await db.transaction(async (tx) => {
    await tx.delete(matchTeams).where(eq(matchTeams.versionId, draft.id));
    await tx.update(matchTeamVersions).set({
      tierLockedAt: null,
      tierLockedBy: null,
      randomKey: null,
      metrics: {},
      updatedAt: new Date(),
    }).where(eq(matchTeamVersions.id, draft.id));
    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match_team_version",
      entityId: draft.id,
      action: "UPDATE",
      actorId: actor.id,
      message: "Mở khóa Seed và xóa đội hình nháp",
    });
  });
  revalidatePath(`/matches/${matchId}/teams`);
  return { ok: true, message: "Đã mở khóa Seed. Đội hình nháp cũ đã được xóa." };
}

export async function generateMatchTeamsAction(formData: FormData): Promise<TeamDrawResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const match = await getManagedMatch(matchId, actor.clubId);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  const draft = await draftForMatch(matchId);
  if (!draft?.tierLockedAt) return { ok: false, message: "Hãy lưu và khóa Seed trước khi tạo đội." };

  const teamCount = Number(str(formData, "teamCount"));
  const lookbackMatches = Math.min(30, Math.max(1, Number(str(formData, "lookbackMatches") || 10)));
  const participants = await currentParticipants(matchId);
  if (!Number.isInteger(teamCount) || teamCount < 2) return { ok: false, message: "Số đội phải là số nguyên từ 2 trở lên." };
  if (participants.length < 10) return { ok: false, message: "Cần ít nhất 10 người tham gia để tạo đội." };
  if (teamCount > participants.length) return { ok: false, message: "Số đội không được vượt quá số người tham gia." };
  const missingSeed = participants.find((row) => !row.seedTier);
  if (missingSeed) return { ok: false, message: `Thiếu Seed của ${missingSeed.memberName ?? missingSeed.guestName ?? "thành viên"}.` };

  const memberIds = participants.flatMap((row) => row.memberId ? [row.memberId] : []);
  const stats = await getMatchFormStats({ clubId: actor.clubId, playedOn: match.playedOn, memberIds, lookbackMatches });
  const existingAssignments = await db.select({
    participantId: matchTeamMembers.participantId,
    isLocked: matchTeamMembers.isLocked,
    teamIndex: matchTeams.teamIndex,
  }).from(matchTeamMembers)
    .innerJoin(matchTeams, eq(matchTeamMembers.teamId, matchTeams.id))
    .where(eq(matchTeamMembers.versionId, draft.id));
  const lockedMap = new Map(existingAssignments.flatMap((row) => row.isLocked && row.participantId
    ? [[row.participantId, row.teamIndex] as const]
    : []));

  const balanceRows: BalanceParticipant[] = participants.map((row) => {
    const stat = row.memberId ? stats.get(row.memberId) : undefined;
    return {
      participantId: row.id,
      memberId: row.memberId,
      name: row.memberName ?? row.guestName ?? "Khách",
      seedTier: row.seedTier as SeedTier,
      recentMatchCount: stat?.matchCount ?? 0,
      recentLossCount: stat?.lossCount ?? 0,
      recentLossRate: stat?.lossRate ?? null,
      formScore: stat?.formScore ?? 5000,
      formConfidence: stat?.formConfidence ?? 0,
      inferredMatchCount: stat?.inferredMatchCount ?? 0,
      lowForm: stat?.lowForm ?? false,
      lockedTeamIndex: lockedMap.get(row.id),
    };
  });

  const randomKey = randomUUID();
  let result;
  try {
    result = generateBalancedTeams(balanceRows, teamCount, randomKey);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Không thể tạo đội hình hợp lệ." };
  }

  const drawTeams = await db.transaction(async (tx) => {
    await tx.delete(matchTeams).where(eq(matchTeams.versionId, draft.id));
    const payload: NonNullable<TeamDrawResult["draw"]>["teams"] = [];
    for (const team of result.teams) {
      const color = ["#073b5c", "#c93f68", "#d68b2c", "#2e7d58"][team.index - 1] ?? "#526170";
      const [createdTeam] = await tx.insert(matchTeams).values({
        versionId: draft.id,
        teamIndex: team.index,
        name: `Đội ${String.fromCharCode(64 + team.index)}`,
        color,
        memberCount: team.memberCount,
        goalkeeperCount: team.goalkeeperCount,
        outfieldSkillScore: team.skillScore,
        recentLossScore: team.recentLossScore,
        formScoreTotal: team.formScoreTotal,
        lowFormCount: team.lowFormCount,
      }).returning();
      await tx.insert(matchTeamMembers).values(team.members.map((member, displayOrder) => ({
        versionId: draft.id,
        teamId: createdTeam.id,
        participantId: member.participantId,
        memberId: member.memberId,
        displayNameSnapshot: member.name,
        seedTierSnapshot: member.seedTier,
        recentMatchCountSnapshot: member.recentMatchCount,
        recentLossCountSnapshot: member.recentLossCount,
        recentLossRateSnapshot: member.recentLossRate,
        formScoreSnapshot: member.formScore,
        formConfidenceSnapshot: member.formConfidence,
        inferredMatchCountSnapshot: member.inferredMatchCount,
        isLocked: Boolean(member.lockedTeamIndex),
        displayOrder,
      })));
      payload.push({
        id: createdTeam.id,
        index: team.index,
        name: createdTeam.name,
        color,
        members: team.members.map((member) => ({
          participantId: member.participantId,
          memberId: member.memberId,
          name: member.name,
          seedTier: member.seedTier,
          isLocked: Boolean(member.lockedTeamIndex),
        })),
      });
    }
    await tx.update(matchTeamVersions).set({
      randomKey,
      teamCount,
      lookbackMatches,
      metrics: { cost: result.cost },
      updatedAt: new Date(),
    }).where(eq(matchTeamVersions.id, draft.id));
    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match_team_version",
      entityId: draft.id,
      action: "UPDATE",
      actorId: actor.id,
      message: `Chia ${participants.length} người thành ${teamCount} đội`,
      afterData: { randomKey, cost: result.cost },
    });
    return payload;
  });

  revalidatePath(`/matches/${matchId}/teams`);
  return {
    ok: true,
    message: "Đã tạo đội hình cân bằng. Kiểm tra và xác nhận bản cuối.",
    draw: { runId: randomKey, teams: drawTeams },
  };
}

export async function saveManualTeamsAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const match = await getManagedMatch(matchId, actor.clubId);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  const draft = await draftForMatch(matchId);
  if (!draft) return { ok: false, message: "Không có đội hình nháp." };

  const teams = await db.select().from(matchTeams).where(eq(matchTeams.versionId, draft.id));
  const teamIds = new Set(teams.map((team) => team.id));
  const rows = await db.select().from(matchTeamMembers).where(eq(matchTeamMembers.versionId, draft.id));
  if (!rows.length) return { ok: false, message: "Hãy tạo đội trước khi điều chỉnh." };

  const assignments = rows.map((row) => ({
    row,
    teamId: str(formData, `team_${row.id}`),
    isLocked: formData.get(`locked_${row.id}`) === "on",
  }));
  if (assignments.some((assignment) => !teamIds.has(assignment.teamId))) {
    return { ok: false, message: "Đội được chọn không hợp lệ." };
  }

  await db.transaction(async (tx) => {
    for (const assignment of assignments) {
      await tx.update(matchTeamMembers).set({
        teamId: assignment.teamId,
        isLocked: assignment.isLocked,
      }).where(eq(matchTeamMembers.id, assignment.row.id));
    }
    for (const team of teams) {
      const teamRows = assignments.filter((assignment) => assignment.teamId === team.id).map((assignment) => assignment.row);
      await tx.update(matchTeams).set({
        memberCount: teamRows.length,
        goalkeeperCount: teamRows.filter((row) => row.seedTierSnapshot === "GOALKEEPER").length,
        outfieldSkillScore: teamRows.reduce((sum, row) => sum + ({ TIER_1: 4, TIER_2: 3, TIER_3: 2, TIER_4: 1, GOALKEEPER: 0 }[row.seedTierSnapshot]), 0),
        recentLossScore: teamRows.reduce((sum, row) => sum + (10_000 - row.formScoreSnapshot), 0),
        formScoreTotal: teamRows.reduce((sum, row) => sum + row.formScoreSnapshot, 0),
        lowFormCount: teamRows.filter((row) => row.recentMatchCountSnapshot >= FORM_SCORE_MIN_SAMPLE && row.formScoreSnapshot < FORM_SCORE_LOW_THRESHOLD).length,
      }).where(eq(matchTeams.id, team.id));
    }
    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match_team_version",
      entityId: draft.id,
      action: "UPDATE",
      actorId: actor.id,
      message: "Điều chỉnh đội hình thủ công và cập nhật người được khóa",
    });
  });
  revalidatePath(`/matches/${matchId}/teams`);
  return { ok: true, message: "Đã lưu điều chỉnh đội hình." };
}

export async function confirmMatchTeamsAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const match = await getManagedMatch(matchId, actor.clubId);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  const draft = await draftForMatch(matchId);
  if (!draft) return { ok: false, message: "Không có đội hình nháp để xác nhận." };
  const teams = await db.select().from(matchTeams).where(eq(matchTeams.versionId, draft.id));
  const participants = await currentParticipants(matchId);
  const teamMemberRows = await db.select().from(matchTeamMembers).where(eq(matchTeamMembers.versionId, draft.id));
  if (teams.length !== draft.teamCount || teamMemberRows.length !== participants.length) {
    return { ok: false, message: "Đội hình không còn khớp danh sách tham gia. Hãy chia lại." };
  }
  const sizes = teams.map((team) => team.memberCount);
  const goalkeeperCounts = teams.map((team) => team.goalkeeperCount);
  if (participants.length < 10) {
    return { ok: false, message: "Cần ít nhất 10 người tham gia để xác nhận đội hình." };
  }
  if (sizes.some((size) => size < 1) || Math.max(...sizes) - Math.min(...sizes) > 1) {
    return { ok: false, message: "Mỗi đội phải có người và quân số chênh tối đa 1." };
  }
  if (Math.max(...goalkeeperCounts) - Math.min(...goalkeeperCounts) > 1) {
    return { ok: false, message: "Số thủ môn giữa các đội không được chênh quá 1." };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(matchTeamVersions).set({ status: "SUPERSEDED", updatedAt: now }).where(and(
      eq(matchTeamVersions.matchId, matchId),
      eq(matchTeamVersions.status, "CONFIRMED"),
    ));
    await tx.update(matchTeamVersions).set({
      status: "CONFIRMED",
      confirmedAt: now,
      updatedAt: now,
    }).where(eq(matchTeamVersions.id, draft.id));
    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match_team_version",
      entityId: draft.id,
      action: "UPDATE",
      actorId: actor.id,
      message: `Xác nhận đội hình phiên bản ${draft.version}`,
    });
  });
  revalidatePath(`/matches/${matchId}/teams`);
  revalidatePath("/matches");
  return { ok: true, message: `Đã xác nhận đội hình phiên bản ${draft.version}.` };
}
