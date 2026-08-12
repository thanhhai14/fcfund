"use client";

import { useState } from "react";
import { monthStart, shiftDate } from "@/lib/format";
import { Disclosure } from "./disclosure";
import { Icon } from "./icon";

type DateRange = { dateFrom: string; dateTo: string };

function shortDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function previousMonth(today: string): DateRange {
  const currentStart = monthStart(today);
  const previousEnd = shiftDate(currentStart, -1);
  return { dateFrom: monthStart(previousEnd), dateTo: previousEnd };
}

export function CompactDateRangeFilter({
  dateFrom,
  dateTo,
  today,
  onChange,
}: DateRange & { today: string; onChange: (range: DateRange) => void }) {
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  const invalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);
  const label = dateFrom && dateTo
    ? `${shortDate(dateFrom)} – ${shortDate(dateTo)}`
    : dateFrom ? `Từ ${shortDate(dateFrom)}` : dateTo ? `Đến ${shortDate(dateTo)}` : "Tất cả thời gian";

  function close(target: HTMLElement) {
    target.closest("details")?.removeAttribute("open");
  }

  function apply(range: DateRange, target?: HTMLElement) {
    setDraftFrom(range.dateFrom);
    setDraftTo(range.dateTo);
    onChange(range);
    if (target) close(target);
  }

  return (
    <Disclosure label={<><Icon name="calendar" /><span>{label}</span></>} className="compact-date-range-disclosure">
      <div className="date-range-heading">
        <span className="eyebrow">Khoảng thời gian</span>
        <strong>Lọc theo ngày phát sinh</strong>
      </div>
      <div className="date-range-presets">
        <button type="button" onClick={(event) => apply({ dateFrom: today, dateTo: today }, event.currentTarget)}>Hôm nay</button>
        <button type="button" onClick={(event) => apply({ dateFrom: shiftDate(today, -6), dateTo: today }, event.currentTarget)}>7 ngày</button>
        <button type="button" onClick={(event) => apply({ dateFrom: monthStart(today), dateTo: today }, event.currentTarget)}>Tháng này</button>
        <button type="button" onClick={(event) => apply(previousMonth(today), event.currentTarget)}>Tháng trước</button>
        <button type="button" onClick={(event) => apply({ dateFrom: "", dateTo: "" }, event.currentTarget)}>Tất cả</button>
      </div>
      <div className="date-range-fields">
        <label>Từ ngày<input type="date" value={draftFrom} max={draftTo || undefined} onChange={(event) => setDraftFrom(event.target.value)} /></label>
        <label>Đến ngày<input type="date" value={draftTo} min={draftFrom || undefined} onChange={(event) => setDraftTo(event.target.value)} /></label>
      </div>
      {invalid && <p className="form-message error">Ngày bắt đầu không được sau ngày kết thúc.</p>}
      <div className="date-range-actions">
        <button type="button" className="button secondary" onClick={(event) => apply({ dateFrom: "", dateTo: "" }, event.currentTarget)}>Đặt lại</button>
        <button type="button" className="button primary" disabled={invalid} onClick={(event) => apply({ dateFrom: draftFrom, dateTo: draftTo }, event.currentTarget)}>Áp dụng</button>
      </div>
    </Disclosure>
  );
}
