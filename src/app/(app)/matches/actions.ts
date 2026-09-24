"use server";

import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activityLogs,
  matches,
  matchParticipants,
  matchRsvps,
  matchTeamVersions,
  members,
} from "@/db/schema";
import { PERMISSIONS } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getMatchLifecycle, isMatchRsvpClosed } from "@/lib/match-lifecycle";
import { isActiveSeedTier, type SeedTier } from "@/lib/seed-tier";
import { activeMemberUserIdsForClub, notifyUsers, userIdsWithoutMatchResponse } from "@/lib/push-notifications";

export type MatchRsvpResult = { ok: boolean; message: string };

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function isRsvpClosed(matchId: string, clubId: string) {
  const lifecycle = await getMatchLifecycle(matchId, clubId);
  return !lifecycle || isMatchRsvpClosed(lifecycle);
}

async function getMatchRsvpCounts(clubId: string, matchId: string) {
  const [activeMembers, participants, rsvps] = await Promise.all([
    db.select({ id: members.id })
      .from(members)
      .where(and(eq(members.clubId, clubId), eq(members.status, "ACTIVE"))),
    db.select({ memberId: matchParticipants.memberId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId)),
    db.select({ memberId: matchRsvps.memberId, status: matchRsvps.status })
      .from(matchRsvps)
      .where(eq(matchRsvps.matchId, matchId)),
  ]);

  const activeIds = new Set(activeMembers.map((row) => row.id));
  const goingIds = new Set(
    participants.flatMap((row) => row.memberId && activeIds.has(row.memberId) ? [row.memberId] : []),
  );
  const notGoingIds = new Set(
    rsvps.flatMap((row) =>
      row.status === "NOT_GOING" && activeIds.has(row.memberId) && !goingIds.has(row.memberId)
        ? [row.memberId]
        : [],
    ),
  );

  return {
    going: goingIds.size,
    notGoing: notGoingIds.size,
    pending: Math.max(0, activeIds.size - goingIds.size - notGoingIds.size),
  };
}

function rsvpCountText(counts: { going: number; notGoing: number; pending: number }) {
  return `Tham gia: ${counts.going} · Không tham gia: ${counts.notGoing} · Chưa bình chọn: ${counts.pending}`;
}

async function latestSeedForMember(memberId: string, clubId: string, currentMatchId: string): Promise<SeedTier | null> {
  const rows = await db
    .select({ seedTier: matchParticipants.seedTier })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(and(
      eq(matchParticipants.memberId, memberId),
      eq(matches.clubId, clubId),
      ne(matches.id, currentMatchId),
      isNull(matches.deletedAt),
      isNull(matches.hiddenAt),
      isNotNull(matchParticipants.seedTier),
    ))
    .orderBy(desc(matches.playedOn))
    .limit(20);

  return rows.map((row) => row.seedTier).find(isActiveSeedTier) ?? null;
}

export async function setMyMatchRsvpAction(formData: FormData): Promise<MatchRsvpResult> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_VIEW);
  if (!actor.memberId) {
    return { ok: false, message: "Tài khoản của bạn chưa được liên kết với thành viên." };
  }

  const matchId = str(formData, "matchId");
  const status = str(formData, "status");
  if (status !== "GOING" && status !== "NOT_GOING") {
    return { ok: false, message: "Lựa chọn tham gia không hợp lệ." };
  }

  const [match] = await db
    .select({ id: matches.id, playedOn: matches.playedOn })
    .from(matches)
    .where(and(
      eq(matches.id, matchId),
      eq(matches.clubId, actor.clubId),
      isNull(matches.deletedAt),
      isNull(matches.hiddenAt),
    ))
    .limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };

  const [member] = await db
    .select({ id: members.id, fullName: members.fullName })
    .from(members)
    .where(and(
      eq(members.id, actor.memberId),
      eq(members.clubId, actor.clubId),
      eq(members.status, "ACTIVE"),
    ))
    .limit(1);
  if (!member) return { ok: false, message: "Thành viên của bạn không còn hoạt động." };

  if (await isRsvpClosed(matchId, actor.clubId)) {
    return { ok: false, message: "Bình chọn đã đóng vì trận đã được chia đội." };
  }

  const goalkeeperAvailable = status === "GOING" && formData.get("goalkeeperAvailable") === "on";
  const [existingRsvp] = await db
    .select()
    .from(matchRsvps)
    .where(and(eq(matchRsvps.matchId, matchId), eq(matchRsvps.memberId, member.id)))
    .limit(1);
  const [existingParticipant] = await db
    .select()
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.memberId, member.id)))
    .limit(1);

  const latestSeed = status === "GOING" && !isActiveSeedTier(existingParticipant?.seedTier)
    ? await latestSeedForMember(member.id, actor.clubId, matchId)
    : null;

  const participantWillChange = status === "GOING"
    ? !existingParticipant
      || existingParticipant.goalkeeperAvailable !== goalkeeperAvailable
      || (!isActiveSeedTier(existingParticipant.seedTier) && Boolean(latestSeed))
    : Boolean(existingParticipant);

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(matchRsvps)
      .values({
        matchId,
        memberId: member.id,
        status,
        goalkeeperAvailable: status === "GOING" ? goalkeeperAvailable : false,
        source: "SELF",
        respondedBy: actor.id,
        respondedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [matchRsvps.matchId, matchRsvps.memberId],
        set: {
          status,
          goalkeeperAvailable: status === "GOING" ? goalkeeperAvailable : false,
          source: "SELF",
          respondedBy: actor.id,
          respondedAt: now,
          updatedAt: now,
        },
      });

    if (status === "GOING") {
      if (existingParticipant) {
        await tx
          .update(matchParticipants)
          .set({
            goalkeeperAvailable,
            ...(!isActiveSeedTier(existingParticipant.seedTier) && latestSeed ? { seedTier: latestSeed } : {}),
          })
          .where(eq(matchParticipants.id, existingParticipant.id));
      } else {
        await tx.insert(matchParticipants).values({
          matchId,
          memberId: member.id,
          seedTier: latestSeed,
          goalkeeperAvailable,
        });
      }
    } else if (existingParticipant) {
      await tx.delete(matchParticipants).where(eq(matchParticipants.id, existingParticipant.id));
    }

    if (participantWillChange) {
      await tx.delete(matchTeamVersions).where(and(
        eq(matchTeamVersions.matchId, matchId),
        eq(matchTeamVersions.status, "DRAFT"),
      ));
    }

    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match_rsvp",
      entityId: matchId,
      action: existingRsvp ? "UPDATE" : "CREATE",
      actorId: actor.id,
      beforeData: existingRsvp ?? null,
      afterData: {
        memberId: member.id,
        status,
        goalkeeperAvailable,
        copiedSeedTier: latestSeed,
      },
      message: status === "GOING"
        ? `${member.fullName} xác nhận tham gia trận ${match.playedOn}${goalkeeperAvailable ? " và có thể chụp gôn" : ""}`
        : `${member.fullName} xác nhận không tham gia trận ${match.playedOn}`,
    });
  });

  const statusChanged = existingRsvp?.status !== status;
  if (statusChanged) {
    try {
      const counts = await getMatchRsvpCounts(actor.clubId, matchId);
      const recipientIds = (await activeMemberUserIdsForClub(actor.clubId))
        .filter((userId) => userId !== actor.id);
      const previousLabel = existingRsvp?.status === "GOING"
        ? "Tham gia"
        : existingRsvp?.status === "NOT_GOING"
          ? "Không tham gia"
          : null;
      const nextLabel = status === "GOING" ? "Tham gia" : "Không tham gia";
      await notifyUsers({
        clubId: actor.clubId,
        userIds: recipientIds,
        type: "MATCH_RSVP_UPDATED",
        title: `${member.fullName} đã bình chọn`,
        body: previousLabel
          ? `${member.fullName} đổi bình chọn: ${previousLabel} → ${nextLabel}. ${rsvpCountText(counts)}.`
          : `${member.fullName}: ${nextLabel} trận ngày ${match.playedOn}. ${rsvpCountText(counts)}.`,
        url: `/matches?rsvp=${matchId}`,
        entityType: "match_rsvp",
        entityId: matchId,
        dedupeKey: `MATCH_RSVP_UPDATED:${matchId}:${member.id}:${now.getTime()}`,
      });
    } catch {
      // Push failures must not affect RSVP.
    }
  }

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/teams`);

  if (status === "GOING") {
    return {
      ok: true,
      message: latestSeed
        ? `Đã đăng ký tham gia. Seed gần nhất (${latestSeed.replace("TIER_", "Tier ")}) đã được tự động áp dụng.`
        : "Đã đăng ký tham gia.",
    };
  }
  return { ok: true, message: "Đã ghi nhận bạn không tham gia trận này." };
}

export async function remindMatchRsvpAction(formData: FormData): Promise<MatchRsvpResult> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_MANAGE);
  if (!["ORGANIZER", "TREASURER", "ADMIN"].includes(actor.role)) {
    return { ok: false, message: "Bạn không có quyền gửi nhắc bình chọn." };
  }

  const matchId = str(formData, "matchId");
  const [match] = await db
    .select({ id: matches.id, playedOn: matches.playedOn })
    .from(matches)
    .where(and(
      eq(matches.id, matchId),
      eq(matches.clubId, actor.clubId),
      isNull(matches.deletedAt),
      isNull(matches.hiddenAt),
    ))
    .limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  if (await isRsvpClosed(matchId, actor.clubId)) {
    return { ok: false, message: "Bình chọn đã đóng vì trận đã được chia đội." };
  }

  const recipientIds = await userIdsWithoutMatchResponse(actor.clubId, matchId);
  if (!recipientIds.length) {
    return { ok: true, message: "Không còn thành viên nào chưa bình chọn." };
  }

  const now = new Date();
  const counts = await getMatchRsvpCounts(actor.clubId, matchId);
  try {
    await notifyUsers({
      clubId: actor.clubId,
      userIds: recipientIds,
      type: "MATCH_RSVP_REMINDER",
      title: "Nhắc bình chọn tham gia",
      body: `Hãy bình chọn tham gia trận ngày ${match.playedOn}. ${rsvpCountText(counts)}.`,
      url: `/matches?rsvp=${matchId}`,
      entityType: "match_rsvp",
      entityId: matchId,
      dedupeKey: `MATCH_RSVP_REMINDER:${matchId}:${now.getTime()}`,
    });
  } catch {
    return { ok: false, message: "Không thể gửi thông báo nhắc bình chọn." };
  }

  await db.insert(activityLogs).values({
    clubId: actor.clubId,
    entityType: "match_rsvp",
    entityId: matchId,
    action: "UPDATE",
    actorId: actor.id,
    afterData: { reminderRecipientCount: recipientIds.length },
    message: `${actor.displayName} đã gửi nhắc bình chọn cho ${recipientIds.length} thành viên chưa trả lời`,
  });

  revalidatePath("/matches");
  return { ok: true, message: `Đã gửi nhắc bình chọn tới ${recipientIds.length} thành viên.` };
}

export async function hideMatchAction(formData: FormData): Promise<MatchRsvpResult> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_MANAGE);
  if (actor.role !== "ADMIN") return { ok: false, message: "Chỉ Admin được ẩn trận khỏi giao diện." };

  const matchId = str(formData, "matchId");
  const [match] = await db.select({
    id: matches.id,
    playedOn: matches.playedOn,
    note: matches.note,
    publicLineupEnabled: matches.publicLineupEnabled,
    publicLineupToken: matches.publicLineupToken,
    hiddenAt: matches.hiddenAt,
  }).from(matches).where(and(
    eq(matches.id, matchId),
    eq(matches.clubId, actor.clubId),
  )).limit(1);

  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  if (match.hiddenAt) return { ok: true, message: "Trận này đã được ẩn khỏi giao diện." };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(matches).set({
      hiddenAt: now,
      hiddenBy: actor.id,
      publicLineupEnabled: false,
      updatedAt: now,
    }).where(eq(matches.id, matchId));

    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match",
      entityId: matchId,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: { hiddenAt: null, publicLineupEnabled: match.publicLineupEnabled },
      afterData: { hiddenAt: now.toISOString(), publicLineupEnabled: false, chargesChanged: false },
      message: `Ẩn trận ngày ${match.playedOn} khỏi giao diện`,
    });
  });

  revalidatePath("/matches");
  revalidatePath("/dashboard");
  revalidatePath(`/matches/${matchId}`);
  if (match.publicLineupToken) revalidatePath(`/lineup/${match.publicLineupToken}`);
  return { ok: true, message: "Đã ẩn trận khỏi giao diện. Các khoản thu không thay đổi." };
}

export async function restoreHiddenMatchAction(formData: FormData): Promise<MatchRsvpResult> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_MANAGE);
  if (actor.role !== "ADMIN") return { ok: false, message: "Chỉ Admin được khôi phục trận đã ẩn." };

  const matchId = str(formData, "matchId");
  const [match] = await db.select({
    id: matches.id,
    playedOn: matches.playedOn,
    hiddenAt: matches.hiddenAt,
    hiddenBy: matches.hiddenBy,
  }).from(matches).where(and(
    eq(matches.id, matchId),
    eq(matches.clubId, actor.clubId),
  )).limit(1);

  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  if (!match.hiddenAt) return { ok: true, message: "Trận này đang hiển thị bình thường." };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(matches).set({
      hiddenAt: null,
      hiddenBy: null,
      updatedAt: now,
    }).where(eq(matches.id, matchId));

    await tx.insert(activityLogs).values({
      clubId: actor.clubId,
      entityType: "match",
      entityId: matchId,
      action: "RESTORE",
      actorId: actor.id,
      beforeData: { hiddenAt: match.hiddenAt, hiddenBy: match.hiddenBy },
      afterData: { hiddenAt: null, chargesChanged: false },
      message: `Khôi phục trận ngày ${match.playedOn} về danh sách`,
    });
  });

  revalidatePath("/matches");
  revalidatePath("/dashboard");
  return { ok: true, message: "Đã khôi phục trận về giao diện. Các khoản thu không thay đổi." };
}
