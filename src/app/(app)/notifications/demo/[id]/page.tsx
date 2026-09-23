/* eslint-disable @next/next/no-img-element -- QR is an authenticated streamed club asset. */
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { clubs, notificationEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CopyBankAccount } from "@/components/copy-bank-account";
import { DebtPaymentButton } from "@/components/debt-payment-button";
import { PageHeader } from "@/components/page-header";
import { MarkReminderRead } from "../../[id]/read-marker";

export const metadata = { title: "Mô phỏng nhắc đóng quỹ" };

const PAYMENT_MESSAGES: Record<string, string> = {
  invalid: "Yêu cầu thanh toán thử không hợp lệ.",
  "not-configured": "Đội bóng chưa cấu hình đầy đủ ngân hàng nhận tiền.",
  "unsupported-device": "Thiết bị này chưa hỗ trợ mở ứng dụng ngân hàng trực tiếp. Hãy dùng QR hoặc sao chép số tài khoản.",
  "bank-app": "Ứng dụng ngân hàng được chọn không hợp lệ hoặc không còn được hỗ trợ.",
  failed: "Chưa thể tạo deeplink thanh toán thử. Vui lòng thử lại.",
};

const TEST_AMOUNT = 1_000;

export default async function DebtReminderTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string | string[] }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const paymentStatus = typeof query.payment === "string" ? query.payment : "";
  const paymentMessage = PAYMENT_MESSAGES[paymentStatus] ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [event] = await db.select({ id: notificationEvents.id, createdAt: notificationEvents.createdAt })
    .from(notificationEvents).where(and(eq(notificationEvents.id, id), eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.userId, user.id), eq(notificationEvents.type, "DEBT_REMINDER_TEST"))).limit(1);
  if (!event) notFound();
  const [club] = await db.select({
    name: clubs.name,
    bankName: clubs.bankName,
    bankCode: clubs.bankCode,
    bankBin: clubs.bankBin,
    bankAccountNumber: clubs.bankAccountNumber,
    bankAccountHolder: clubs.bankAccountHolder,
  }).from(clubs).where(eq(clubs.id, user.clubId)).limit(1);
  const paymentReady = !!(club?.bankCode && club.bankBin && club.bankAccountNumber && club.bankAccountHolder);

  return <><MarkReminderRead eventId={event.id} /><PageHeader eyebrow="Hộp thư · Mô phỏng" title="Nhắc đóng quỹ thử" description={`${club?.name ?? "Đội bóng"} · ${formatDateTime(event.createdAt)}`} />
    <article className="panel debt-reminder-detail">
      <p className="push-settings-warning"><strong>ĐÂY LÀ THÔNG BÁO MÔ PHỎNG.</strong> Công nợ không thay đổi. Nút thanh toán bên dưới dùng deeplink ngân hàng THẬT với số tiền thử cố định 1.000đ; chỉ xác nhận trong app ngân hàng nếu bạn thực sự muốn chuyển 1.000đ.</p>
      <div className="debt-reminder-figures"><div><small>Số tiền thanh toán thử</small><strong>{formatMoney(TEST_AMOUNT)}</strong></div><div><small>Công nợ thực tế</small><strong>Không thay đổi</strong></div></div>
      {paymentReady ? (
        <>
          <DebtPaymentButton
            reminderId={id}
            amount={TEST_AMOUNT}
            initialMessage={paymentMessage}
            paymentPath={`/api/payments/debt-reminder-test/${encodeURIComponent(id)}`}
            testMode
          />
          <div className="debt-payment-divider"><span>Hoặc quét mã QR bên dưới</span></div>
          <div className="debt-dynamic-qr">
            <img
              className="debt-reminder-qr"
              src={`/api/payments/debt-reminder-test/${encodeURIComponent(id)}/qr`}
              alt="VietQR thanh toán thử 1.000đ"
            />
            <small>QR thử dùng deeplink thật với số tiền cố định 1.000đ.</small>
          </div>
          <div className="debt-payment-divider"><span>Hoặc thanh toán theo STK</span></div>
        </>
      ) : (
        <p className="panel-note debt-payment-message">Thanh toán thử và QR động chưa sẵn sàng vì đội bóng chưa cấu hình đủ ngân hàng nhận tiền.</p>
      )}
      <dl className="debt-bank-details"><div><dt>Ngân hàng</dt><dd>{club?.bankName || "Chưa cấu hình"}</dd></div><div><dt>Số tài khoản</dt><dd>{club?.bankAccountNumber || "Chưa cấu hình"}</dd></div><div><dt>Chủ tài khoản</dt><dd>{club?.bankAccountHolder || "Chưa cấu hình"}</dd></div></dl>
      {club?.bankAccountNumber && <CopyBankAccount account={club.bankAccountNumber} />}
      <p className="panel-note">Nếu bấm Thanh toán thử, FCFund sẽ mở app ngân hàng với số tiền cố định 1.000đ. Không có giao dịch FCFund nào được tạo tự động.</p>
    </article></>;
}
