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
  | "MATCH_RSVP_UPDATED"
  | "MATCH_RSVP_REMINDER"
  | "ZALO_LINK_REQUEST"
  | "DEBT_REMINDER"
  | "DEBT_REMINDER_TEST"
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
  eventId: string;
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

async function deliverToSubscription(
  subscription: typeof pushSubscriptions.$inferSelect,
  payload: PushPayload,
) {
  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });

    const now = new Date();
    await db.update(pushSubscriptions).set({
      lastSuccessAt: now,
      lastSeenAt: now,
      failureCount: 0,
      updatedAt: now,
    }).where(eq(pushSubscriptions.id, subscription.id));
    return true;
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : 0;
    await db.update(pushSubscriptions).set({
      enabled: statusCode === 404 || statusCode === 410 ? false : subscription.enabled,
      lastFailureAt: new Date(),
      failureCount: subscription.failureCount + 1,
      updatedAt: new Date(),
    }).where(eq(pushSubscriptions.id, subscription.id));
    return false;
  }
}

export async function dispatchEvent(event: {
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
    eventId: event.id,
    type: event.type as PushEventType,
    title: event.title,
    body: event.body,
    url: event.url,
    entityId: event.entityId ?? undefined,
  };

  let successCount = 0;
  let failureCount = 0;

  for (const subscription of subscriptions) {
    if (await deliverToSubscription(subscription, payload)) successCount += 1;
    else failureCount += 1;
  }

  await db.update(notificationEvents).set({
    status: successCount === 0 ? "FAILED" : failureCount === 0 ? "SENT" : "PARTIAL",
    sentAt: successCount > 0 ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(notificationEvents.id, event.id));
}

export async function notifyDevice(input: {
  clubId: string;
  userId: string;
  subscriptionId: string;
  title: string;
  body: string;
  url?: string;
}) {
  const [subscription] = await db.select()
    .from(pushSubscriptions)
    .where(and(
      eq(pushSubscriptions.id, input.subscriptionId),
      eq(pushSubscriptions.userId, input.userId),
      eq(pushSubscriptions.enabled, true),
    ))
    .limit(1);

  if (!subscription) return { ok: false, status: "NOT_AVAILABLE" as const };

  const [event] = await db.insert(notificationEvents).values({
    clubId: input.clubId,
    userId: input.userId,
    type: "TEST_NOTIFICATION",
    title: input.title,
    body: input.body,
    url: input.url ?? "/settings",
    entityType: "push_device_test",
    dedupeKey: `PUSH_DEVICE_TEST:${input.subscriptionId}:${Date.now()}`,
  }).returning({
    id: notificationEvents.id,
    userId: notificationEvents.userId,
    type: notificationEvents.type,
    title: notificationEvents.title,
    body: notificationEvents.body,
    url: notificationEvents.url,
    entityId: notificationEvents.entityId,
  });

  if (!event) return { ok: false, status: "FAILED" as const };

  if (!configureVapid()) {
    await db.update(notificationEvents)
      .set({ status: "SKIPPED", updatedAt: new Date() })
      .where(eq(notificationEvents.id, event.id));
    return { ok: false, status: "SKIPPED" as const };
  }

  const sent = await deliverToSubscription(subscription, {
    eventId: event.id,
    type: "TEST_NOTIFICATION",
    title: event.title,
    body: event.body,
    url: event.url,
  });

  await db.update(notificationEvents).set({
    status: sent ? "SENT" : "FAILED",
    sentAt: sent ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(notificationEvents.id, event.id));

  return { ok: sent, status: sent ? "SENT" as const : "FAILED" as const };
}

export async function notifyUsers(input: NotifyInput) {
  const userIds = [...new Set(input.userIds)];
  if (!userIds.length) return;

  const activeUsers = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.clubId, input.clubId),
      eq(users.isActive, true),
      inArray(users.id, userIds),
    ));
  const allowedIds = new Set(activeUsers.map((row) => row.id));

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

export async function userIdsWithoutMatchResponse(clubId: string, matchId: string) {
  const [candidates, rsvps, participants] = await Promise.all([
    db.select({ userId: users.id, memberId: users.memberId })
      .from(users)
      .innerJoin(members, eq(users.memberId, members.id))
      .where(and(
        eq(users.clubId, clubId),
        eq(users.isActive, true),
        eq(members.status, "ACTIVE"),
      )),
    db.select({ memberId: matchRsvps.memberId })
      .from(matchRsvps)
      .where(eq(matchRsvps.matchId, matchId)),
    db.select({ memberId: matchParticipants.memberId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId)),
  ]);

  const respondedMemberIds = new Set([
    ...rsvps.map((row) => row.memberId),
    ...participants.flatMap((row) => row.memberId ? [row.memberId] : []),
  ]);

  return candidates
    .filter((row) => row.memberId && !respondedMemberIds.has(row.memberId))
    .map((row) => row.userId);
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
