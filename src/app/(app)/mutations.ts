"use server";

import { put } from "@vercel/blob";
import { hash } from "bcryptjs";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  chargeTypes,
  clubs,
  fundCategories,
  fundTransactions,
  matches,
  matchParticipants,
  matchTeamVersions,
  memberChargeAssignments,
  memberCharges,
  members,
  userPermissionOverrides,
  users,
} from "@/db/schema";
import {
  DEFAULT_PASSWORD,
  ICON_ALLOWLIST,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
} from "@/lib/constants";
import { normalizePhone, todayInTimezone } from "@/lib/format";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

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
  role: z.enum(["MEMBER", "TREASURER"]),
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
      clubId: actor.clubId, entityType: "charge_assignment", entityId: record.id,
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
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.clubId, actor.clubId)));
    await track(tx, {
      clubId: actor.clubId, entityType: "user", entityId: userId,
      action: "RESET_PASSWORD", actorId: actor.id, message: "Đặt lại mật khẩu về mật khẩu mặc định",
    });
  });
  revalidatePath("/settings");
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
