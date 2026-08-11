"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activityLogs,
  chargeTypes,
  matches,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberCharges,
  memberMatchStats,
} from "@/db/schema";
import { PERMISSIONS } from "@/lib/constants";
import { FORMULA_VERSION, placementFormScore } from "@/lib/form-score";
import { requirePermission } from "@/lib/permissions";

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
  for (const team of teams) {
    const place = Number(str(formData, `place:${team.id}`));
    if (!Number.isInteger(place) || place < 1 || place > teams.length) {
      return { ok: false, message: `Thứ hạng của ${team.name} không hợp lệ.` };
    }
    placements.set(team.id, place);
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
  const placementCounts = [...placements.values()].reduce((counts, place) => counts.set(place, (counts.get(place) ?? 0) + 1), new Map<number, number>());
  const now = new Date();
  const newMetrics = {
    ...oldMetrics,
    placements: placementByName,
    resultChargeTypeId: chargeTypeId,
    resultRecordedAt: now.toISOString(),
    resultRecordedBy: actor.id,
  };
  const penaltyRows = teamMembers.flatMap((row) => {
    const place = placements.get(row.teamId);
    if (!row.memberId || !place || place === 1) return [];
    const quantity = place - 1;
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
      note: `Kết quả hạng ${place} · trận ${match.playedOn}`,
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
      beforeData: { placements: oldMetrics.placements, resultChargeTypeId: oldMetrics.resultChargeTypeId },
      afterData: { placements: placementByName, resultChargeTypeId: chargeTypeId, penaltyCount: penaltyRows.length, statCount: statRows.length },
      message: `Ghi nhận kết quả trận: ${teams.map((team) => `${team.name} hạng ${placements.get(team.id)}`).join(", ")}`,
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
