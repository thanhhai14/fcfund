"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareDebtReminder, sendDebtReminder } from "@/app/(app)/notifications/actions";
import { formatMoney } from "@/lib/format";
import { Icon } from "./icon";

export function DebtReminderButton({ memberId, fromMonth, toMonth, enabled, reason }: { memberId: string; fromMonth: string; toMonth: string; enabled: boolean; reason?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <span className="debt-reminder-control"><button type="button" className="debt-reminder-bell" title={reason || "Nhắc đóng quỹ"} aria-label="Nhắc đóng quỹ" disabled={!enabled || pending} onClick={() => startTransition(async () => {
    const prepared = await prepareDebtReminder(memberId, fromMonth, toMonth);
    if (!prepared.ok) { window.alert(prepared.message); return; }
    if (!window.confirm(`Nhắc ${prepared.memberName} đóng quỹ?\nSố nợ mới nhất: ${formatMoney(prepared.debt ?? 0)}.\nThông báo sẽ được lưu trong Hộp thư.`)) return;
    const sent = await sendDebtReminder(memberId, fromMonth, toMonth);
    window.alert(sent.message);
    router.refresh();
  })}><Icon name="bell" /></button></span>;
}
