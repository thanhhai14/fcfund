"use server";

import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { authIdentities, users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import {
  createOrReuseZaloLinkRequest,
  createZaloPendingToken,
  notifyZaloLinkRequestAdmins,
  readZaloLinkContext,
  ZALO_LINK_CONTEXT_COOKIE,
  ZALO_PENDING_COOKIE,
  zaloPendingCookieOptions,
} from "@/lib/zalo-linking";

type Result = { ok: boolean; message: string };

export async function confirmZaloCandidateAction(formData: FormData): Promise<Result> {
  const context = await readZaloLinkContext();
  if (!context) {
    return { ok: false, message: "Phiên liên kết Zalo đã hết hạn. Vui lòng đăng nhập Zalo lại." };
  }

  const password = String(formData.get("password") ?? "");
  if (password.length < 6 || password.length > 100) {
    return { ok: false, message: "Mật khẩu không hợp lệ." };
  }

  const [target] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.id, context.candidateUserId),
      eq(users.clubId, context.clubId),
      eq(users.isActive, true),
    ))
    .limit(1);

  if (!target || !(await verifyPassword(password, target.passwordHash))) {
    return { ok: false, message: "Mật khẩu FCFUND không đúng." };
  }

  try {
    await db.transaction(async (tx) => {
      const [conflict] = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .where(and(
          eq(authIdentities.provider, "ZALO"),
          or(
            eq(authIdentities.providerUserId, context.providerUserId),
            eq(authIdentities.userId, target.id),
          ),
        ))
        .limit(1);

      if (conflict) throw new Error("ZALO_IDENTITY_CONFLICT");

      const now = new Date();
      await tx.insert(authIdentities).values({
        userId: target.id,
        provider: "ZALO",
        providerUserId: context.providerUserId,
        displayName: context.displayName,
        avatarUrl: context.pictureUrl,
        linkedAt: now,
        lastLoginAt: now,
      });
      await tx.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, target.id));
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("ZALO_IDENTITY_CONFLICT") || error.message.includes("unique"))) {
      return { ok: false, message: "Zalo hoặc tài khoản này vừa được liên kết ở nơi khác. Vui lòng đăng nhập Zalo lại." };
    }
    return { ok: false, message: "Không thể liên kết tài khoản Zalo." };
  }

  await createSession({
    sub: target.id,
    clubId: target.clubId,
    memberId: target.memberId ?? undefined,
    role: target.role,
  });

  const store = await cookies();
  store.delete(ZALO_LINK_CONTEXT_COOKIE);
  store.delete(ZALO_PENDING_COOKIE);
  redirect("/dashboard");
}

export async function sendZaloForAdminReviewAction(formData: FormData): Promise<Result> {
  void formData;
  const context = await readZaloLinkContext();
  if (!context) {
    return { ok: false, message: "Phiên liên kết Zalo đã hết hạn. Vui lòng đăng nhập Zalo lại." };
  }

  const { request, created } = await createOrReuseZaloLinkRequest(context.clubId, {
    id: context.providerUserId,
    name: context.displayName,
    pictureUrl: context.pictureUrl,
  });

  if (created) {
    try {
      await notifyZaloLinkRequestAdmins({
        clubId: context.clubId,
        requestId: request.id,
        displayName: context.displayName,
      });
    } catch {
      // Push failures must not block the Zalo approval request.
    }
  }

  const pendingToken = await createZaloPendingToken({
    requestId: request.id,
    providerUserId: context.providerUserId,
  });

  const store = await cookies();
  store.set(ZALO_PENDING_COOKIE, pendingToken, zaloPendingCookieOptions());
  store.delete(ZALO_LINK_CONTEXT_COOKIE);
  redirect("/zalo/pending");
}
