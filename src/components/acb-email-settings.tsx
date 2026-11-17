import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { acbEmailImports, acbEmailSettings, members } from "@/db/schema";
import { ACB_SENDER, ACB_SUBJECT } from "@/lib/acb-email-parser";
import { saveAcbSettings } from "@/app/(app)/settings/acb-actions";
import { formatMoney } from "@/lib/format";
import { MutationForm, SubmitButton } from "./mutation-form";

const labels: Record<string, string> = { RECORDED: "Đã ghi nhận", SIMULATED: "Mô phỏng", IGNORED: "Bỏ qua", REVIEW_REQUIRED: "Cần đối chiếu", REVERSED: "Đã hủy" };

export async function AcbEmailSettings({ clubId }: { clubId: string }) {
  const [settings] = await db.select().from(acbEmailSettings).where(eq(acbEmailSettings.clubId, clubId)).limit(1);
  const imports = await db.select({ id: acbEmailImports.id, status: acbEmailImports.status, reason: acbEmailImports.reason, amount: acbEmailImports.amount, name: members.fullName, createdAt: acbEmailImports.createdAt, receivedAt: acbEmailImports.receivedAt, transactionDate: acbEmailImports.transactionDate, transactionId: acbEmailImports.transactionId })
    .from(acbEmailImports).leftJoin(members, eq(acbEmailImports.memberId, members.id)).where(eq(acbEmailImports.clubId, clubId)).orderBy(desc(acbEmailImports.createdAt)).limit(50);
  const stamp = (date: Date) => date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return <article className="panel">
    <div className="panel-heading"><div><span className="eyebrow">Tích hợp</span><h2>Ghi nhận tiền nộp qua email ACB</h2></div></div>
    <MutationForm action={saveAcbSettings} className="form-stack">
      <label>Chế độ<select name="mode" defaultValue={settings?.mode ?? "OFF"}><option value="OFF">Tắt</option><option value="SIMULATE">Mô phỏng — chưa cộng tiền</option><option value="LIVE">Tự động ghi nhận</option></select></label>
      <label>Gmail nhận thông báo<input name="mailbox" type="email" defaultValue={settings?.mailbox ?? ""} required /></label>
      <label>Người gửi<input name="sender" type="email" defaultValue={settings?.sender ?? ACB_SENDER} required /></label>
      <label>Tiêu đề chính xác<input name="subject" defaultValue={settings?.subject ?? ACB_SUBJECT} required /></label>
      <label>Tài khoản hiển thị trong email<input name="accountPattern" defaultValue={settings?.accountPattern ?? ""} placeholder="Nhập đúng chuỗi tài khoản ACB hiển thị" required /></label>
      <p className="panel-note">Endpoint: <code>/api/integrations/acb-email</code><br />API key: {settings?.keyHash ? "Đã cấu hình" : "Chưa có"}. {settings?.activatedAt ? `Chỉ ghi nhận email từ ${stamp(settings.activatedAt)}.` : "Mốc bắt đầu sẽ được lưu khi bật ghi nhận thật lần đầu."}</p>
      <label className="check-field"><input type="checkbox" name="rotateKey" /> Tạo / thay API key (key cũ sẽ hết hiệu lực)</label>
      <label className="check-field"><input type="checkbox" name="revokeKey" /> Thu hồi API key và tắt tích hợp</label>
      <SubmitButton>Lưu tích hợp ACB</SubmitButton>
    </MutationForm>
    <p className="panel-note">Kết nối gần nhất: {settings?.lastReceivedAt ? stamp(settings.lastReceivedAt) : "Chưa nhận email"}. Hãy thử chế độ mô phỏng trước khi bật ghi nhận thật.</p>
    <details><summary>Lịch sử xử lý (50 email gần nhất)</summary><div className="settings-list">{imports.map((row) => <div key={row.id}><span><strong>{labels[row.status] ?? row.status} · {row.name ?? "Không xác định thành viên"}</strong><small>{row.reason}</small><small>Email: {stamp(row.receivedAt)} · Xử lý: {stamp(row.createdAt)}{row.transactionDate ? ` · Ngày nộp: ${row.transactionDate}` : ""}</small></span><b>{row.amount ? formatMoney(row.amount) : "—"}</b></div>)}{!imports.length && <p>Chưa có email được xử lý.</p>}</div></details>
  </article>;
}
