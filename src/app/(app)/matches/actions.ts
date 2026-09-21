"use server";

import { and, desc, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
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
import { isActiveSeedTier, type SeedTier } from "@/lib/seed-tier";
import { activeMemberUserIdsForClub, notifyUsers, userIdsWithoutMatchResponse } from "@/lib/push-notifications";

export type MatchRsvpResult = { ok: boolean; message: string };

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function isRsvpClosed(matchId: string) {
  const [drawn] = await db
    .select({ id: matchTeamVersions.id })
    .from(matchTeamVersions)
    .where(and(
      eq(matchTeamVersions.matchId, matchId),
      or(
        eq(matchTeamVersions.status, "CONFIRMED"),
        isNotNull(matchTeamVersions.randomKey),
        isNotNull(matchTeamVersions.initialDrawSnapshot),
      ),
    ))
    .limit(1);
  return Boolean(drawn);
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

  if (await isRsvpClosed(matchId)) {
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
          ? `${member.fullName} đổi bình chọn: ${previousLabel} → ${nextLabel}.`
          : `${member.fullName}: ${nextLabel} trận ngày ${match.playedOn}.`,
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
  if (actor.role !== "ORGANIZER") {
    return { ok: false, message: "Chỉ Người tổ chức mới có thể gửi nhắc bình chọn." };
  }

  const matchId = str(formData, "matchId");
  const [match] = await db
    .select({ id: matches.id, playedOn: matches.playedOn })
    .from(matches)
    .where(and(
      eq(matches.id, matchId),
      eq(matches.clubId, actor.clubId),
      isNull(matches.deletedAt),
    ))
    .limit(1);
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu." };
  if (await isRsvpClosed(matchId)) {
    return { ok: false, message: "Bình chọn đã đóng vì trận đã được chia đội." };
  }

  const recipientIds = await userIdsWithoutMatchResponse(actor.clubId, matchId);
  if (!recipientIds.length) {
    return { ok: true, message: "Không còn thành viên nào chưa bình chọn." };
  }

  const now = new Date();
  try {
    await notifyUsers({
      clubId: actor.clubId,
      userIds: recipientIds,
      type: "MATCH_RSVP_REMINDER",
      title: "Nhắc bình chọn tham gia",
      body: `Hãy bình chọn tham gia trận ngày ${match.playedOn}.`,
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
