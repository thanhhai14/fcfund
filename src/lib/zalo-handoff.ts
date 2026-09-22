import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { zaloAuthHandoffs } from "@/db/schema";
import {
  buildZaloAuthorizationUrl,
  createZaloCodeChallenge,
  createZaloCodeVerifier,
  createZaloOAuthState,
  getZaloConfig,
  type ZaloProfile,
} from "@/lib/zalo-auth";

export const ZALO_HANDOFF_TTL_SECONDS = 10 * 60;
const ZALO_HANDOFF_RESULT_TTL_SECONDS = 30 * 60;
const ZALO_HANDOFF_RETENTION_SECONDS = 24 * 60 * 60;

export type ZaloHandoffStatus =
  | "PENDING"
  | "LINK_REQUIRED"
  | "APPROVAL_PENDING"
  | "READY"
  | "CONSUMED"
  | "FAILED";

function hashClientSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function clientSecretMatches(secret: string, expectedHash: string) {
  const actual = Buffer.from(hashClientSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createZaloAuthHandoff() {
  const config = getZaloConfig();

  await db
    .delete(zaloAuthHandoffs)
    .where(lt(
      zaloAuthHandoffs.expiresAt,
      new Date(Date.now() - ZALO_HANDOFF_RETENTION_SECONDS * 1000),
    ));

  const state = createZaloOAuthState();
  const pkceVerifier = createZaloCodeVerifier();
  const clientSecret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ZALO_HANDOFF_TTL_SECONDS * 1000);

  const [handoff] = await db
    .insert(zaloAuthHandoffs)
    .values({
      clientSecretHash: hashClientSecret(clientSecret),
      oauthState: state,
      pkceVerifier,
      status: "PENDING",
      expiresAt,
    })
    .returning({ id: zaloAuthHandoffs.id });

  if (!handoff) throw new Error("Không thể tạo phiên Zalo handoff.");

  const authorizationUrl = buildZaloAuthorizationUrl({
    appId: config.appId,
    redirectUri: config.redirectUri,
    state,
    codeChallenge: createZaloCodeChallenge(pkceVerifier),
  }).toString();

  return {
    id: handoff.id,
    clientSecret,
    authorizationUrl,
    expiresAt,
  };
}

export async function findPendingZaloAuthHandoffByState(state: string) {
  const [handoff] = await db
    .select()
    .from(zaloAuthHandoffs)
    .where(and(
      eq(zaloAuthHandoffs.oauthState, state),
      eq(zaloAuthHandoffs.status, "PENDING"),
    ))
    .limit(1);

  if (!handoff) return null;
  if (handoff.expiresAt.getTime() <= Date.now()) {
    await db
      .update(zaloAuthHandoffs)
      .set({
        status: "FAILED",
        failureMessage: "Phiên đăng nhập Zalo đã hết hạn.",
        updatedAt: new Date(),
      })
      .where(and(
        eq(zaloAuthHandoffs.id, handoff.id),
        eq(zaloAuthHandoffs.status, "PENDING"),
      ));
    return null;
  }

  return handoff;
}

export async function readZaloAuthHandoffForClient(id: string, clientSecret: string) {
  const [handoff] = await db
    .select()
    .from(zaloAuthHandoffs)
    .where(eq(zaloAuthHandoffs.id, id))
    .limit(1);

  if (!handoff || !clientSecretMatches(clientSecret, handoff.clientSecretHash)) {
    return null;
  }

  if (handoff.expiresAt.getTime() <= Date.now() && handoff.status !== "CONSUMED") {
    await db
      .update(zaloAuthHandoffs)
      .set({
        status: "FAILED",
        failureMessage: "Phiên đăng nhập Zalo đã hết hạn.",
        updatedAt: new Date(),
      })
      .where(eq(zaloAuthHandoffs.id, handoff.id));

    return {
      ...handoff,
      status: "FAILED" as const,
      failureMessage: "Phiên đăng nhập Zalo đã hết hạn.",
    };
  }

  return handoff;
}

export async function markZaloHandoffReady(
  id: string,
  userId: string,
  profile: ZaloProfile,
) {
  await db
    .update(zaloAuthHandoffs)
    .set({
      status: "READY",
      providerUserId: profile.id,
      displayName: profile.name,
      avatarUrl: profile.pictureUrl,
      userId,
      expiresAt: new Date(Date.now() + ZALO_HANDOFF_RESULT_TTL_SECONDS * 1000),
      updatedAt: new Date(),
    })
    .where(and(
      eq(zaloAuthHandoffs.id, id),
      eq(zaloAuthHandoffs.status, "PENDING"),
    ));
}

export async function markZaloHandoffLinkRequired(input: {
  id: string;
  profile: ZaloProfile;
  clubId: string;
  candidateUserId: string;
}) {
  await db
    .update(zaloAuthHandoffs)
    .set({
      status: "LINK_REQUIRED",
      providerUserId: input.profile.id,
      displayName: input.profile.name,
      avatarUrl: input.profile.pictureUrl,
      clubId: input.clubId,
      candidateUserId: input.candidateUserId,
      expiresAt: new Date(Date.now() + ZALO_HANDOFF_RESULT_TTL_SECONDS * 1000),
      updatedAt: new Date(),
    })
    .where(and(
      eq(zaloAuthHandoffs.id, input.id),
      eq(zaloAuthHandoffs.status, "PENDING"),
    ));
}

export async function markZaloHandoffApprovalPending(input: {
  id: string;
  profile: ZaloProfile;
  clubId: string;
  linkRequestId: string;
}) {
  await db
    .update(zaloAuthHandoffs)
    .set({
      status: "APPROVAL_PENDING",
      providerUserId: input.profile.id,
      displayName: input.profile.name,
      avatarUrl: input.profile.pictureUrl,
      clubId: input.clubId,
      linkRequestId: input.linkRequestId,
      expiresAt: new Date(Date.now() + ZALO_HANDOFF_RESULT_TTL_SECONDS * 1000),
      updatedAt: new Date(),
    })
    .where(and(
      eq(zaloAuthHandoffs.id, input.id),
      eq(zaloAuthHandoffs.status, "PENDING"),
    ));
}

export async function markZaloHandoffFailed(id: string, message: string) {
  await db
    .update(zaloAuthHandoffs)
    .set({
      status: "FAILED",
      failureMessage: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(
      eq(zaloAuthHandoffs.id, id),
      eq(zaloAuthHandoffs.status, "PENDING"),
    ));
}

export async function markZaloHandoffConsumed(id: string) {
  const now = new Date();
  await db
    .update(zaloAuthHandoffs)
    .set({
      status: "CONSUMED",
      consumedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(zaloAuthHandoffs.id, id),
      eq(zaloAuthHandoffs.status, "READY"),
    ));
}
