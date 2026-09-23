/* eslint-disable @next/next/no-img-element -- QR is an authenticated streamed club asset. */
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { clubs, notificationEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CopyBankAccount } from "@/components/copy-bank-account";
import { PageHeader } from "@/components/page-header";
import { MarkReminderRead } from "../../[id]/read-marker";

export const metadata = { title: "Mô phỏng nhắc đóng quỹ" };

export default async function DebtReminderTestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [event] = await db.select({ id: notificationEvents.id, createdAt: notificationEvents.createdAt })
    .from(notificationEvents).where(and(eq(notificationEvents.id, id), eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.userId, user.id), eq(notificationEvents.type, "DEBT_REMINDER_TEST"))).limit(1);
  if (!event) notFound();
  const [club] = await db.select({ name: clubs.name, qrUrl: clubs.qrUrl, bankName: clubs.bankName, bankAccountNumber: clubs.bankAccountNumber, bankAccountHolder: clubs.bankAccountHolder })
    .from(clubs).where(eq(clubs.id, user.clubId)).limit(1);

  return <><MarkReminderRead eventId={event.id} /><PageHeader eyebrow="Hộp thư · Mô phỏng" title="Nhắc đóng quỹ thử" description={`${club?.name ?? "Đội bóng"} · ${formatDateTime(event.createdAt)}`} />
    <article className="panel debt-reminder-detail">
      <p className="push-settings-warning"><strong>ĐÂY LÀ THÔNG BÁO MÔ PHỎNG.</strong> Số tiền bên dưới chỉ là ví dụ; không phải khoản nợ của bạn và không có giao dịch nào được tạo.</p>
      <div className="debt-reminder-figures"><div><small>Số nợ ví dụ</small><strong>{formatMoney(100_000)}</strong></div><div><small>Công nợ thực tế</small><strong>Không thay đổi</strong></div></div>
      <h2>Thông tin chuyển khoản hiện hành</h2>{club?.qrUrl ? <img className="debt-reminder-qr" src="/api/club-assets/qr" alt="Mã QR chuyển khoản của đội" /> : <p className="panel-note">Đội chưa cấu hình ảnh QR trong Cài đặt.</p>}
      <dl><div><dt>Ngân hàng</dt><dd>{club?.bankName || "Chưa cấu hình"}</dd></div><div><dt>Số tài khoản</dt><dd>{club?.bankAccountNumber || "Chưa cấu hình"}</dd></div><div><dt>Chủ tài khoản</dt><dd>{club?.bankAccountHolder || "Chưa cấu hình"}</dd></div></dl>
      {club?.bankAccountNumber && <CopyBankAccount account={club.bankAccountNumber} />}
      <p className="panel-note">Không chuyển tiền dựa trên số tiền ví dụ trong bản mô phỏng này.</p>
    </article></>;
}
