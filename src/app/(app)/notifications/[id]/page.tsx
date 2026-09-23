/* eslint-disable @next/next/no-img-element -- QR is an authenticated streamed club asset. */
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { clubs, debtReminders, notificationEvents, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { currentMemberBalances } from "@/lib/current-member-balance";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { MarkReminderRead } from "./read-marker";
import { CopyBankAccount } from "@/components/copy-bank-account";

export const metadata = { title: "Chi tiết nhắc đóng quỹ" };

export default async function DebtReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [reminder] = await db.select({ id: debtReminders.id, memberId: debtReminders.memberId, recipientUserId: debtReminders.recipientUserId, debt: debtReminders.debtAmountSnapshot, fromMonth: debtReminders.reportFromMonth, toMonth: debtReminders.reportToMonth, createdAt: debtReminders.createdAt, sender: users.displayName })
    .from(debtReminders).leftJoin(users, eq(debtReminders.createdByUserId, users.id))
    .where(and(eq(debtReminders.id, id), eq(debtReminders.clubId, user.clubId), eq(debtReminders.recipientUserId, user.id), eq(debtReminders.memberId, user.memberId!))).limit(1);
  if (!reminder) notFound();
  const [event] = await db.select({ id: notificationEvents.id }).from(notificationEvents).where(and(eq(notificationEvents.userId, user.id), eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.entityType, "debt_reminder"), eq(notificationEvents.entityId, id))).limit(1);
  const [club] = await db.select({ name: clubs.name, qrUrl: clubs.qrUrl, bankName: clubs.bankName, bankAccountNumber: clubs.bankAccountNumber, bankAccountHolder: clubs.bankAccountHolder }).from(clubs).where(eq(clubs.id, user.clubId)).limit(1);
  const currentBalance = (await currentMemberBalances(user.clubId)).get(reminder.memberId) ?? 0;
  return <><MarkReminderRead eventId={event?.id ?? null} /><PageHeader eyebrow="Hộp thư" title="Nhắc đóng quỹ" description={`${club?.name ?? "Đội bóng"} · ${formatDateTime(reminder.createdAt)}`} />
    <article className="panel debt-reminder-detail"><p>Nhắc cho kỳ {reminder.fromMonth.slice(0, 7)} → {reminder.toMonth.slice(0, 7)} · Người gửi: {reminder.sender ?? "Thủ quỹ đội"}</p><div className="debt-reminder-figures"><div><small>Nợ tại lúc nhắc</small><strong>{formatMoney(reminder.debt)}</strong></div><div><small>Hiện tại</small><strong className={currentBalance < 0 ? "money-out" : "money-in"}>{currentBalance < 0 ? `Còn nợ ${formatMoney(-currentBalance)}` : currentBalance > 0 ? `Đóng dư ${formatMoney(currentBalance)}` : "Không còn nợ"}</strong></div></div>
      <h2>Thông tin chuyển khoản hiện hành</h2>{club?.qrUrl && <img className="debt-reminder-qr" src="/api/club-assets/qr" alt="Mã QR chuyển khoản của đội" />}<dl><div><dt>Ngân hàng</dt><dd>{club?.bankName || "Chưa cấu hình"}</dd></div><div><dt>Số tài khoản</dt><dd>{club?.bankAccountNumber || "Chưa cấu hình"}</dd></div><div><dt>Chủ tài khoản</dt><dd>{club?.bankAccountHolder || "Chưa cấu hình"}</dd></div></dl>{club?.bankAccountNumber && <CopyBankAccount account={club.bankAccountNumber} />}<p className="panel-note">Bạn có thể chuyển số tiền phù hợp. Số dư được cập nhật sau khi Thủ quỹ/Admin ghi nhận tiền thực nhận.</p></article></>;
}
