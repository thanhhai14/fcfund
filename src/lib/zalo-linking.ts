import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  authIdentities,
  clubs,
  members,
  users,
  zaloLinkRequests,
} from "@/db/schema";
import type { ZaloProfile } from "@/lib/zalo-auth";
import {
  passesZaloNameMatchThreshold,
  zaloNameSimilarity,
} from "@/lib/zalo-name-matching";
import { getZaloPresetMemberCode } from "@/lib/zalo-name-presets";
import { notifyUsers } from "@/lib/push-notifications";

export const ZALO_LINK_CONTEXT_COOKIE = "zalo_link_context";
export const ZALO_PENDING_COOKIE = "zalo_pending";
export const ZALO_LINK_CONTEXT_MAX_AGE = 10 * 60;
export const ZALO_PENDING_MAX_AGE = 60 * 60 * 24 * 30;

type ZaloLinkContext = {
  providerUserId: string;
  displayName: string;
  pictureUrl: string | null;
  clubId: string;
  candidateUserId: string;
};

type ZaloPendingSession = {
  requestId: string;
  providerUserId: string;
};

function signingSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET chưa được cấu hình.");
  }
  return new TextEncoder().encode(value ?? "development-only-secret-change-me-please");
}

export function maskPhone(phone: string) {
  if (phone.length <= 3) return "***";
  return `***${phone.slice(-3)}`;
}

export async function resolveZaloClubId() {
  const configured = process.env.ZALO_CLUB_ID?.trim();
  if (configured) {
    const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, configured)).limit(1);
    if (!club) throw new Error("ZALO_CLUB_ID không tồn tại trong database.");
    return club.id;
  }

  const rows = await db.select({ id: clubs.id }).from(clubs).limit(2);
  if (rows.length === 1) return rows[0].id;
  if (!rows.length) throw new Error("Chưa có club để xử lý Zalo Login.");
  throw new Error("Có nhiều club. Cần cấu hình ZALO_CLUB_ID để tránh link nhầm.");
}

export async function findLinkedZaloUser(providerUserId: string) {
  const [row] = await db
    .select({
      identityId: authIdentities.id,
      userId: users.id,
      clubId: users.clubId,
      memberId: users.memberId,
      role: users.role,
      isActive: users.isActive,
    })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(
      eq(authIdentities.provider, "ZALO"),
      eq(authIdentities.providerUserId, providerUserId),
    ))
    .limit(1);
  return row ?? null;
}

export async function findPendingZaloRequest(providerUserId: string) {
  const [request] = await db
    .select()
    .from(zaloLinkRequests)
    .where(and(
      eq(zaloLinkRequests.providerUserId, providerUserId),
      eq(zaloLinkRequests.status, "PENDING"),
    ))
    .orderBy(desc(zaloLinkRequests.createdAt))
    .limit(1);
  return request ?? null;
}

export async function findBestZaloCandidate(clubId: string, displayName: string) {
  const candidates = await db
    .select({
      userId: users.id,
      memberId: members.id,
      memberName: members.fullName,
      memberCode: members.code,
      phone: users.phoneNormalized,
    })
    .from(users)
    .innerJoin(members, eq(users.memberId, members.id))
    .leftJoin(authIdentities, and(
      eq(authIdentities.userId, users.id),
      eq(authIdentities.provider, "ZALO"),
    ))
    .where(and(
      eq(users.clubId, clubId),
      eq(users.isActive, true),
      eq(members.status, "ACTIVE"),
      isNull(authIdentities.id),
    ));

  const presetMemberCode = getZaloPresetMemberCode(displayName);
  if (presetMemberCode) {
    const presetCandidate = candidates.find((candidate) => candidate.memberCode === presetMemberCode);
    if (!presetCandidate) return null;
    return { ...presetCandidate, score: 1 };
  }

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: zaloNameSimilarity(displayName, candidate.memberName),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best) return null;

  const second = ranked[1];
  if (!passesZaloNameMatchThreshold(best.score, second?.score)) return null;

  return best;
}

export async function notifyZaloLinkRequestAdmins(input: {
  clubId: string;
  requestId: string;
  displayName: string;
}) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.clubId, input.clubId),
      eq(users.role, "ADMIN"),
      eq(users.isActive, true),
    ));

  await notifyUsers({
    clubId: input.clubId,
    userIds: admins.map((admin) => admin.id),
    type: "ZALO_LINK_REQUEST",
    title: "Có thành viên Zalo đang chờ duyệt",
    body: `${input.displayName} đang chờ Chủ Tịch Fifa xác nhận vào Liên đoàn.`,
    url: "/settings/zalo-requests",
    entityType: "zalo_link_request",
    entityId: input.requestId,
    dedupeKey: `ZALO_LINK_REQUEST:${input.requestId}`,
  });
}

export async function createOrReuseZaloLinkRequest(clubId: string, profile: ZaloProfile) {
  const existing = await findPendingZaloRequest(profile.id);
  if (existing) return { request: existing, created: false };

  const [created] = await db
    .insert(zaloLinkRequests)
    .values({
      clubId,
      providerUserId: profile.id,
      displayName: profile.name,
      avatarUrl: profile.pictureUrl,
      status: "PENDING",
    })
    .onConflictDoNothing()
    .returning();

  if (created) return { request: created, created: true };

  const concurrent = await findPendingZaloRequest(profile.id);
  if (!concurrent) throw new Error("Không thể tạo yêu cầu liên kết Zalo.");
  return { request: concurrent, created: false };
}

export async function createZaloLinkContextToken(input: ZaloLinkContext) {
  return new SignJWT({
    kind: "zalo_link",
    providerUserId: input.providerUserId,
    displayName: input.displayName,
    pictureUrl: input.pictureUrl,
    clubId: input.clubId,
    candidateUserId: input.candidateUserId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ZALO_LINK_CONTEXT_MAX_AGE}s`)
    .sign(signingSecret());
}

export async function readZaloLinkContextToken(token: string | undefined | null): Promise<ZaloLinkContext | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingSecret());
    if (
      payload.kind !== "zalo_link"
      || typeof payload.providerUserId !== "string"
      || typeof payload.displayName !== "string"
      || typeof payload.clubId !== "string"
      || typeof payload.candidateUserId !== "string"
    ) return null;

    return {
      providerUserId: payload.providerUserId,
      displayName: payload.displayName,
      pictureUrl: typeof payload.pictureUrl === "string" ? payload.pictureUrl : null,
      clubId: payload.clubId,
      candidateUserId: payload.candidateUserId,
    };
  } catch {
    return null;
  }
}

export async function readZaloLinkContext() {
  const token = (await cookies()).get(ZALO_LINK_CONTEXT_COOKIE)?.value;
  return readZaloLinkContextToken(token);
}

export async function createZaloPendingToken(input: ZaloPendingSession) {
  return new SignJWT({
    kind: "zalo_pending",
    requestId: input.requestId,
    providerUserId: input.providerUserId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ZALO_PENDING_MAX_AGE}s`)
    .sign(signingSecret());
}

export async function readZaloPendingToken(token: string | undefined | null): Promise<ZaloPendingSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingSecret());
    if (
      payload.kind !== "zalo_pending"
      || typeof payload.requestId !== "string"
      || typeof payload.providerUserId !== "string"
    ) return null;

    return {
      requestId: payload.requestId,
      providerUserId: payload.providerUserId,
    };
  } catch {
    return null;
  }
}

export async function readZaloPendingSession() {
  const token = (await cookies()).get(ZALO_PENDING_COOKIE)?.value;
  return readZaloPendingToken(token);
}

export function zaloLinkCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ZALO_LINK_CONTEXT_MAX_AGE,
  };
}

export function zaloPendingCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ZALO_PENDING_MAX_AGE,
  };
}
