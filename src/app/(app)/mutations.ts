"use server";

import { del, put } from "@vercel/blob";
import { hash } from "bcryptjs";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  avatars,
  chargeTypes,
  clubs,
  fundCategories,
  fundTransactions,
  matches,
  matchParticipants,
  matchTeamVersions,
  memberChargeAssignments,
  memberCharges,
  memberProfiles,
  members,
  userPermissionOverrides,
  users,
} from "@/db/schema";
import {
  DEFAULT_PASSWORD,
  ICON_ALLOWLIST,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  ROLE_LABELS,
} from "@/lib/constants";
import { normalizePhone, todayInTimezone } from "@/lib/format";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { can, requirePermission } from "@/lib/permissions";

type MutationResult = { ok: boolean; message: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function amount(formData: FormData, key = "amount") {
  return Number(str(formData, key).replace(/\D/g, ""));
}

function parseMatchChargeQuantities(formData: FormData) {
  const prefix = "matchChargeQuantity:";
  const quantities = new Map<string, { memberId: string; typeId: string; quantity: number }>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(prefix)) continue;
    const [memberId, typeId, ...extra] = key.slice(prefix.length).split(":");
    const raw = String(value).trim() || "0";
    const quantity = Number(raw);
    if (!memberId || !typeId || extra.length || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return { ok: false as const, rows: [] };
    }
    if (quantity > 0) quantities.set(`${memberId}|${typeId}`, { memberId, typeId, quantity });
  }
  return { ok: true as const, rows: [...quantities.values()] };
}

async function track(
  tx: Tx,
  input: {
    clubId: string;
    entityType: string;
    entityId: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "RESET_PASSWORD" | "COMMENT";
    actorId: string;
    message?: string;
    beforeData?: unknown;
    afterData?: unknown;
  },
) {
  await tx.insert(activityLogs).values({
    clubId: input.clubId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actorId,
    message: input.message,
    beforeData: input.beforeData,
    afterData: input.afterData,
  });
}

const memberSchema = z.object({
  code: z.string().min(1).max(40),
  fullName: z.string().min(2).max(160),
  phone: z.string().regex(/^\d{8,15}$/),
  role: z.enum(["MEMBER", "ORGANIZER", "TREASURER"]),
});

export async function createMemberAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MEMBERS_MANAGE);
  const parsed = memberSchema.safeParse({
    code: str(formData, "code") || `TV${Date.now().toString().slice(-6)}`,
    fullName: str(formData, "fullName"),
    phone: normalizePhone(str(formData, "phone")),
    role: str(formData, "role") || "MEMBER",
  });
  if (!parsed.success) return { ok: false, message: "Thông tin thành viên không hợp lệ." };

  try {
    await db.transaction(async (tx) => {
      const [member] = await tx
        .insert(members)
        .values({
          clubId: actor.clubId,
          code: parsed.data.code,
          fullName: parsed.data.fullName,
          phone: parsed.data.phone,
          joinedOn: str(formData, "joinedOn") || todayInTimezone(),
          note: str(formData, "note") || null,
        })
        .returning();

      if (formData.get("createAccount") === "on") {
        await tx.insert(users).values({
          clubId: actor.clubId,
          memberId: member.id,
          displayName: parsed.data.fullName,
          phoneNormalized: parsed.data.phone,
          passwordHash: await hashPassword(DEFAULT_PASSWORD),
          role: parsed.data.role,
        });
      }

      await track(tx, {
        clubId: actor.clubId,
        entityType: "member",
        entityId: member.id,
        action: "CREATE",
        actorId: actor.id,
        afterData: member,
        message: `Tạo thành viên ${member.fullName}`,
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Mã thành viên hoặc số điện thoại đăng nhập đã tồn tại."
        : "Không thể tạo thành viên.",
    };
  }
  revalidatePath("/members");
  revalidatePath("/dashboard");
  return { ok: true, message: "Đã tạo thành viên." };
}

export async function updateMemberAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MEMBERS_MANAGE);
  const id = str(formData, "id");
  const [before] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.clubId, actor.clubId)))
    .limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy thành viên." };

  const next = {
    fullName: str(formData, "fullName") || before.fullName,
    phone: normalizePhone(str(formData, "phone")) || before.phone,
    status: (str(formData, "status") === "INACTIVE" ? "INACTIVE" : "ACTIVE") as "ACTIVE" | "INACTIVE",
    note: str(formData, "note") || null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const [after] = await tx.update(members).set(next).where(eq(members.id, id)).returning();
    await track(tx, {
      clubId: actor.clubId, entityType: "member", entityId: id, action: "UPDATE",
      actorId: actor.id, beforeData: before, afterData: after, message: "Cập nhật hồ sơ thành viên",
    });
  });
  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  return { ok: true, message: "Đã cập nhật thành viên." };
}

export async function updateMemberProfileAction(formData: FormData): Promise<MutationResult> {
  const actor = await requireUser();
  const memberId = str(formData, "memberId");
  const [member] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.clubId, actor.clubId))).limit(1);
  if (!member) return { ok: false, message: "Không tìm thấy thành viên." };
  const mayManage = actor.role === "ADMIN" || await can(PERMISSIONS.MEMBERS_MANAGE);
  const mayEditOwn = actor.memberId === memberId && await can(PERMISSIONS.MEMBER_PROFILE_EDIT_OWN);
  if (!mayManage && !mayEditOwn) return { ok: false, message: "Bạn không có quyền sửa hồ sơ này." };

  const avatarFile = formData.get("avatar");
  const removeAvatar = str(formData, "removeAvatar") === "on";
  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(avatarFile.type)) return { ok: false, message: "Avatar chỉ nhận PNG, JPEG hoặc WebP." };
    if (avatarFile.size > 2 * 1024 * 1024) return { ok: false, message: "Avatar không được lớn hơn 2 MB." };
  }
  const shirtNumberText = str(formData, "shirtNumber");
  const shirtNumber = shirtNumberText ? Number(shirtNumberText) : null;
  if (shirtNumber !== null && (!Number.isInteger(shirtNumber) || shirtNumber < 0 || shirtNumber > 99)) return { ok: false, message: "Số áo phải từ 0 đến 99." };

  const [linkedAccount] = await db.select({ id: users.id }).from(users).where(eq(users.memberId, memberId)).limit(1);
  const avatarOwnerCondition = linkedAccount
    ? or(eq(avatars.memberId, memberId), eq(avatars.userId, linkedAccount.id))
    : eq(avatars.memberId, memberId);
  const [beforeAvatar] = await db.select().from(avatars).where(and(
    eq(avatars.clubId, actor.clubId),
    avatarOwnerCondition,
  )).limit(1);
  let uploaded: Awaited<ReturnType<typeof put>> | null = null;
  try {
    if (avatarFile instanceof File && avatarFile.size > 0) {
      uploaded = await put(`clubs/${actor.clubId}/members/${memberId}/avatar-${Date.now()}`, avatarFile, { access: "private", addRandomSuffix: true });
    }
  } catch {
    return { ok: false, message: "Không thể tải avatar lên kho lưu trữ." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(memberProfiles).values({
        memberId,
        bio: str(formData, "bio") || null,
        nickname: str(formData, "nickname") || null,
        preferredPosition: str(formData, "preferredPosition") || null,
        preferredFoot: str(formData, "preferredFoot") || null,
        shirtNumber,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: memberProfiles.memberId,
        set: { bio: str(formData, "bio") || null, nickname: str(formData, "nickname") || null, preferredPosition: str(formData, "preferredPosition") || null, preferredFoot: str(formData, "preferredFoot") || null, shirtNumber, updatedAt: new Date() },
      });
      if (removeAvatar && !uploaded && beforeAvatar) await tx.delete(avatars).where(eq(avatars.id, beforeAvatar.id));
      if (uploaded && avatarFile instanceof File) {
        const next = { clubId: actor.clubId, memberId, userId: linkedAccount?.id ?? null, blobUrl: uploaded.url, pathname: uploaded.pathname, mimeType: avatarFile.type, fileSize: avatarFile.size, updatedAt: new Date() };
        if (beforeAvatar) await tx.update(avatars).set(next).where(eq(avatars.id, beforeAvatar.id));
        else await tx.insert(avatars).values(next);
      }
      await track(tx, { clubId: actor.clubId, entityType: "member", entityId: memberId, action: "UPDATE", actorId: actor.id, message: uploaded ? "Cập nhật CV và avatar thành viên" : removeAvatar ? "Cập nhật CV và xóa avatar thành viên" : "Cập nhật CV thành viên" });
    });
  } catch {
    if (uploaded) void del(uploaded.url).catch(() => undefined);
    return { ok: false, message: "Không thể cập nhật hồ sơ thành viên." };
  }
  if ((uploaded || (removeAvatar && !uploaded)) && beforeAvatar) void del(beforeAvatar.blobUrl).catch(() => undefined);
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
  revalidatePath("/", "layout");
  return { ok: true, message: "Đã cập nhật hồ sơ thành viên." };
}

export async function updateOwnAvatarAction(formData: FormData): Promise<MutationResult> {
  const actor = await requireUser();
  const avatarFile = formData.get("avatar");
  const removeAvatar = str(formData, "removeAvatar") === "on";
  if (!(avatarFile instanceof File) || avatarFile.size === 0) {
    if (!removeAvatar) return { ok: false, message: "Hãy chọn ảnh avatar hoặc chọn xóa ảnh hiện tại." };
  } else {
    if (!["image/png", "image/jpeg", "image/webp"].includes(avatarFile.type)) return { ok: false, message: "Avatar chỉ nhận PNG, JPEG hoặc WebP." };
    if (avatarFile.size > 2 * 1024 * 1024) return { ok: false, message: "Avatar không được lớn hơn 2 MB." };
  }

  const ownerCondition = actor.memberId
    ? or(eq(avatars.userId, actor.id), eq(avatars.memberId, actor.memberId))
    : eq(avatars.userId, actor.id);
  const [beforeAvatar] = await db.select().from(avatars).where(and(
    eq(avatars.clubId, actor.clubId),
    ownerCondition,
  )).limit(1);
  let uploaded: Awaited<ReturnType<typeof put>> | null = null;
  try {
    if (avatarFile instanceof File && avatarFile.size > 0) {
      uploaded = await put(`clubs/${actor.clubId}/users/${actor.id}/avatar-${Date.now()}`, avatarFile, { access: "private", addRandomSuffix: true });
    }
  } catch {
    return { ok: false, message: "Không thể tải avatar lên kho lưu trữ." };
  }

  try {
    await db.transaction(async (tx) => {
      if (removeAvatar && !uploaded && beforeAvatar) {
        await tx.delete(avatars).where(eq(avatars.id, beforeAvatar.id));
      } else if (uploaded && avatarFile instanceof File) {
        const next = {
          clubId: actor.clubId,
          userId: actor.id,
          memberId: actor.memberId ?? null,
          blobUrl: uploaded.url,
          pathname: uploaded.pathname,
          mimeType: avatarFile.type,
          fileSize: avatarFile.size,
          updatedAt: new Date(),
        };
        if (beforeAvatar) await tx.update(avatars).set(next).where(eq(avatars.id, beforeAvatar.id));
        else await tx.insert(avatars).values(next);
      }
      await track(tx, {
        clubId: actor.clubId,
        entityType: "user",
        entityId: actor.id,
        action: "UPDATE",
        actorId: actor.id,
        message: uploaded ? "Cập nhật avatar tài khoản" : "Xóa avatar tài khoản",
      });
    });
  } catch {
    if (uploaded) void del(uploaded.url).catch(() => undefined);
    return { ok: false, message: "Không thể cập nhật avatar tài khoản." };
  }
  if (beforeAvatar && (uploaded || removeAvatar)) void del(beforeAvatar.blobUrl).catch(() => undefined);
  revalidatePath("/settings");
  if (actor.memberId) {
    revalidatePath(`/members/${actor.memberId}`);
    revalidatePath("/members");
  }
  revalidatePath("/", "layout");
  return { ok: true, message: uploaded ? "Đã cập nhật avatar tài khoản." : "Đã xóa avatar tài khoản." };
}

const memberAccountSchema = z.object({
  displayName: z.string().min(2).max(160),
  phone: z.string().regex(/^\d{8,15}$/),
  role: z.enum(["MEMBER", "ORGANIZER", "TREASURER"]),
});

export async function createMemberAccountAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const memberId = str(formData, "memberId");
  const parsed = memberAccountSchema.safeParse({
    displayName: str(formData, "displayName"),
    phone: normalizePhone(str(formData, "phone")),
    role: str(formData, "role") || "MEMBER",
  });
  if (!parsed.success) return { ok: false, message: "Số điện thoại hoặc vai trò không hợp lệ." };

  const [member] = await db.select().from(members).where(and(
    eq(members.id, memberId),
    eq(members.clubId, actor.clubId),
  )).limit(1);
  if (!member) return { ok: false, message: "Không tìm thấy thành viên." };

  try {
    await db.transaction(async (tx) => {
      const [account] = await tx.insert(users).values({
        clubId: actor.clubId,
        memberId: member.id,
        displayName: parsed.data.displayName,
        phoneNormalized: parsed.data.phone,
        passwordHash: await hashPassword(DEFAULT_PASSWORD),
        role: parsed.data.role,
        isActive: true,
      }).returning({ id: users.id });
      await tx.update(avatars).set({ userId: account.id, updatedAt: new Date() })
        .where(eq(avatars.memberId, member.id));
      await track(tx, {
        clubId: actor.clubId,
        entityType: "member",
        entityId: member.id,
        action: "CREATE",
        actorId: actor.id,
        afterData: { userId: account.id, displayName: parsed.data.displayName, phone: parsed.data.phone, role: parsed.data.role, isActive: true },
        message: `Tạo tài khoản đăng nhập ${ROLE_LABELS[parsed.data.role] ?? parsed.data.role}`,
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Thành viên đã có tài khoản hoặc số điện thoại đăng nhập đang được sử dụng."
        : "Không thể tạo tài khoản đăng nhập.",
    };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${member.id}`);
  revalidatePath("/settings");
  return { ok: true, message: `Đã tạo tài khoản. Mật khẩu ban đầu: ${DEFAULT_PASSWORD}` };
}

export async function updateMemberAccountAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const userId = str(formData, "userId");
  const parsed = memberAccountSchema.safeParse({
    displayName: str(formData, "displayName"),
    phone: normalizePhone(str(formData, "phone")),
    role: str(formData, "role") || "MEMBER",
  });
  if (!parsed.success) return { ok: false, message: "Số điện thoại hoặc vai trò không hợp lệ." };

  const [before] = await db.select({
    id: users.id,
    memberId: users.memberId,
    displayName: users.displayName,
    phone: users.phoneNormalized,
    role: users.role,
    isActive: users.isActive,
  }).from(users).where(and(
    eq(users.id, userId),
    eq(users.clubId, actor.clubId),
  )).limit(1);
  if (!before?.memberId) return { ok: false, message: "Không tìm thấy tài khoản thành viên." };
  if (before.role === "ADMIN") return { ok: false, message: "Không thể thay đổi tài khoản Admin từ hồ sơ thành viên." };

  const requestedActive = formData.get("isActive") === "on";
  const next = { displayName: parsed.data.displayName, phone: parsed.data.phone, role: parsed.data.role, isActive: requestedActive };

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({
        displayName: next.displayName,
        phoneNormalized: next.phone,
        role: next.role,
        isActive: next.isActive,
        updatedAt: new Date(),
      }).where(and(eq(users.id, before.id), eq(users.clubId, actor.clubId)));
      await track(tx, {
        clubId: actor.clubId,
        entityType: "member",
        entityId: before.memberId!,
        action: "UPDATE",
        actorId: actor.id,
        beforeData: { displayName: before.displayName, phone: before.phone, role: before.role, isActive: before.isActive },
        afterData: next,
        message: `${next.isActive ? "Cập nhật" : "Khóa"} tài khoản đăng nhập`,
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Số điện thoại đăng nhập đang được tài khoản khác sử dụng."
        : "Không thể cập nhật tài khoản đăng nhập.",
    };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${before.memberId}`);
  revalidatePath("/settings");
  return { ok: true, message: "Đã cập nhật tài khoản đăng nhập." };
}

const userAccountSchema = z.object({
  displayName: z.string().min(2).max(160),
  phone: z.string().regex(/^\d{8,15}$/),
  role: z.enum(["ADMIN", "TREASURER", "ORGANIZER", "MEMBER"]),
});

export async function createUserAccountAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const parsed = userAccountSchema.safeParse({
    displayName: str(formData, "displayName"),
    phone: normalizePhone(str(formData, "phone")),
    role: str(formData, "role") || "MEMBER",
  });
  if (!parsed.success) return { ok: false, message: "Thông tin tài khoản không hợp lệ." };
  if (parsed.data.role === "ADMIN" && actor.role !== "ADMIN") {
    return { ok: false, message: "Chỉ Admin có thể tạo tài khoản Admin." };
  }

  try {
    await db.transaction(async (tx) => {
      const [account] = await tx.insert(users).values({
        clubId: actor.clubId,
        memberId: null,
        displayName: parsed.data.displayName,
        phoneNormalized: parsed.data.phone,
        passwordHash: await hashPassword(DEFAULT_PASSWORD),
        role: parsed.data.role,
        isActive: true,
      }).returning({ id: users.id });
      await track(tx, {
        clubId: actor.clubId,
        entityType: "user",
        entityId: account.id,
        action: "CREATE",
        actorId: actor.id,
        afterData: { displayName: parsed.data.displayName, phone: parsed.data.phone, role: parsed.data.role, isActive: true },
        message: `Tạo tài khoản độc lập ${parsed.data.displayName}`,
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Số điện thoại đăng nhập đang được sử dụng."
        : "Không thể tạo tài khoản.",
    };
  }
  revalidatePath("/settings");
  return { ok: true, message: `Đã tạo tài khoản. Mật khẩu ban đầu: ${DEFAULT_PASSWORD}` };
}

export async function updateUserAccountAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const userId = str(formData, "userId");
  const parsed = userAccountSchema.safeParse({
    displayName: str(formData, "displayName"),
    phone: normalizePhone(str(formData, "phone")),
    role: str(formData, "role"),
  });
  if (!parsed.success) return { ok: false, message: "Thông tin tài khoản không hợp lệ." };

  const [before] = await db.select().from(users).where(and(
    eq(users.id, userId),
    eq(users.clubId, actor.clubId),
  )).limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy tài khoản." };
  if ((before.role === "ADMIN" || parsed.data.role === "ADMIN") && actor.role !== "ADMIN") {
    return { ok: false, message: "Chỉ Admin có thể thay đổi tài khoản Admin." };
  }

  const nextRole = before.role === "ADMIN" ? "ADMIN" : parsed.data.role;
  const nextActive = actor.id === before.id ? true : formData.get("isActive") === "on";
  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({
        displayName: parsed.data.displayName,
        phoneNormalized: parsed.data.phone,
        role: nextRole,
        isActive: nextActive,
        updatedAt: new Date(),
      }).where(eq(users.id, before.id));
      await track(tx, {
        clubId: actor.clubId,
        entityType: "user",
        entityId: before.id,
        action: "UPDATE",
        actorId: actor.id,
        beforeData: { displayName: before.displayName, phone: before.phoneNormalized, role: before.role, isActive: before.isActive },
        afterData: { displayName: parsed.data.displayName, phone: parsed.data.phone, role: nextRole, isActive: nextActive },
        message: "Cập nhật tài khoản và vai trò",
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Số điện thoại đăng nhập đang được sử dụng."
        : "Không thể cập nhật tài khoản.",
    };
  }
  revalidatePath("/settings");
  if (before.memberId) revalidatePath(`/members/${before.memberId}`);
  return { ok: true, message: "Đã cập nhật tài khoản." };
}

export async function linkUserToMemberAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const userId = str(formData, "userId");
  const memberId = str(formData, "memberId");
  const [[account], [member], [existingLink]] = await Promise.all([
    db.select().from(users).where(and(eq(users.id, userId), eq(users.clubId, actor.clubId))).limit(1),
    db.select().from(members).where(and(eq(members.id, memberId), eq(members.clubId, actor.clubId))).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.memberId, memberId)).limit(1),
  ]);
  if (!account || !member) return { ok: false, message: "Không tìm thấy tài khoản hoặc thành viên." };
  if (account.memberId) return { ok: false, message: "Tài khoản đã liên kết với một thành viên." };
  if (existingLink) return { ok: false, message: "Thành viên đã liên kết với tài khoản khác." };

  const [memberAvatar, userAvatar] = await Promise.all([
    db.select().from(avatars).where(eq(avatars.memberId, member.id)).limit(1).then((rows) => rows[0]),
    db.select().from(avatars).where(eq(avatars.userId, account.id)).limit(1).then((rows) => rows[0]),
  ]);
  let obsoleteAvatarUrl: string | null = null;
  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ memberId: member.id, updatedAt: new Date() }).where(eq(users.id, account.id));
      if (memberAvatar) {
        if (userAvatar && userAvatar.id !== memberAvatar.id) {
          obsoleteAvatarUrl = userAvatar.blobUrl;
          await tx.delete(avatars).where(eq(avatars.id, userAvatar.id));
        }
        await tx.update(avatars).set({ userId: account.id, updatedAt: new Date() }).where(eq(avatars.id, memberAvatar.id));
      } else if (userAvatar) {
        await tx.update(avatars).set({ memberId: member.id, updatedAt: new Date() }).where(eq(avatars.id, userAvatar.id));
      }
      await track(tx, {
        clubId: actor.clubId,
        entityType: "member",
        entityId: member.id,
        action: "UPDATE",
        actorId: actor.id,
        afterData: { userId: account.id, displayName: account.displayName },
        message: `Gắn tài khoản ${account.displayName} với thành viên`,
      });
    });
  } catch {
    return { ok: false, message: "Không thể gắn tài khoản; liên kết có thể vừa được thay đổi." };
  }
  if (obsoleteAvatarUrl) void del(obsoleteAvatarUrl).catch(() => undefined);
  revalidatePath("/settings");
  revalidatePath("/members");
  revalidatePath(`/members/${member.id}`);
  return { ok: true, message: "Đã gắn tài khoản với thành viên." };
}

export async function unlinkUserFromMemberAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const userId = str(formData, "userId");
  const [account] = await db.select().from(users).where(and(
    eq(users.id, userId),
    eq(users.clubId, actor.clubId),
  )).limit(1);
  if (!account?.memberId) return { ok: false, message: "Tài khoản chưa liên kết thành viên." };
  const oldMemberId = account.memberId;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ memberId: null, updatedAt: new Date() }).where(eq(users.id, account.id));
    await tx.update(avatars).set({ userId: null, updatedAt: new Date() }).where(and(eq(avatars.memberId, oldMemberId), eq(avatars.userId, account.id)));
    await track(tx, {
      clubId: actor.clubId,
      entityType: "member",
      entityId: oldMemberId,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: { userId: account.id, displayName: account.displayName },
      message: `Tháo liên kết tài khoản ${account.displayName}`,
    });
  });
  revalidatePath("/settings");
  revalidatePath("/members");
  revalidatePath(`/members/${oldMemberId}`);
  return { ok: true, message: "Đã tháo liên kết. Tài khoản vẫn được giữ lại." };
}

export async function createChargeTypeAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const name = str(formData, "name");
  const defaultAmount = amount(formData);
  const calculation = str(formData, "calculation") === "MONTHLY" ? "MONTHLY" : "OCCURRENCE";
  const iconName = str(formData, "iconName");
  const color = str(formData, "color") || "#ef7198";
  if (!name || defaultAmount < 0 || !ICON_ALLOWLIST.includes(iconName) || !/^#[0-9a-f]{6}$/i.test(color)) {
    return { ok: false, message: "Thông tin loại thu không hợp lệ." };
  }

  try {
    await db.transaction(async (tx) => {
      const [record] = await tx.insert(chargeTypes).values({
        clubId: actor.clubId,
        name,
        defaultAmount,
        calculation,
        iconName,
        color,
        reportAsIcon: formData.get("reportAsIcon") === "on",
        isLossPenalty: formData.get("isLossPenalty") === "on",
      }).returning();
      await track(tx, {
        clubId: actor.clubId, entityType: "charge_type", entityId: record.id,
        action: "CREATE", actorId: actor.id, afterData: record, message: `Tạo loại thu ${name}`,
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Tên loại thu đã tồn tại."
        : "Không thể tạo loại thu.",
    };
  }
  revalidatePath("/settings");
  revalidatePath("/charges");
  revalidatePath("/matches");
  revalidatePath("/reports");
  return { ok: true, message: "Đã tạo loại thu." };
}

export async function updateChargeTypeAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const id = str(formData, "id");
  const [before] = await db.select().from(chargeTypes)
    .where(and(eq(chargeTypes.id, id), eq(chargeTypes.clubId, actor.clubId))).limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy loại thu." };

  const name = str(formData, "name");
  const defaultAmount = amount(formData);
  const calculation = str(formData, "calculation") === "MONTHLY" ? "MONTHLY" : "OCCURRENCE";
  const iconName = str(formData, "iconName");
  const color = str(formData, "color") || "#ef7198";
  if (!name || defaultAmount < 0 || !ICON_ALLOWLIST.includes(iconName) || !/^#[0-9a-f]{6}$/i.test(color)) {
    return { ok: false, message: "Thông tin loại thu không hợp lệ." };
  }

  try {
    await db.transaction(async (tx) => {
      const [after] = await tx.update(chargeTypes).set({
        name,
        defaultAmount,
        calculation,
        iconName,
        color,
        reportAsIcon: formData.get("reportAsIcon") === "on",
        isLossPenalty: formData.get("isLossPenalty") === "on",
        isActive: formData.get("isActive") === "on",
        updatedAt: new Date(),
      }).where(eq(chargeTypes.id, id)).returning();
      await track(tx, {
        clubId: actor.clubId,
        entityType: "charge_type",
        entityId: id,
        action: "UPDATE",
        actorId: actor.id,
        beforeData: before,
        afterData: after,
        message: `Cập nhật loại thu ${name}; đơn giá mới chỉ áp dụng cho phát sinh tương lai`,
      });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message.includes("unique")
        ? "Tên loại thu đã tồn tại."
        : "Không thể cập nhật loại thu.",
    };
  }
  revalidatePath("/settings"); revalidatePath("/charges"); revalidatePath("/matches"); revalidatePath("/reports");
  return { ok: true, message: "Đã cập nhật loại thu. Đơn giá mới áp dụng cho phát sinh tương lai." };
}

export async function createAssignmentAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.CHARGES_MANAGE);
  const memberId = str(formData, "memberId");
  const chargeTypeId = str(formData, "chargeTypeId");
  const validFrom = str(formData, "validFrom");
  if (!memberId || !chargeTypeId || !validFrom) return { ok: false, message: "Thiếu thông tin áp dụng." };

  const customAmountRaw = str(formData, "customAmount");
  const [type] = await db.select().from(chargeTypes)
    .where(and(eq(chargeTypes.id, chargeTypeId), eq(chargeTypes.clubId, actor.clubId))).limit(1);
  if (!type) return { ok: false, message: "Loại thu không hợp lệ." };
  await db.transaction(async (tx) => {
    const [record] = await tx.insert(memberChargeAssignments).values({
      memberId,
      chargeTypeId,
      customAmount: customAmountRaw ? amount(formData, "customAmount") : null,
      validFrom,
      validUntil: str(formData, "validUntil") || null,
      note: str(formData, "note") || null,
      createdBy: actor.id,
    }).returning();

    await track(tx, {
      clubId: actor.clubId, entityType: "member", entityId: memberId,
      action: "CREATE", actorId: actor.id, afterData: record, message: "Gán khoản thu cho thành viên",
    });

    if (formData.get("chargeCurrentMonth") === "on" && type.calculation === "MONTHLY") {
      const currentMonth = `${todayInTimezone().slice(0, 7)}-01`;
      const price = customAmountRaw ? amount(formData, "customAmount") : type.defaultAmount;
      await tx.insert(memberCharges).values({
        clubId: actor.clubId, memberId, chargeTypeId, assignmentId: record.id,
        source: "AUTO_MONTHLY", chargeDate: currentMonth, periodMonth: currentMonth,
        quantity: 1, unitAmount: price, totalAmount: price, createdBy: actor.id,
        note: "Tạo ngay khi gán khoản thu",
      }).onConflictDoNothing();
    }
  });

  revalidatePath("/members");
  revalidatePath("/charges");
  revalidatePath("/dashboard");
  return { ok: true, message: "Đã gán khoản thu." };
}

export async function updateAssignmentAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.CHARGES_MANAGE);
  const id = str(formData, "id");
  const validFrom = str(formData, "validFrom");
  const validUntil = str(formData, "validUntil") || null;
  const customAmountRaw = str(formData, "customAmount");
  const customAmount = customAmountRaw === "" ? null : Number(customAmountRaw);
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!id || !validDate(validFrom) || (validUntil && !validDate(validUntil))) {
    return { ok: false, message: "Thời hạn áp dụng không hợp lệ." };
  }
  if (validUntil && validUntil < validFrom) {
    return { ok: false, message: "Ngày kết thúc không được trước ngày bắt đầu." };
  }
  if (customAmount !== null && (!Number.isSafeInteger(customAmount) || customAmount < 0)) {
    return { ok: false, message: "Đơn giá riêng không hợp lệ." };
  }

  const [row] = await db.select({
    assignment: memberChargeAssignments,
    chargeTypeName: chargeTypes.name,
  }).from(memberChargeAssignments)
    .innerJoin(chargeTypes, eq(memberChargeAssignments.chargeTypeId, chargeTypes.id))
    .where(and(eq(memberChargeAssignments.id, id), eq(chargeTypes.clubId, actor.clubId)))
    .limit(1);
  if (!row) return { ok: false, message: "Không tìm thấy khoản thu đang áp dụng." };

  const next = {
    customAmount,
    validFrom,
    validUntil,
    isActive: formData.get("isActive") === "on",
    note: str(formData, "note") || null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const [after] = await tx.update(memberChargeAssignments).set(next)
      .where(eq(memberChargeAssignments.id, id)).returning();
    await track(tx, {
      clubId: actor.clubId,
      entityType: "member",
      entityId: row.assignment.memberId,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: row.assignment,
      afterData: after,
      message: `${next.isActive ? "Cập nhật" : "Dừng"} khoản thu áp dụng ${row.chargeTypeName}`,
    });
  });

  revalidatePath(`/members/${row.assignment.memberId}`);
  revalidatePath("/members");
  revalidatePath("/charges");
  revalidatePath("/dashboard");
  return { ok: true, message: next.isActive ? "Đã cập nhật khoản thu áp dụng." : "Đã dừng khoản thu áp dụng." };
}

export async function createMemberChargeAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.CHARGES_MANAGE);
  const memberId = str(formData, "memberId");
  const chargeTypeId = str(formData, "chargeTypeId");
  const quantity = Math.max(1, Number(str(formData, "quantity") || 1));
  const [type] = await db.select().from(chargeTypes)
    .where(and(eq(chargeTypes.id, chargeTypeId), eq(chargeTypes.clubId, actor.clubId))).limit(1);
  if (!memberId || !type) return { ok: false, message: "Thành viên hoặc loại thu không hợp lệ." };
  const unitAmount = str(formData, "unitAmount") ? amount(formData, "unitAmount") : type.defaultAmount;

  await db.transaction(async (tx) => {
    const [record] = await tx.insert(memberCharges).values({
      clubId: actor.clubId, memberId, chargeTypeId,
      matchId: str(formData, "matchId") || null,
      source: str(formData, "matchId") ? "MATCH" : "MANUAL",
      chargeDate: str(formData, "chargeDate") || todayInTimezone(),
      quantity, unitAmount, totalAmount: quantity * unitAmount,
      isLossPenaltySnapshot: type.isLossPenalty,
      note: str(formData, "note") || null, createdBy: actor.id,
    }).returning();
    await track(tx, {
      clubId: actor.clubId, entityType: "member_charge", entityId: record.id,
      action: "CREATE", actorId: actor.id, afterData: record, message: `Tạo khoản phải đóng ${record.totalAmount}đ`,
    });
  });
  revalidatePath("/charges");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { ok: true, message: "Đã tạo khoản phải đóng." };
}

export async function updateMemberChargeAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.CHARGES_MANAGE);
  const id = str(formData, "id");
  const [before] = await db.select().from(memberCharges)
    .where(and(eq(memberCharges.id, id), eq(memberCharges.clubId, actor.clubId), isNull(memberCharges.deletedAt))).limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy khoản thu." };
  const quantity = Math.max(1, Number(str(formData, "quantity") || before.quantity));
  const unitAmount = str(formData, "unitAmount") ? amount(formData, "unitAmount") : before.unitAmount;
  await db.transaction(async (tx) => {
    const [after] = await tx.update(memberCharges).set({
      quantity, unitAmount, totalAmount: quantity * unitAmount,
      chargeDate: str(formData, "chargeDate") || before.chargeDate,
      note: str(formData, "note") || null, updatedAt: new Date(),
    }).where(eq(memberCharges.id, id)).returning();
    await track(tx, {
      clubId: actor.clubId, entityType: "member_charge", entityId: id,
      action: "UPDATE", actorId: actor.id, beforeData: before, afterData: after, message: "Điều chỉnh khoản phải đóng",
    });
  });
  revalidatePath("/charges"); revalidatePath("/dashboard"); revalidatePath("/reports");
  return { ok: true, message: "Đã cập nhật khoản phải đóng." };
}

export async function createFundTransactionAction(formData: FormData): Promise<MutationResult> {
  const kind = str(formData, "kind") as "MEMBER_PAYMENT" | "OTHER_INCOME" | "EXPENSE" | "OPENING_BALANCE" | "ADJUSTMENT";
  const actor = await requirePermission(
    kind === "MEMBER_PAYMENT" ? PERMISSIONS.PAYMENTS_MANAGE : PERMISSIONS.EXPENSES_MANAGE,
  );
  const direction = kind === "EXPENSE" ? "OUT" : (str(formData, "direction") === "OUT" ? "OUT" : "IN");
  const value = amount(formData);
  if (value <= 0) return { ok: false, message: "Số tiền phải lớn hơn 0." };
  const memberId = str(formData, "memberId") || null;
  if (kind === "MEMBER_PAYMENT" && !memberId) return { ok: false, message: "Vui lòng chọn thành viên." };

  await db.transaction(async (tx) => {
    const [record] = await tx.insert(fundTransactions).values({
      clubId: actor.clubId, direction, kind,
      categoryId: str(formData, "categoryId") || null,
      memberId, matchId: str(formData, "matchId") || null,
      amount: value, transactionDate: str(formData, "transactionDate") || todayInTimezone(),
      note: str(formData, "note") || null, createdBy: actor.id,
    }).returning();
    await track(tx, {
      clubId: actor.clubId, entityType: "fund_transaction", entityId: record.id,
      action: "CREATE", actorId: actor.id, afterData: record,
      message: `${direction === "IN" ? "Ghi nhận thu" : "Ghi nhận chi"} ${value}đ`,
    });
  });
  revalidatePath("/transactions"); revalidatePath("/dashboard"); revalidatePath("/reports");
  return { ok: true, message: direction === "IN" ? "Đã ghi nhận khoản thu." : "Đã ghi nhận khoản chi." };
}

export async function updateFundTransactionAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.EXPENSES_MANAGE);
  const id = str(formData, "id");
  const [before] = await db.select().from(fundTransactions)
    .where(and(eq(fundTransactions.id, id), eq(fundTransactions.clubId, actor.clubId), isNull(fundTransactions.deletedAt))).limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy giao dịch." };
  const nextAmount = str(formData, "amount") ? amount(formData) : before.amount;
  await db.transaction(async (tx) => {
    const [after] = await tx.update(fundTransactions).set({
      amount: nextAmount,
      transactionDate: str(formData, "transactionDate") || before.transactionDate,
      note: str(formData, "note") || null,
      updatedAt: new Date(),
    }).where(eq(fundTransactions.id, id)).returning();
    await track(tx, {
      clubId: actor.clubId, entityType: "fund_transaction", entityId: id,
      action: "UPDATE", actorId: actor.id, beforeData: before, afterData: after, message: "Điều chỉnh giao dịch",
    });
  });
  revalidatePath("/transactions"); revalidatePath("/dashboard"); revalidatePath("/reports");
  return { ok: true, message: "Đã cập nhật giao dịch." };
}

export async function softDeleteFinancialAction(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const entity = str(formData, "entity");
  const actor = await requirePermission(
    entity === "charge" ? PERMISSIONS.CHARGES_MANAGE : PERMISSIONS.EXPENSES_MANAGE,
  );
  if (entity === "charge") {
    const [before] = await db.select().from(memberCharges)
      .where(and(eq(memberCharges.id, id), eq(memberCharges.clubId, actor.clubId))).limit(1);
    if (before) await db.transaction(async (tx) => {
      await tx.update(memberCharges).set({ deletedAt: new Date(), deletedBy: actor.id }).where(eq(memberCharges.id, id));
      await track(tx, {
        clubId: actor.clubId, entityType: "member_charge", entityId: id,
        action: "DELETE", actorId: actor.id, beforeData: before, message: "Xóa khoản phải đóng",
      });
    });
  } else {
    const [before] = await db.select().from(fundTransactions)
      .where(and(eq(fundTransactions.id, id), eq(fundTransactions.clubId, actor.clubId))).limit(1);
    if (before) await db.transaction(async (tx) => {
      await tx.update(fundTransactions).set({ deletedAt: new Date(), deletedBy: actor.id }).where(eq(fundTransactions.id, id));
      await track(tx, {
        clubId: actor.clubId, entityType: "fund_transaction", entityId: id,
        action: "DELETE", actorId: actor.id, beforeData: before, message: "Xóa giao dịch",
      });
    });
  }
  revalidatePath("/transactions"); revalidatePath("/charges"); revalidatePath("/dashboard"); revalidatePath("/reports");
}

export async function createMatchAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_MANAGE);
  const playedOn = str(formData, "playedOn") || todayInTimezone();
  const participantIds = [...new Set(formData.getAll("participants").map(String))];
  const parsedQuantities = parseMatchChargeQuantities(formData);
  if (!parsedQuantities.ok) return { ok: false, message: "Số lần khoản thu phải là số nguyên từ 0 đến 99." };
  const chargeRows = parsedQuantities.rows;

  const involved = new Set([...participantIds, ...chargeRows.map((row) => row.memberId)]);
  const typeIds = [...new Set(chargeRows.map((row) => row.typeId))];
  const validMembers = involved.size ? await db.select({ id: members.id }).from(members)
    .where(and(eq(members.clubId, actor.clubId), inArray(members.id, [...involved]))) : [];
  const validTypes = typeIds.length ? await db.select().from(chargeTypes)
    .where(and(
      eq(chargeTypes.clubId, actor.clubId),
      eq(chargeTypes.calculation, "OCCURRENCE"),
      eq(chargeTypes.isActive, true),
      inArray(chargeTypes.id, typeIds),
    )) : [];
  if (validMembers.length !== involved.size || validTypes.length !== typeIds.length) {
    return { ok: false, message: "Thành viên hoặc loại thu theo trận không hợp lệ." };
  }
  const typeMap = new Map(validTypes.map((type) => [type.id, type]));

  await db.transaction(async (tx) => {
    const [match] = await tx.insert(matches).values({
      clubId: actor.clubId, playedOn, note: str(formData, "note") || null, createdBy: actor.id,
    }).returning();

    if (involved.size) {
      await tx.insert(matchParticipants).values([...involved].map((memberId) => ({ matchId: match.id, memberId })));
    }

    if (chargeRows.length) {
      await tx.insert(memberCharges).values(chargeRows.flatMap(({ memberId, typeId, quantity }) => {
        const type = typeMap.get(typeId);
        return type ? [{
          clubId: actor.clubId, memberId, chargeTypeId: typeId, matchId: match.id,
          source: "MATCH" as const, chargeDate: playedOn, quantity,
          unitAmount: type.defaultAmount, totalAmount: quantity * type.defaultAmount,
          isLossPenaltySnapshot: type.isLossPenalty,
          note: `Phát sinh từ trận ${playedOn}`, createdBy: actor.id,
        }] : [];
      }));
    }

    await track(tx, {
      clubId: actor.clubId, entityType: "match", entityId: match.id,
      action: "CREATE", actorId: actor.id, afterData: match,
      message: `Tạo trận ngày ${playedOn} với ${involved.size} người tham gia`,
    });
  });

  revalidatePath("/matches"); revalidatePath("/charges"); revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { ok: true, message: "Đã tạo trận và khoản thu phát sinh." };
}

export async function updateMatchAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_MANAGE);
  const id = str(formData, "id");
  const [before] = await db.select().from(matches)
    .where(and(eq(matches.id, id), eq(matches.clubId, actor.clubId), isNull(matches.deletedAt))).limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy trận đấu." };

  const playedOn = str(formData, "playedOn") || before.playedOn;
  const participantIds = [...new Set(formData.getAll("participants").map(String))];
  const parsedQuantities = parseMatchChargeQuantities(formData);
  if (!parsedQuantities.ok) return { ok: false, message: "Số lần khoản thu phải là số nguyên từ 0 đến 99." };
  const chargeRows = parsedQuantities.rows;

  const involved = new Set([...participantIds, ...chargeRows.map((row) => row.memberId)]);
  const typeIds = [...new Set(chargeRows.map((row) => row.typeId))];
  const validMembers = involved.size ? await db.select({ id: members.id }).from(members)
    .where(and(eq(members.clubId, actor.clubId), inArray(members.id, [...involved]))) : [];
  const validTypes = typeIds.length ? await db.select().from(chargeTypes)
    .where(and(
      eq(chargeTypes.clubId, actor.clubId),
      eq(chargeTypes.calculation, "OCCURRENCE"),
      eq(chargeTypes.isActive, true),
      inArray(chargeTypes.id, typeIds),
    )) : [];
  if (validMembers.length !== involved.size || validTypes.length !== typeIds.length) {
    return { ok: false, message: "Thành viên hoặc loại thu theo trận không hợp lệ." };
  }
  const typeMap = new Map(validTypes.map((type) => [type.id, type]));
  const existingCharges = await db.select({
    memberId: memberCharges.memberId,
    typeId: memberCharges.chargeTypeId,
    unitAmount: memberCharges.unitAmount,
    isLossPenaltySnapshot: memberCharges.isLossPenaltySnapshot,
  }).from(memberCharges)
    .where(and(eq(memberCharges.matchId, id), isNull(memberCharges.deletedAt)))
    .orderBy(desc(memberCharges.updatedAt));
  const existingChargeSnapshots = new Map<string, { unitAmount: number; isLossPenaltySnapshot: boolean }>();
  for (const charge of existingCharges) {
    const key = `${charge.memberId}|${charge.typeId}`;
    if (!existingChargeSnapshots.has(key)) {
      existingChargeSnapshots.set(key, {
        unitAmount: charge.unitAmount,
        isLossPenaltySnapshot: charge.isLossPenaltySnapshot,
      });
    }
  }
  const existingParticipants = await db.select({ id: matchParticipants.id, memberId: matchParticipants.memberId })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, id));
  const existingMemberIds = new Set(existingParticipants.flatMap((row) => row.memberId ? [row.memberId] : []));
  const addedMemberIds = [...involved].filter((memberId) => !existingMemberIds.has(memberId));
  const removedParticipantIds = existingParticipants
    .filter((row) => row.memberId && !involved.has(row.memberId))
    .map((row) => row.id);
  const participantsChanged = addedMemberIds.length > 0 || removedParticipantIds.length > 0;
  const teamDraftInvalidated = participantsChanged || playedOn !== before.playedOn;

  await db.transaction(async (tx) => {
    const [after] = await tx.update(matches).set({
      playedOn,
      note: str(formData, "note") || null,
      updatedAt: new Date(),
    }).where(eq(matches.id, id)).returning();

    if (teamDraftInvalidated) {
      await tx.delete(matchTeamVersions).where(and(
        eq(matchTeamVersions.matchId, id),
        eq(matchTeamVersions.status, "DRAFT"),
      ));
    }
    if (removedParticipantIds.length) {
      await tx.delete(matchParticipants).where(inArray(matchParticipants.id, removedParticipantIds));
    }
    if (addedMemberIds.length) {
      await tx.insert(matchParticipants).values(addedMemberIds.map((memberId) => ({ matchId: id, memberId })));
    }

    await tx.update(memberCharges).set({
      deletedAt: new Date(),
      deletedBy: actor.id,
      updatedAt: new Date(),
    }).where(and(eq(memberCharges.matchId, id), isNull(memberCharges.deletedAt)));

    if (chargeRows.length) {
      await tx.insert(memberCharges).values(chargeRows.flatMap(({ memberId, typeId, quantity }) => {
        const type = typeMap.get(typeId);
        const snapshot = existingChargeSnapshots.get(`${memberId}|${typeId}`);
        const unitAmount = snapshot?.unitAmount ?? type?.defaultAmount ?? 0;
        return type ? [{
          clubId: actor.clubId,
          memberId,
          chargeTypeId: typeId,
          matchId: id,
          source: "MATCH" as const,
          chargeDate: playedOn,
          quantity,
          unitAmount,
          totalAmount: quantity * unitAmount,
          isLossPenaltySnapshot: snapshot?.isLossPenaltySnapshot ?? type.isLossPenalty,
          note: `Phát sinh từ trận ${playedOn}`,
          createdBy: actor.id,
        }] : [];
      }));
    }

    await track(tx, {
      clubId: actor.clubId,
      entityType: "match",
      entityId: id,
      action: "UPDATE",
      actorId: actor.id,
      beforeData: before,
      afterData: { ...after, participants: [...involved], chargeQuantities: chargeRows },
      message: `Cập nhật trận ngày ${playedOn} với ${involved.size} người tham gia`,
    });
  });

  revalidatePath("/matches"); revalidatePath("/charges"); revalidatePath("/dashboard"); revalidatePath("/reports");
  return { ok: true, message: "Đã cập nhật trận và các khoản thu phát sinh." };
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.MATCHES_MANAGE);
  const id = str(formData, "id");
  const [before] = await db.select().from(matches)
    .where(and(eq(matches.id, id), eq(matches.clubId, actor.clubId), isNull(matches.deletedAt))).limit(1);
  if (!before) return;

  await db.transaction(async (tx) => {
    const deletedAt = new Date();
    await tx.update(matches).set({
      deletedAt,
      deletedBy: actor.id,
      updatedAt: deletedAt,
    }).where(eq(matches.id, id));
    await tx.update(memberCharges).set({
      deletedAt,
      deletedBy: actor.id,
      updatedAt: deletedAt,
    }).where(and(eq(memberCharges.matchId, id), isNull(memberCharges.deletedAt)));
    await track(tx, {
      clubId: actor.clubId,
      entityType: "match",
      entityId: id,
      action: "DELETE",
      actorId: actor.id,
      beforeData: before,
      message: `Xóa trận ngày ${before.playedOn} và các khoản thu phát sinh`,
    });
  });

  revalidatePath("/matches"); revalidatePath("/charges"); revalidatePath("/dashboard"); revalidatePath("/reports");
}

export async function updateClubAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const [before] = await db.select().from(clubs).where(eq(clubs.id, actor.clubId)).limit(1);
  if (!before) return { ok: false, message: "Không tìm thấy cấu hình club." };

  let logoUrl = before.logoUrl;
  let qrUrl = before.qrUrl;
  const logo = formData.get("logo");
  const qr = formData.get("qr");
  const images = [logo, qr].filter((file): file is File => file instanceof File && file.size > 0);
  const invalidImage = images.find((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type));
  const oversizedImage = images.find((file) => file.size > 4 * 1024 * 1024);
  if (invalidImage) return { ok: false, message: "Logo và QR chỉ nhận ảnh PNG, JPEG hoặc WebP." };
  if (oversizedImage) return { ok: false, message: "Mỗi ảnh không được lớn hơn 4 MB." };

  try {
    if (logo instanceof File && logo.size) {
      logoUrl = (await put(`clubs/${actor.clubId}/logo-${Date.now()}`, logo, {
        access: "private",
        addRandomSuffix: true,
      })).url;
    }
    if (qr instanceof File && qr.size) {
      qrUrl = (await put(`clubs/${actor.clubId}/qr-${Date.now()}`, qr, {
        access: "private",
        addRandomSuffix: true,
      })).url;
    }
  } catch (error) {
    console.error("[updateClubAction] Blob upload failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown Blob error",
    });
    return { ok: false, message: "Không thể tải ảnh lên kho lưu trữ. Vui lòng thử lại." };
  }

  await db.transaction(async (tx) => {
    const [after] = await tx.update(clubs).set({
      name: str(formData, "name") || before.name,
      logoUrl, qrUrl,
      bankName: str(formData, "bankName") || null,
      bankAccountNumber: str(formData, "bankAccountNumber") || null,
      bankAccountHolder: str(formData, "bankAccountHolder") || null,
      updatedAt: new Date(),
    }).where(eq(clubs.id, actor.clubId)).returning();
    await track(tx, {
      clubId: actor.clubId, entityType: "club", entityId: actor.clubId,
      action: "UPDATE", actorId: actor.id, beforeData: before, afterData: after, message: "Cập nhật cấu hình đội bóng",
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Đã lưu cài đặt." };
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const userId = str(formData, "userId");
  const [target] = await db.select({ id: users.id, memberId: users.memberId }).from(users).where(and(
    eq(users.id, userId),
    eq(users.clubId, actor.clubId),
  )).limit(1);
  if (!target) return;
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, target.id));
    await track(tx, {
      clubId: actor.clubId, entityType: target.memberId ? "member" : "user", entityId: target.memberId ?? target.id,
      action: "RESET_PASSWORD", actorId: actor.id, message: "Đặt lại mật khẩu về mật khẩu mặc định",
    });
  });
  revalidatePath("/settings");
  if (target.memberId) revalidatePath(`/members/${target.memberId}`);
}

export async function changeOwnPasswordAction(formData: FormData): Promise<MutationResult> {
  const actor = await requireUser();
  const currentPassword = str(formData, "currentPassword");
  const newPassword = str(formData, "newPassword");
  if (newPassword.length < 8) return { ok: false, message: "Mật khẩu mới cần ít nhất 8 ký tự." };
  const [record] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
    return { ok: false, message: "Mật khẩu hiện tại không đúng." };
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, actor.id));
    await track(tx, {
      clubId: actor.clubId, entityType: "user", entityId: actor.id,
      action: "UPDATE", actorId: actor.id, message: "Đổi mật khẩu",
    });
  });
  return { ok: true, message: "Đã đổi mật khẩu." };
}

export async function createFundCategoryAction(formData: FormData): Promise<MutationResult> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const name = str(formData, "name");
  const direction = str(formData, "direction") === "OUT" ? "OUT" : "IN";
  if (!name) return { ok: false, message: "Vui lòng nhập tên danh mục." };
  const [record] = await db.insert(fundCategories).values({
    clubId: actor.clubId, name, direction,
  }).returning();
  await db.insert(activityLogs).values({
    clubId: actor.clubId, entityType: "fund_category", entityId: record.id,
    action: "CREATE", actorId: actor.id, afterData: record, message: `Tạo danh mục ${name}`,
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
  return { ok: true, message: "Đã tạo danh mục thu/chi." };
}

export async function saveUserPoliciesAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const userId = str(formData, "userId");
  const mode = str(formData, "mode");
  const selected = new Set(formData.getAll("permissions").map(String));

  await db.transaction(async (tx) => {
    await tx.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId));
    if (mode === "custom") {
      await tx.insert(userPermissionOverrides).values(
        PERMISSION_DEFINITIONS.map((permission) => ({
          userId, permissionKey: permission.key, allowed: selected.has(permission.key), createdBy: actor.id,
        })),
      );
    }
    await track(tx, {
      clubId: actor.clubId, entityType: "user_policy", entityId: userId,
      action: "UPDATE", actorId: actor.id, message: mode === "custom" ? "Cập nhật policy riêng" : "Khôi phục policy theo vai trò",
    });
  });
  revalidatePath("/settings");
}

export async function addCommentAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const entityType = str(formData, "entityType");
  const entityId = str(formData, "entityId");
  const message = str(formData, "message");
  if (!entityType || !entityId || !message) return;
  await db.insert(activityLogs).values({
    clubId: actor.clubId, entityType, entityId, action: "COMMENT", actorId: actor.id, message,
  });
  revalidatePath(str(formData, "path") || "/dashboard");
}
