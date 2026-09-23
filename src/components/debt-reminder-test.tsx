"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Recipient = { id: string; name: string; phone: string };

export function DebtReminderTest({ recipients }: { recipients: Recipient[] }) {
  const [recipientId, setRecipientId] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function sendTest() {
    const recipient = recipients.find((item) => item.id === recipientId);
    if (!recipient) return;
    if (!window.confirm(`Gửi thông báo nhắc nợ MÔ PHỎNG cho ${recipient.name}?\nThông báo này không tạo nợ hoặc giao dịch FCFund. Trang mô phỏng có nút thử deeplink ngân hàng thật với số tiền cố định 1.000đ.`)) return;
    setPending(true);
    try {
      const response = await fetch("/api/debt-reminders/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: recipientId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; recipientName?: string; pushStatus?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Không thể gửi thông báo thử.");
      const pushMessage = result.pushStatus === "SENT" ? "Push đã gửi thành công."
        : result.pushStatus === "PARTIAL" ? "Push đã gửi tới một số thiết bị; thiết bị khác gặp lỗi."
          : result.pushStatus === "FAILED" ? "Push chưa gửi được tới thiết bị."
            : "Push chưa bật hoặc máy chủ chưa cấu hình Push.";
      window.alert(`Đã lưu nhắc nợ mô phỏng vào Hộp thư của ${result.recipientName ?? recipient.name}. ${pushMessage}`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không thể gửi thông báo thử.");
    } finally {
      setPending(false);
    }
  }

  return <article className="panel debt-reminder-test-panel">
    <div className="panel-heading"><div><span className="eyebrow">Kiểm tra thông báo</span><h2>Thử nhắc nợ</h2></div></div>
    <p className="panel-note">Chọn một tài khoản nhận thông báo mẫu. Người nhận có thể mở Hộp thư và thử deeplink ngân hàng thật với số tiền cố định 1.000đ. FCFund không tạo nợ, không tự ghi nhận tiền và không tính vào giới hạn nhắc nợ 60 phút; giao dịch chỉ xảy ra nếu người nhận xác nhận trong app ngân hàng.</p>
    <div className="form-stack"><label>Tài khoản nhận<select value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Chọn một tài khoản</option>{recipients.map((recipient) => <option value={recipient.id} key={recipient.id}>{recipient.name} · {recipient.phone}</option>)}</select></label>
      <button type="button" className="button secondary" disabled={!recipientId || pending} onClick={sendTest}>{pending ? "Đang gửi…" : "Gửi nhắc nợ mô phỏng"}</button></div>
  </article>;
}
