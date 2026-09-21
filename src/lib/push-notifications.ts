import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import {
  matchParticipants,
  matchRsvps,
  matchTeamMembers,
  members,
  notificationEvents,
  pushSubscriptions,
  users,
} from "@/db/schema";

export type PushEventType =
  | "MATCH_CREATED"
  | "MATCH_UPDATED"
  | "MATCH_CANCELLED"
  | "MATCH_TEAM_CONFIRMED"
  | "MATCH_RESULT_RECORDED"
  | "MEMBER_CHARGE_CREATED"
  | "MEMBER_PAYMENT_RECORDED"
  | "TEST_NOTIFICATION";

type NotifyInput = {
  clubId: string;
  userIds: string[];
  type: PushEventType;
  title: string;
  body: string;
  url: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
};

type PushPayload = {
  type: PushEventType;
  title: string;
  body: string;
  url: string;
  entityId?: string;
};

let vapidReady = false;

function configureVapid() {
  if (vapidReady) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

async function dispatchEvent(event: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  url: string;
  entityId: string | null;
}) {
  if (!configureVapid()) {
    await db.update(notificationEvents)
      .set({ status: "SKIPPED", updatedAt: new Date() })
      .where(eq(notificationEvents.id, event.id));
    return;
  }

  const subscriptions = await db.select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, event.userId), eq(pushSubscriptions.enabled, true)));

  if (!subscriptions.length) {
    await db.update(notificationEvents)
      .set({ status: "SKIPPED", updatedAt: new Date() })
      .where(eq(notificationEvents.id, event.id));
    return;
  }

  const payload: PushPayload = {
    type: event.type as PushEventType,
    title: event.title,
    body: event.body,
    url: event.url,
    entityId: event.entityId ?? undefined,
  };

  let successCount = 0;
  let failureCount = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime ?? null,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });

      successCount += 1;
      await db.update(pushSubscriptions).set({
        lastSuccessAt: new Date(),
        lastSeenAt: new Date(),
        failureCount: 0,
        updatedAt: new Date(),
      }).where(eq(pushSubscriptions.id, subscription.id));
    } catch (error) {
      failureCount += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      await db.update(pushSubscriptions).set({
        enabled: statusCode === 404 || statusCode === 410 ? false : subscription.enabled,
        lastFailureAt: new Date(),
        failureCount: subscription.failureCount + 1,
        updatedAt: new Date(),
      }).where(eq(pushSubscriptions.id, subscription.id));
    }
  }

  await db.update(notificationEvents).set({
    status: successCount === 0 ? "FAILED" : failureCount === 0 ? "SENT" : "PARTIAL",
    sentAt: successCount > 0 ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(notificationEvents.id, event.id));
}

export async function notifyUsers(input: NotifyInput) {
  const userIds = [...new Set(input.userIds)];
  if (!userIds.length) return;

  const subscribedUsers = await db.select({ id: users.id })
    .from(users)
    .innerJoin(pushSubscriptions, and(
      eq(pushSubscriptions.userId, users.id),
      eq(pushSubscriptions.enabled, true),
    ))
    .where(and(
      eq(users.clubId, input.clubId),
      eq(users.isActive, true),
      inArray(users.id, userIds),
    ));
  const allowedIds = new Set(subscribedUsers.map((row) => row.id));

  await Promise.allSettled(userIds
    .filter((userId) => allowedIds.has(userId))
    .map(async (userId) => {
      const [event] = await db.insert(notificationEvents).values({
        clubId: input.clubId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: `${input.dedupeKey}:${userId}`,
      }).onConflictDoNothing().returning({
        id: notificationEvents.id,
        userId: notificationEvents.userId,
        type: notificationEvents.type,
        title: notificationEvents.title,
        body: notificationEvents.body,
        url: notificationEvents.url,
        entityId: notificationEvents.entityId,
      });

      if (!event) return;
      try {
        await dispatchEvent(event);
      } catch {
        await db.update(notificationEvents)
          .set({ status: "FAILED", updatedAt: new Date() })
          .where(eq(notificationEvents.id, event.id));
      }
    }));
}

export async function activeMemberUserIdsForClub(clubId: string) {
  const rows = await db.select({ userId: users.id })
    .from(users)
    .innerJoin(members, eq(users.memberId, members.id))
    .where(and(
      eq(users.clubId, clubId),
      eq(users.isActive, true),
      eq(members.status, "ACTIVE"),
    ));
  return rows.map((row) => row.userId);
}

export async function userIdsForMembers(clubId: string, memberIds: string[]) {
  const uniqueMemberIds = [...new Set(memberIds)];
  if (!uniqueMemberIds.length) return [];
  const rows = await db.select({ userId: users.id })
    .from(users)
    .where(and(
      eq(users.clubId, clubId),
      eq(users.isActive, true),
      inArray(users.memberId, uniqueMemberIds),
    ));
  return rows.map((row) => row.userId);
}

export async function userIdsForMatchAudience(clubId: string, matchId: string) {
  const [rsvps, participants] = await Promise.all([
    db.select({ memberId: matchRsvps.memberId }).from(matchRsvps).where(eq(matchRsvps.matchId, matchId)),
    db.select({ memberId: matchParticipants.memberId }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId)),
  ]);
  return userIdsForMembers(
    clubId,
    [...rsvps.map((row) => row.memberId), ...participants.flatMap((row) => row.memberId ? [row.memberId] : [])],
  );
}

export async function userIdsForTeamVersion(clubId: string, versionId: string) {
  const rows = await db.select({ memberId: matchTeamMembers.memberId })
    .from(matchTeamMembers)
    .where(eq(matchTeamMembers.versionId, versionId));
  return userIdsForMembers(clubId, rows.flatMap((row) => row.memberId ? [row.memberId] : []));
}
