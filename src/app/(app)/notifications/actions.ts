"use server";

import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activityLogs, clubs, debtReminders, fundTransactions, memberCharges, members, notificationEvents, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getBalanceReportMonth } from "@/lib/balance-report";
import { PERMISSIONS } from "@/lib/constants";
import { todayInTimezone } from "@/lib/format";
import { can } from "@/lib/permissions";
import { dispatchEvent } from "@/lib/push-notifications";

type ReminderResult = { ok: boolean; message: string; debt?: number; memberName?: string; pushStatus?: string };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

async function checkReminderInput(memberId: string, fromMonth: string, toMonth: string): Promise<ReminderResult | null> {
  const actor = await requireUser();
  if (!["ADMIN", "TREASURER"].includes(actor.role) || !(await can(PERMISSIONS.DEBT_REMINDERS_SEND))) return { ok: false, message: "Bạn không có quyền gửi nhắc nợ." };
  if (!monthPattern.test(fromMonth) || !monthPattern.test(toMonth) || fromMonth > toMonth || toMonth !== todayInTimezone().slice(0, 7)) return { ok: false, message: "Chỉ được nhắc nợ ở khoảng tháng kết thúc trong tháng hiện tại." };
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return { ok: false, message: "Thành viên không hợp lệ." };
  return null;
}

async function eligibility(memberId: string, fromMonth: string, toMonth: string): Promise<ReminderResult> {
  const actor = await requireUser();
  const invalid = await checkReminderInput(memberId, fromMonth, toMonth);
  if (invalid) return invalid;
  const [member] = await db.select({ id: members.id, name: members.fullName })
    .from(members).where(and(eq(members.id, memberId), eq(members.clubId, actor.clubId), eq(members.status, "ACTIVE"))).limit(1);
  if (!member) return { ok: false, message: "Không tìm thấy thành viên đang hoạt động." };
  const [recipient] = await db.select({ id: users.id }).from(users).where(and(eq(users.clubId, actor.clubId), eq(users.memberId, memberId), eq(users.isActive, true))).limit(1);
  if (!recipient) return { ok: false, message: "Thành viên chưa thể nhận thông báo do chưa có tài khoản đăng nhập liên kết." };
  const [club] = await db.select({ qrUrl: clubs.qrUrl, bankName: clubs.bankName, bankAccountNumber: clubs.bankAccountNumber, bankAccountHolder: clubs.bankAccountHolder }).from(clubs).where(eq(clubs.id, actor.clubId)).limit(1);
  if (!club?.qrUrl || !club.bankName || !club.bankAccountNumber || !club.bankAccountHolder) return { ok: false, message: "Cần cấu hình ảnh QR và đầy đủ thông tin tài khoản trong Cài đặt." };
  const [latest] = await db.select({ createdAt: debtReminders.createdAt }).from(debtReminders).where(and(eq(debtReminders.clubId, actor.clubId), eq(debtReminders.memberId, memberId))).orderBy(desc(debtReminders.createdAt)).limit(1);
  if (latest && Date.now() - latest.createdAt.getTime() < 60 * 60 * 1000) return { ok: false, message: `Có thể nhắc lại sau ${new Date(latest.createdAt.getTime() + 60 * 60 * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.` };
  const today = todayInTimezone();
  const [charges, payments] = await Promise.all([
    db.select({ chargeDate: memberCharges.chargeDate, amount: memberCharges.totalAmount, nextMonth: memberCharges.reportNextMonthSnapshot }).from(memberCharges).where(and(eq(memberCharges.clubId, actor.clubId), eq(memberCharges.memberId, memberId), isNull(memberCharges.deletedAt), lte(memberCharges.chargeDate, today))),
    db.select({ amount: fundTransactions.amount }).from(fundTransactions).where(and(eq(fundTransactions.clubId, actor.clubId), eq(fundTransactions.memberId, memberId), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt), lte(fundTransactions.transactionDate, today))),
  ]);
  const balance = payments.reduce((sum, row) => sum + row.amount, 0) - charges.filter((row) => getBalanceReportMonth(row.chargeDate, row.nextMonth) <= today.slice(0, 7)).reduce((sum, row) => sum + row.amount, 0);
  if (balance >= 0) return { ok: false, message: "Thành viên hiện không còn nợ." };
  return { ok: true, message: "Có thể gửi nhắc nợ.", debt: -balance, memberName: member.name };
}

export async function prepareDebtReminder(memberId: string, fromMonth: string, toMonth: string): Promise<ReminderResult> {
  return eligibility(memberId, fromMonth, toMonth);
}

export async function sendDebtReminder(memberId: string, fromMonth: string, toMonth: string): Promise<ReminderResult> {
  const actor = await requireUser();
  const initial = await eligibility(memberId, fromMonth, toMonth);
  if (!initial.ok) return initial;
  const result = await db.transaction(async (tx) => {
    // Serialize sends for the same member; the eligibility check is repeated under this lock.
    await tx.execute(sql`SELECT id FROM members WHERE id = ${memberId} AND club_id = ${actor.clubId} FOR UPDATE`);
    const fresh = await eligibility(memberId, fromMonth, toMonth);
    if (!fresh.ok) return fresh;
    const [recipient] = await tx.select({ id: users.id }).from(users).where(and(eq(users.clubId, actor.clubId), eq(users.memberId, memberId), eq(users.isActive, true))).limit(1);
    if (!recipient) return { ok: false, message: "Thành viên chưa thể nhận thông báo do chưa có tài khoản đăng nhập liên kết." };
    const [reminder] = await tx.insert(debtReminders).values({ clubId: actor.clubId, memberId, recipientUserId: recipient.id, createdByUserId: actor.id, reportFromMonth: `${fromMonth}-01`, reportToMonth: `${toMonth}-01`, balanceSnapshot: -fresh.debt!, debtAmountSnapshot: fresh.debt! }).returning({ id: debtReminders.id });
    const [event] = await tx.insert(notificationEvents).values({ clubId: actor.clubId, userId: recipient.id, type: "DEBT_REMINDER", title: "Nhắc đóng quỹ", body: "Bạn có khoản quỹ cần thanh toán. Mở ứng dụng để xem chi tiết.", url: `/n/${reminder.id}`, entityType: "debt_reminder", entityId: reminder.id, dedupeKey: `DEBT_REMINDER:${reminder.id}` }).returning();
    await tx.insert(activityLogs).values({ clubId: actor.clubId, entityType: "debt_reminder", entityId: reminder.id, action: "CREATE", actorId: actor.id, message: `Nhắc ${fresh.memberName} đóng quỹ; nợ tại lúc nhắc ${fresh.debt} đ.` });
    return { ok: true, message: "Đã lưu lời nhắc vào Hộp thư.", debt: fresh.debt, event };
  });
  if (!result.ok || !('event' in result) || !result.event) return result;
  try { await dispatchEvent(result.event); } catch { await db.update(notificationEvents).set({ status: "FAILED", updatedAt: new Date() }).where(eq(notificationEvents.id, result.event.id)); }
  const [saved] = await db.select({ status: notificationEvents.status }).from(notificationEvents).where(eq(notificationEvents.id, result.event.id)).limit(1);
  revalidatePath("/notifications");
  revalidatePath("/reports");
  return { ok: true, debt: result.debt, pushStatus: saved?.status, message: saved?.status === "SKIPPED" ? "Đã lưu vào Hộp thư, Push chưa bật." : saved?.status === "FAILED" ? "Đã lưu vào Hộp thư, chưa gửi được Push." : "Đã lưu vào Hộp thư và gửi Push." };
}

export async function markNotificationRead(eventId: string) {
  const user = await requireUser();
  await db.update(notificationEvents).set({ readAt: new Date(), updatedAt: new Date() }).where(and(eq(notificationEvents.id, eventId), eq(notificationEvents.userId, user.id), eq(notificationEvents.clubId, user.clubId), isNull(notificationEvents.readAt)));
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.update(notificationEvents).set({ readAt: new Date(), updatedAt: new Date() }).where(and(eq(notificationEvents.userId, user.id), eq(notificationEvents.clubId, user.clubId), isNull(notificationEvents.readAt), sql`${notificationEvents.type} <> 'TEST_NOTIFICATION'`));
  revalidatePath("/notifications");
}

export async function openNotification(eventId: string) {
  const user = await requireUser();
  const [event] = await db.select({ id: notificationEvents.id, url: notificationEvents.url, entityType: notificationEvents.entityType, entityId: notificationEvents.entityId })
    .from(notificationEvents).where(and(eq(notificationEvents.id, eventId), eq(notificationEvents.userId, user.id), eq(notificationEvents.clubId, user.clubId))).limit(1);
  if (!event) redirect("/notifications");
  await markNotificationRead(eventId);
  const safeUrl = event.entityType === "debt_reminder" && event.entityId ? `/notifications/${event.entityId}` : event.url;
  redirect(safeUrl.startsWith("/") && !safeUrl.startsWith("//") ? safeUrl : "/notifications");
}
