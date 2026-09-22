"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  authIdentities,
  members,
  users,
  zaloLinkRequests,
} from "@/db/schema";
import { DEFAULT_PASSWORD } from "@/lib/constants";
import { normalizePhone, todayInTimezone } from "@/lib/format";
import { hashPassword, requireUser } from "@/lib/auth";

type Result = { ok: boolean; message: string };

async function requireAdmin() {
  const actor = await requireUser();
  if (actor.role !== "ADMIN") return null;
  return actor;
}

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const idSchema = z.string().uuid();

export async function approveExistingZaloRequestAction(formData: FormData): Promise<Result> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, message: "Chỉ Chủ Tịch Fifa mới có quyền duyệt." };

  const requestId = str(formData, "requestId");
  const userId = str(formData, "userId");
  if (!idSchema.safeParse(requestId).success || !idSchema.safeParse(userId).success) {
    return { ok: false, message: "Yêu cầu hoặc tài khoản không hợp lệ." };
  }

  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(zaloLinkRequests)
        .where(and(
          eq(zaloLinkRequests.id, requestId),
          eq(zaloLinkRequests.clubId, actor.clubId),
          eq(zaloLinkRequests.status, "PENDING"),
        ))
        .limit(1);
      if (!request) throw new Error("REQUEST_NOT_PENDING");

      const [target] = await tx
        .select()
        .from(users)
        .where(and(
          eq(users.id, userId),
          eq(users.clubId, actor.clubId),
          eq(users.isActive, true),
        ))
        .limit(1);
      if (!target) throw new Error("TARGET_NOT_FOUND");

      const [conflict] = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .where(and(
          eq(authIdentities.provider, "ZALO"),
          or(
            eq(authIdentities.providerUserId, request.providerUserId),
            eq(authIdentities.userId, target.id),
          ),
        ))
        .limit(1);
      if (conflict) throw new Error("IDENTITY_CONFLICT");

      const now = new Date();
      await tx.insert(authIdentities).values({
        userId: target.id,
        provider: "ZALO",
        providerUserId: request.providerUserId,
        displayName: request.displayName,
        avatarUrl: request.avatarUrl,
        linkedAt: now,
      });

      const [resolved] = await tx
        .update(zaloLinkRequests)
        .set({
          status: "APPROVED",
          approvedUserId: target.id,
          resolvedBy: actor.id,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(zaloLinkRequests.id, request.id),
          eq(zaloLinkRequests.status, "PENDING"),
        ))
        .returning({ id: zaloLinkRequests.id });
      if (!resolved) throw new Error("REQUEST_RACE");

      await tx.insert(activityLogs).values({
        clubId: actor.clubId,
        entityType: "zalo_link_request",
        entityId: request.id,
        action: "UPDATE",
        actorId: actor.id,
        message: `Duyệt Zalo ${request.displayName} và liên kết tài khoản ${target.displayName}`,
        afterData: { userId: target.id, providerUserId: request.providerUserId },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("IDENTITY_CONFLICT") || message.includes("unique")) {
      return { ok: false, message: "Zalo hoặc user này đã được liên kết. Hãy tải lại danh sách." };
    }
    if (message.includes("REQUEST_NOT_PENDING") || message.includes("REQUEST_RACE")) {
      return { ok: false, message: "Yêu cầu này không còn ở trạng thái chờ duyệt." };
    }
    if (message.includes("TARGET_NOT_FOUND")) {
      return { ok: false, message: "User được chọn không còn khả dụng." };
    }
    return { ok: false, message: "Không thể duyệt yêu cầu Zalo." };
  }

  revalidatePath("/settings/zalo-requests");
  revalidatePath("/settings");
  return { ok: true, message: "Đã duyệt và liên kết Zalo với user." };
}

const newMemberSchema = z.object({
  fullName: z.string().min(2).max(160),
  phone: z.string().regex(/^\d{8,15}$/),
  code: z.string().max(40),
  role: z.enum(["MEMBER", "ORGANIZER", "TREASURER"]),
});

export async function createMemberAndApproveZaloRequestAction(formData: FormData): Promise<Result> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, message: "Chỉ Chủ Tịch Fifa mới có quyền duyệt." };

  const requestId = str(formData, "requestId");
  if (!idSchema.safeParse(requestId).success) {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }

  const parsed = newMemberSchema.safeParse({
    fullName: str(formData, "fullName"),
    phone: normalizePhone(str(formData, "phone")),
    code: str(formData, "code"),
    role: str(formData, "role") || "MEMBER",
  });
  if (!parsed.success) return { ok: false, message: "Thông tin thành viên mới không hợp lệ." };

  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(zaloLinkRequests)
        .where(and(
          eq(zaloLinkRequests.id, requestId),
          eq(zaloLinkRequests.clubId, actor.clubId),
          eq(zaloLinkRequests.status, "PENDING"),
        ))
        .limit(1);
      if (!request) throw new Error("REQUEST_NOT_PENDING");

      const [identityConflict] = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .where(and(
          eq(authIdentities.provider, "ZALO"),
          eq(authIdentities.providerUserId, request.providerUserId),
        ))
        .limit(1);
      if (identityConflict) throw new Error("IDENTITY_CONFLICT");

      const code = parsed.data.code
        || `ZL${request.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

      const [member] = await tx.insert(members).values({
        clubId: actor.clubId,
        code,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        status: "ACTIVE",
        joinedOn: todayInTimezone(),
        note: "Tạo từ yêu cầu liên kết Zalo",
      }).returning();

      const [account] = await tx.insert(users).values({
        clubId: actor.clubId,
        memberId: member.id,
        displayName: parsed.data.fullName,
        phoneNormalized: parsed.data.phone,
        passwordHash: await hashPassword(DEFAULT_PASSWORD),
        role: parsed.data.role,
        isActive: true,
      }).returning();

      const now = new Date();
      await tx.insert(authIdentities).values({
        userId: account.id,
        provider: "ZALO",
        providerUserId: request.providerUserId,
        displayName: request.displayName,
        avatarUrl: request.avatarUrl,
        linkedAt: now,
      });

      const [resolved] = await tx
        .update(zaloLinkRequests)
        .set({
          status: "APPROVED",
          approvedUserId: account.id,
          resolvedBy: actor.id,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(zaloLinkRequests.id, request.id),
          eq(zaloLinkRequests.status, "PENDING"),
        ))
        .returning({ id: zaloLinkRequests.id });
      if (!resolved) throw new Error("REQUEST_RACE");

      await tx.insert(activityLogs).values([
        {
          clubId: actor.clubId,
          entityType: "member",
          entityId: member.id,
          action: "CREATE",
          actorId: actor.id,
          message: `Tạo thành viên ${member.fullName} từ yêu cầu Zalo`,
          afterData: member,
        },
        {
          clubId: actor.clubId,
          entityType: "zalo_link_request",
          entityId: request.id,
          action: "UPDATE",
          actorId: actor.id,
          message: `Duyệt Zalo ${request.displayName}, tạo thành viên và user mới`,
          afterData: { memberId: member.id, userId: account.id, providerUserId: request.providerUserId },
        },
      ]);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("IDENTITY_CONFLICT") || message.includes("unique")) {
      return { ok: false, message: "Zalo, mã thành viên hoặc số điện thoại đã được sử dụng." };
    }
    if (message.includes("REQUEST_NOT_PENDING") || message.includes("REQUEST_RACE")) {
      return { ok: false, message: "Yêu cầu này không còn ở trạng thái chờ duyệt." };
    }
    return { ok: false, message: "Không thể tạo thành viên và duyệt Zalo." };
  }

  revalidatePath("/settings/zalo-requests");
  revalidatePath("/settings");
  revalidatePath("/members");
  return {
    ok: true,
    message: `Đã tạo thành viên, user và duyệt Zalo. Mật khẩu fallback: ${DEFAULT_PASSWORD}`,
  };
}

export async function rejectZaloRequestAction(formData: FormData): Promise<Result> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, message: "Chỉ Chủ Tịch Fifa mới có quyền từ chối." };

  const requestId = str(formData, "requestId");
  const reason = str(formData, "reason").slice(0, 500);
  if (!idSchema.safeParse(requestId).success) return { ok: false, message: "Yêu cầu không hợp lệ." };

  const now = new Date();
  const [request] = await db
    .update(zaloLinkRequests)
    .set({
      status: "REJECTED",
      resolvedBy: actor.id,
      resolvedAt: now,
      rejectionReason: reason || null,
      updatedAt: now,
    })
    .where(and(
      eq(zaloLinkRequests.id, requestId),
      eq(zaloLinkRequests.clubId, actor.clubId),
      eq(zaloLinkRequests.status, "PENDING"),
    ))
    .returning({ id: zaloLinkRequests.id, displayName: zaloLinkRequests.displayName });

  if (!request) return { ok: false, message: "Yêu cầu này không còn ở trạng thái chờ duyệt." };

  await db.insert(activityLogs).values({
    clubId: actor.clubId,
    entityType: "zalo_link_request",
    entityId: request.id,
    action: "UPDATE",
    actorId: actor.id,
    message: `Từ chối yêu cầu Zalo ${request.displayName}`,
    afterData: { status: "REJECTED", reason: reason || null },
  });

  revalidatePath("/settings/zalo-requests");
  revalidatePath("/settings");
  return { ok: true, message: "Đã từ chối yêu cầu Zalo." };
}
