"use client";

import { formatMoney } from "@/lib/format";
import type { OpeningBalance } from "@/lib/opening-balance";
import { Icon } from "./icon";
import { InfoTooltip } from "./info-tooltip";

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

export function OpeningBalanceBadge({ balance }: { balance: OpeningBalance }) {
  const content = [
    `Số dư trước kỳ: ${balance.amount > 0 ? "+" : ""}${formatMoney(balance.amount)}`,
    balance.amount < 0 ? "Các kỳ còn thiếu (ước tính bù khoản cũ trước):" : "Thành viên đã đóng dư trước kỳ; phần dư được chuyển vào số dư cuối kỳ.",
    ...balance.periods.flatMap((period) => [
      `• ${monthLabel(period.month)}: ${formatMoney(period.amount)}`,
      ...period.types.map((type) => `  ${type.name}${type.sourceMonth !== period.month ? ` (${monthLabel(type.sourceMonth)})` : ""}: ${formatMoney(type.amount)} phát sinh`),
    ]),
    "Số dư trước kỳ được cộng vào số dư cuối kỳ; Phát sinh và Đã đóng chỉ tính giao dịch trong kỳ. Tiền nộp không gắn với từng loại thu nên chi tiết nợ cũ chỉ là suy luận.",
  ].join("\n");

  return <InfoTooltip content={content} label={`Xem số dư trước kỳ ${formatMoney(balance.amount)}`} className={`outside-period-debt-trigger${balance.amount > 0 ? " opening-credit" : ""}`}>
    <strong className={balance.amount < 0 ? "money-out" : "money-in"}>{balance.amount > 0 ? "+" : ""}{formatMoney(balance.amount)}</strong><Icon name="info" />
  </InfoTooltip>;
}
