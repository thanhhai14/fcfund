"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activityLogs,
  chargeTypes,
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberCharges,
  memberMatchStats,
  memberProfiles,
  members,
} from "@/db/schema";
import { PERMISSIONS } from "@/lib/constants";
import { FORMULA_VERSION, placementFormScore } from "@/lib/form-score";
import { getMatchFormStats } from "@/lib/match-form-stats";
import { requirePermission } from "@/lib/permissions";
import { isActiveSeedTier, SEED_WEIGHT, type SeedTier } from "@/lib/seed-tier";

type MutationResult = { ok: boolean; message: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function metricsRecord(metrics: unknown): Record<string, unknown> {
  if (typeof metrics === "string") {
    try {
      return metricsRecord(JSON.parse(metrics));
    } catch {
      return {};
    }
  }
  return metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? { ...(metrics as Record<string, unknown>) }
    : {};
}

export async function managePublicLineupAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const mode = str(formData, "mode");
  if (!new Set(["publish", "disable", "rotate"]).has(mode)) {
    return { ok: false, message: "Thao tác công khai không hợp lệ." };
  }

  const [match] = await db.select().from(matches).where(and(
    eq(matches.id, matchId),
    eq(matches.clubId, actor.clubId),
    isNull(matches.deletedAt),
  )).limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };

  if (mode !== "disable") {
    const [confirmed] = await db.select({ id: matchTeamVersions.id }).from(matchTeamVersions).where(and(
      eq(matchTeamVersions.matchId, matchId),
      eq(matchTeamVersions.status, "CONFIRMED"),
    )).limit(1);
    if (!confirmed) return { ok: false, message: "Hãy xác nhận đội hình trước khi công khai." };
  }

  const now = new Date();
  const nextToken = mode === "rotate" || !match.publicLineupToken
    ? randomBytes(24).toString("base64url")
    : match.publicLineupToken;
  const enabled = mode !== "disable";
  await db.transaction(async (tx) => {
    await tx.update(matches).set({
      publicLineupEnabled: enabled,
      publicLineupToken: nextToken,
      publicLineupPublishedAt: enabled ? now : match.publicLineupPublishedAt,
      updatedAt: now,
    }).where(eq(matches.id, matchId));
    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match",
      entityId: matchId,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: { publicLineupEnabled: match.publicLineupEnabled },
      afterData: { publicLineupEnabled: enabled, linkRotated: mode === "rotate" },
      message: mode === "disable" ? "Tắt công khai đội hình" : mode === "rotate" ? "Tạo lại liên kết đội hình công khai" : "Công khai đội hình",
    });
  });

  revalidatePath(`/matches/${matchId}`);
  if (match.publicLineupToken) revalidatePath(`/lineup/${match.publicLineupToken}`);
  if (enabled && nextToken) revalidatePath(`/lineup/${nextToken}`);
  return { ok: true, message: mode === "disable" ? "Đã tắt đội hình công khai." : mode === "rotate" ? "Đã tạo liên kết công khai mới." : "Đã công khai đội hình." };
}

export async function recordMatchResultAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const versionId = str(formData, "versionId");
  const chargeTypeId = str(formData, "chargeTypeId");

  const [match] = await db.select().from(matches).where(and(
    eq(matches.id, matchId),
    eq(matches.clubId, actor.clubId),
    isNull(matches.deletedAt),
  )).limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };

  const [version] = await db.select().from(matchTeamVersions).where(and(
    eq(matchTeamVersions.id, versionId),
    eq(matchTeamVersions.matchId, matchId),
    eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1);
  if (!version) return { ok: false, message: "Chỉ có thể nhập kết quả cho đội hình đã xác nhận." };

  const teams = await db.select().from(matchTeams)
    .where(eq(matchTeams.versionId, version.id))
    .orderBy(matchTeams.teamIndex);
  if (teams.length < 2) return { ok: false, message: "Trận chưa có đủ đội để nhập kết quả." };

  const placements = new Map<string, number>();
  const penaltyQuantities = new Map<string, number>();
  for (const team of teams) {
    const place = Number(str(formData, `place:${team.id}`));
    if (!Number.isInteger(place) || place < 1 || place > teams.length) {
      return { ok: false, message: `Thứ hạng của ${team.name} không hợp lệ.` };
    }
    const penaltyQuantity = Number(str(formData, `penaltyQuantity:${team.id}`));
    if (!Number.isInteger(penaltyQuantity) || penaltyQuantity < 0 || penaltyQuantity > 99) {
      return { ok: false, message: `Số lần phạt của ${team.name} phải là số nguyên từ 0 đến 99.` };
    }
    placements.set(team.id, place);
    penaltyQuantities.set(team.id, penaltyQuantity);
  }
  if (![...placements.values()].includes(1)) {
    return { ok: false, message: "Kết quả phải có ít nhất một đội hạng 1." };
  }

  const [penaltyType] = await db.select().from(chargeTypes).where(and(
    eq(chargeTypes.id, chargeTypeId),
    eq(chargeTypes.clubId, actor.clubId),
    eq(chargeTypes.calculation, "OCCURRENCE"),
    eq(chargeTypes.isLossPenalty, true),
    eq(chargeTypes.isActive, true),
  )).limit(1);
  if (!penaltyType) return { ok: false, message: "Hãy chọn một loại thu phạt đang hoạt động." };

  const teamMembers = await db.select({
    teamId: matchTeamMembers.teamId,
    memberId: matchTeamMembers.memberId,
  }).from(matchTeamMembers).where(eq(matchTeamMembers.versionId, version.id));
  const memberIds = [...new Set(teamMembers.flatMap((row) => row.memberId ? [row.memberId] : []))];
  const oldMetrics = metricsRecord(version.metrics);
  const previousChargeTypeId = typeof oldMetrics.resultChargeTypeId === "string" && UUID_PATTERN.test(oldMetrics.resultChargeTypeId)
    ? oldMetrics.resultChargeTypeId
    : chargeTypeId;
  const replacedTypeIds = [...new Set([previousChargeTypeId, chargeTypeId])];
  const placementByName = Object.fromEntries(teams.map((team) => [team.name, placements.get(team.id)]));
  const penaltyQuantitiesByName = Object.fromEntries(teams.map((team) => [team.name, penaltyQuantities.get(team.id)]));
  const placementCounts = [...placements.values()].reduce((counts, place) => counts.set(place, (counts.get(place) ?? 0) + 1), new Map<number, number>());
  const now = new Date();
  const newMetrics = {
    ...oldMetrics,
    placements: placementByName,
    penaltyQuantities: penaltyQuantitiesByName,
    resultChargeTypeId: chargeTypeId,
    resultRecordedAt: now.toISOString(),
    resultRecordedBy: actor.id,
  };
  const penaltyRows = teamMembers.flatMap((row) => {
    const place = placements.get(row.teamId);
    const quantity = penaltyQuantities.get(row.teamId) ?? 0;
    if (!row.memberId || !place || quantity <= 0) return [];
    return [{
      clubId: actor.clubId,
      memberId: row.memberId,
      chargeTypeId,
      matchId,
      source: "MATCH" as const,
      chargeDate: match.playedOn,
      quantity,
      unitAmount: penaltyType.defaultAmount,
      totalAmount: quantity * penaltyType.defaultAmount,
      isLossPenaltySnapshot: true,
      note: `Kết quả hạng ${place} · phạt ${quantity} lần · trận ${match.playedOn}`,
      createdBy: actor.id,
    }];
  });
  const statRows = teamMembers.flatMap((row) => {
    const place = placements.get(row.teamId);
    if (!row.memberId || !place) return [];
    return [{
      clubId: actor.clubId,
      memberId: row.memberId,
      matchId,
      teamVersionId: version.id,
      teamId: row.teamId,
      playedOn: match.playedOn,
      teamCount: teams.length,
      placement: place,
      isTied: (placementCounts.get(place) ?? 0) > 1,
      result: place === 1 ? "WIN" as const : "LOSS" as const,
      source: "RECORDED" as const,
      placementScore: placementFormScore(teams.length, place),
      formulaVersion: FORMULA_VERSION,
      calculatedAt: now,
      createdBy: actor.id,
      updatedAt: now,
    }];
  });

  await db.transaction(async (tx) => {
    if (memberIds.length) {
      await tx.update(memberCharges).set({
        deletedAt: now,
        deletedBy: actor.id,
        updatedAt: now,
      }).where(and(
        eq(memberCharges.matchId, matchId),
        eq(memberCharges.source, "MATCH"),
        inArray(memberCharges.memberId, memberIds),
        inArray(memberCharges.chargeTypeId, replacedTypeIds),
        isNull(memberCharges.deletedAt),
      ));
    }
    if (penaltyRows.length) await tx.insert(memberCharges).values(penaltyRows);
    await tx.delete(memberMatchStats).where(eq(memberMatchStats.matchId, matchId));
    if (statRows.length) await tx.insert(memberMatchStats).values(statRows);
    await tx.update(matchTeamVersions).set({ metrics: newMetrics, updatedAt: now })
      .where(eq(matchTeamVersions.id, version.id));
    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match",
      entityId: matchId,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: { placements: oldMetrics.placements, penaltyQuantities: oldMetrics.penaltyQuantities, resultChargeTypeId: oldMetrics.resultChargeTypeId },
      afterData: { placements: placementByName, penaltyQuantities: penaltyQuantitiesByName, resultChargeTypeId: chargeTypeId, penaltyCount: penaltyRows.length, statCount: statRows.length },
      message: `Ghi nhận kết quả trận: ${teams.map((team) => `${team.name} hạng ${placements.get(team.id)}, phạt ${penaltyQuantities.get(team.id)} lần`).join("; ")}`,
    });
  });

  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/teams`);
  revalidatePath("/matches");
  revalidatePath("/charges");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  for (const memberId of memberIds) revalidatePath(`/members/${memberId}`);
  return { ok: true, message: `Đã ghi nhận kết quả và tạo ${penaltyRows.length} khoản phạt.` };
}

export async function replaceConfirmedMatchMemberAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const versionId = str(formData, "versionId");
  const teamMemberId = str(formData, "teamMemberId");
  const replacementMemberId = str(formData, "replacementMemberId");
  const reason = str(formData, "reason");

  const [match] = await db.select().from(matches).where(and(
    eq(matches.id, matchId),
    eq(matches.clubId, actor.clubId),
    isNull(matches.deletedAt),
  )).limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };

  const [version] = await db.select().from(matchTeamVersions).where(and(
    eq(matchTeamVersions.id, versionId),
    eq(matchTeamVersions.matchId, matchId),
    eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1);
  if (!version) return { ok: false, message: "Chỉ có thể thay người trong đội hình đã xác nhận." };

  const [slot] = await db.select({
    id: matchTeamMembers.id,
    participantId: matchTeamMembers.participantId,
    memberId: matchTeamMembers.memberId,
    displayName: matchTeamMembers.displayNameSnapshot,
    teamId: matchTeamMembers.teamId,
    teamName: matchTeams.name,
  }).from(matchTeamMembers)
    .innerJoin(matchTeams, eq(matchTeamMembers.teamId, matchTeams.id))
    .where(and(
      eq(matchTeamMembers.id, teamMemberId),
      eq(matchTeamMembers.versionId, versionId),
      eq(matchTeams.versionId, versionId),
    )).limit(1);
  if (!slot) return { ok: false, message: "Không tìm thấy cầu thủ trong đội hình đã xác nhận." };
  if (slot.memberId === replacementMemberId) return { ok: false, message: "Người thay thế đang là cầu thủ hiện tại." };

  const [replacement] = await db.select().from(members).where(and(
    eq(members.id, replacementMemberId),
    eq(members.clubId, actor.clubId),
    eq(members.status, "ACTIVE"),
  )).limit(1);
  if (!replacement) return { ok: false, message: "Thành viên thay thế không tồn tại hoặc đã ngừng hoạt động." };
  const [replacementProfile] = await db.select({
    desiredPositions: memberProfiles.desiredPositions,
    playerStrength: memberProfiles.playerStrength,
  }).from(memberProfiles).where(eq(memberProfiles.memberId, replacementMemberId)).limit(1);

  const [alreadyAssigned] = await db.select({ id: matchTeamMembers.id }).from(matchTeamMembers).where(and(
    eq(matchTeamMembers.versionId, versionId),
    eq(matchTeamMembers.memberId, replacementMemberId),
  )).limit(1);
  if (alreadyAssigned) return { ok: false, message: "Thành viên thay thế đã có trong một đội của trận này." };

  const [replacementParticipant] = await db.select().from(matchParticipants).where(and(
    eq(matchParticipants.matchId, matchId),
    eq(matchParticipants.memberId, replacementMemberId),
  )).limit(1);
  const transferredCharges = slot.memberId ? await db.select({
    id: memberCharges.id,
    quantity: memberCharges.quantity,
    totalAmount: memberCharges.totalAmount,
  }).from(memberCharges).where(and(
    eq(memberCharges.matchId, matchId),
    eq(memberCharges.memberId, slot.memberId),
    isNull(memberCharges.deletedAt),
  )) : [];

  const metrics = metricsRecord(version.metrics);
  const placementMap = metricsRecord(metrics.placements);
  const placement = typeof placementMap[slot.teamName] === "number" ? placementMap[slot.teamName] as number : null;
  const teams = placement ? await db.select({ name: matchTeams.name }).from(matchTeams).where(eq(matchTeams.versionId, versionId)) : [];
  const tiedCount = placement ? teams.filter((team) => placementMap[team.name] === placement).length : 0;
  const now = new Date();

  await db.transaction(async (tx) => {
    let participantId = replacementParticipant?.id ?? slot.participantId;
    if (replacementParticipant) {
      if (slot.participantId && slot.participantId !== replacementParticipant.id) {
        await tx.delete(matchParticipants).where(eq(matchParticipants.id, slot.participantId));
      }
    } else if (slot.participantId) {
      await tx.update(matchParticipants).set({
        memberId: replacement.id,
        guestName: null,
        seedTier: null,
        seedEvaluatedAt: null,
        seedEvaluatedBy: null,
        note: reason ? `Thay người sau trận: ${reason}` : "Thay người sau trận",
      }).where(eq(matchParticipants.id, slot.participantId));
    } else {
      const [createdParticipant] = await tx.insert(matchParticipants).values({
        matchId,
        memberId: replacement.id,
        note: reason ? `Thay người sau trận: ${reason}` : "Thay người sau trận",
      }).returning({ id: matchParticipants.id });
      participantId = createdParticipant.id;
    }

    await tx.update(matchTeamMembers).set({
      participantId,
      memberId: replacement.id,
      displayNameSnapshot: replacement.fullName,
      desiredPositionsSnapshot: replacementProfile?.desiredPositions ?? [],
      playerStrengthSnapshot: replacementProfile?.playerStrength ?? null,
    }).where(eq(matchTeamMembers.id, slot.id));

    if (slot.memberId) {
      await tx.update(memberCharges).set({
        memberId: replacement.id,
        updatedAt: now,
      }).where(and(
        eq(memberCharges.matchId, matchId),
        eq(memberCharges.memberId, slot.memberId),
        isNull(memberCharges.deletedAt),
      ));
      await tx.delete(memberMatchStats).where(and(
        eq(memberMatchStats.matchId, matchId),
        eq(memberMatchStats.memberId, slot.memberId),
      ));
    }

    await tx.delete(memberMatchStats).where(and(
      eq(memberMatchStats.matchId, matchId),
      eq(memberMatchStats.memberId, replacement.id),
    ));
    if (placement && Number.isInteger(placement)) {
      await tx.insert(memberMatchStats).values({
        clubId: actor.clubId,
        memberId: replacement.id,
        matchId,
        teamVersionId: versionId,
        teamId: slot.teamId,
        playedOn: match.playedOn,
        teamCount: teams.length,
        placement,
        isTied: tiedCount > 1,
        result: placement === 1 ? "WIN" : "LOSS",
        source: "RECORDED",
        placementScore: placementFormScore(teams.length, placement),
        formulaVersion: FORMULA_VERSION,
        calculatedAt: now,
        createdBy: actor.id,
        updatedAt: now,
      });
    }

    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match",
      entityId: matchId,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: { team: slot.teamName, memberId: slot.memberId, memberName: slot.displayName },
      afterData: {
        team: slot.teamName,
        memberId: replacement.id,
        memberName: replacement.fullName,
        transferredChargeIds: transferredCharges.map((charge) => charge.id),
        transferredAmount: transferredCharges.reduce((sum, charge) => sum + charge.totalAmount, 0),
        placement,
      },
      message: `Thay ${slot.displayName} bằng ${replacement.fullName} tại ${slot.teamName}${reason ? ` · ${reason}` : ""}`,
    });
  });

  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/teams`);
  revalidatePath("/matches");
  revalidatePath("/charges");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  if (match.publicLineupToken) revalidatePath(`/lineup/${match.publicLineupToken}`);
  if (slot.memberId) revalidatePath(`/members/${slot.memberId}`);
  revalidatePath(`/members/${replacement.id}`);
  return { ok: true, message: `Đã thay ${slot.displayName} bằng ${replacement.fullName} trong ${slot.teamName}.` };
}

export async function addConfirmedMatchMemberAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const matchId = str(formData, "matchId");
  const versionId = str(formData, "versionId");
  const teamId = str(formData, "teamId");
  const memberId = str(formData, "memberId");
  const seedTier = str(formData, "seedTier") as SeedTier;
  const assignedAsGoalkeeper = formData.get("assignedAsGoalkeeper") === "on";
  const applyResult = formData.get("applyResult") === "on";
  const applyPenalty = formData.get("applyPenalty") === "on";
  const reason = str(formData, "reason");
  if (!isActiveSeedTier(seedTier)) return { ok: false, message: "Hãy chọn Seed Tier 1–7 của thành viên trong trận này." };

  const [match] = await db.select().from(matches).where(and(
    eq(matches.id, matchId), eq(matches.clubId, actor.clubId), isNull(matches.deletedAt),
  )).limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  const [version] = await db.select().from(matchTeamVersions).where(and(
    eq(matchTeamVersions.id, versionId), eq(matchTeamVersions.matchId, matchId), eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1);
  if (!version) return { ok: false, message: "Chỉ có thể bổ sung người vào đội hình đã xác nhận." };
  const [team] = await db.select().from(matchTeams).where(and(
    eq(matchTeams.id, teamId), eq(matchTeams.versionId, versionId),
  )).limit(1);
  if (!team) return { ok: false, message: "Đội được chọn không hợp lệ." };
  if (assignedAsGoalkeeper && team.goalkeeperCount >= 1) return { ok: false, message: `${team.name} đã có thủ môn.` };
  const [member] = await db.select().from(members).where(and(
    eq(members.id, memberId), eq(members.clubId, actor.clubId), eq(members.status, "ACTIVE"),
  )).limit(1);
  if (!member) return { ok: false, message: "Thành viên không tồn tại hoặc đã ngừng hoạt động." };
  const [memberProfile] = await db.select({
    desiredPositions: memberProfiles.desiredPositions,
    playerStrength: memberProfiles.playerStrength,
  }).from(memberProfiles).where(eq(memberProfiles.memberId, memberId)).limit(1);
  const [alreadyAssigned] = await db.select({ id: matchTeamMembers.id }).from(matchTeamMembers).where(and(
    eq(matchTeamMembers.versionId, versionId), eq(matchTeamMembers.memberId, memberId),
  )).limit(1);
  if (alreadyAssigned) return { ok: false, message: "Thành viên này đã thuộc một đội trong trận." };

  const [participant] = await db.select().from(matchParticipants).where(and(
    eq(matchParticipants.matchId, matchId), eq(matchParticipants.memberId, memberId),
  )).limit(1);
  const [latestOrder] = await db.select({ displayOrder: matchTeamMembers.displayOrder }).from(matchTeamMembers)
    .where(eq(matchTeamMembers.teamId, teamId)).orderBy(desc(matchTeamMembers.displayOrder)).limit(1);
  const [stat] = (await getMatchFormStats({ clubId: actor.clubId, playedOn: match.playedOn, memberIds: [memberId], lookbackMatches: version.lookbackMatches })).values();
  const metrics = metricsRecord(version.metrics);
  const placements = metricsRecord(metrics.placements);
  const penalties = metricsRecord(metrics.penaltyQuantities);
  const placement = typeof placements[team.name] === "number" ? placements[team.name] as number : null;
  const penaltyQuantity = typeof penalties[team.name] === "number"
    ? Math.max(0, Math.trunc(penalties[team.name] as number))
    : placement ? Math.max(0, placement - 1) : 0;
  const resultChargeTypeId = typeof metrics.resultChargeTypeId === "string" && UUID_PATTERN.test(metrics.resultChargeTypeId)
    ? metrics.resultChargeTypeId : null;
  const allTeams = placement ? await db.select({ name: matchTeams.name }).from(matchTeams).where(eq(matchTeams.versionId, versionId)) : [];
  const tiedCount = placement ? allTeams.filter((row) => placements[row.name] === placement).length : 0;
  let penaltyType: typeof chargeTypes.$inferSelect | null = null;
  if (applyPenalty && placement && penaltyQuantity > 0 && !resultChargeTypeId) {
    return { ok: false, message: "Kết quả trận chưa có loại thu phạt để áp dụng cho cầu thủ bổ sung." };
  }
  if (applyPenalty && placement && penaltyQuantity > 0 && resultChargeTypeId) {
    [penaltyType] = await db.select().from(chargeTypes).where(and(
      eq(chargeTypes.id, resultChargeTypeId), eq(chargeTypes.clubId, actor.clubId),
      eq(chargeTypes.calculation, "OCCURRENCE"), eq(chargeTypes.isLossPenalty, true),
    )).limit(1);
    if (!penaltyType) return { ok: false, message: "Không tìm thấy loại thu phạt đã dùng cho kết quả trận." };
  }
  const now = new Date();
  const tierWeight = SEED_WEIGHT[seedTier] * (assignedAsGoalkeeper ? 0.1 : 1);

  await db.transaction(async (tx) => {
    let participantId = participant?.id;
    if (participant) {
      await tx.update(matchParticipants).set({
        seedTier, goalkeeperAvailable: assignedAsGoalkeeper, seedEvaluatedAt: now, seedEvaluatedBy: actor.id,
        note: reason ? `Bổ sung sau khi chốt đội: ${reason}` : "Bổ sung sau khi chốt đội",
      }).where(eq(matchParticipants.id, participant.id));
    } else {
      const [created] = await tx.insert(matchParticipants).values({
        matchId, memberId, seedTier, goalkeeperAvailable: assignedAsGoalkeeper, seedEvaluatedAt: now, seedEvaluatedBy: actor.id,
        note: reason ? `Bổ sung sau khi chốt đội: ${reason}` : "Bổ sung sau khi chốt đội",
      }).returning({ id: matchParticipants.id });
      participantId = created.id;
    }
    await tx.insert(matchTeamMembers).values({
      versionId, teamId, participantId, memberId, displayNameSnapshot: member.fullName,
      seedTierSnapshot: seedTier,
      goalkeeperAvailableSnapshot: assignedAsGoalkeeper || Boolean(memberProfile?.desiredPositions?.includes("GOALKEEPER")),
      assignedAsGoalkeeper,
      recentMatchCountSnapshot: stat?.matchCount ?? 0,
      recentLossCountSnapshot: stat?.lossCount ?? 0,
      recentLossRateSnapshot: stat?.lossRate ?? null,
      formScoreSnapshot: stat?.formScore ?? 5000,
      formConfidenceSnapshot: stat?.formConfidence ?? 0,
      inferredMatchCountSnapshot: stat?.inferredMatchCount ?? 0,
      desiredPositionsSnapshot: memberProfile?.desiredPositions ?? [],
      playerStrengthSnapshot: memberProfile?.playerStrength ?? null,
      displayOrder: (latestOrder?.displayOrder ?? -1) + 1,
    });
    await tx.update(matchTeams).set({
      memberCount: team.memberCount + 1,
      goalkeeperCount: team.goalkeeperCount + Number(assignedAsGoalkeeper),
      outfieldSkillScore: Math.round(team.outfieldSkillScore + tierWeight),
      recentLossScore: Math.round(team.recentLossScore + (10_000 - (stat?.formScore ?? 5000)) * (assignedAsGoalkeeper ? 0.15 : 1)),
      formScoreTotal: Math.round(team.formScoreTotal + (stat?.formScore ?? 5000) * (assignedAsGoalkeeper ? 0.15 : 1)),
      lowFormCount: team.lowFormCount + (stat?.lowForm && !assignedAsGoalkeeper ? 1 : 0),
    }).where(eq(matchTeams.id, teamId));
    if (placement && applyResult) {
      await tx.delete(memberMatchStats).where(and(eq(memberMatchStats.matchId, matchId), eq(memberMatchStats.memberId, memberId)));
      await tx.insert(memberMatchStats).values({
        clubId: actor.clubId, memberId, matchId, teamVersionId: versionId, teamId,
        playedOn: match.playedOn, teamCount: allTeams.length, placement,
        isTied: tiedCount > 1, result: placement === 1 ? "WIN" : "LOSS", source: "RECORDED",
        placementScore: placementFormScore(allTeams.length, placement), formulaVersion: FORMULA_VERSION,
        calculatedAt: now, createdBy: actor.id, updatedAt: now,
      });
    }
    if (placement && applyPenalty && penaltyQuantity > 0 && penaltyType) {
      await tx.insert(memberCharges).values({
        clubId: actor.clubId, memberId, chargeTypeId: penaltyType.id, matchId, source: "MATCH",
        chargeDate: match.playedOn, quantity: penaltyQuantity, unitAmount: penaltyType.defaultAmount,
        totalAmount: penaltyQuantity * penaltyType.defaultAmount, isLossPenaltySnapshot: true,
        note: `Bổ sung sau trận · hạng ${placement} · phạt ${penaltyQuantity} lần · trận ${match.playedOn}`,
        createdBy: actor.id,
      });
    }
    await tx.insert(activityLogs).values({
      clubId: actor.clubId, entityType: "match", entityId: matchId, action: "UPDATE", actorId: actor.id,
      afterData: { memberId, memberName: member.fullName, teamId, teamName: team.name, seedTier, assignedAsGoalkeeper, placement, penaltyQuantity: applyPenalty ? penaltyQuantity : 0, appliedResult: applyResult },
      message: `Bổ sung ${member.fullName} vào ${team.name}${reason ? ` · ${reason}` : ""}`,
    });
  });

  revalidatePath(`/matches/${matchId}`); revalidatePath(`/matches/${matchId}/teams`); revalidatePath("/matches");
  revalidatePath("/charges"); revalidatePath("/dashboard"); revalidatePath("/reports"); revalidatePath(`/members/${memberId}`);
  if (match.publicLineupToken) revalidatePath(`/lineup/${match.publicLineupToken}`);
  return { ok: true, message: `Đã bổ sung ${member.fullName} vào ${team.name}.` };
}
