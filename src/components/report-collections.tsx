"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Form from "next/form";
import { PendingButton } from "./mutation-form";
import { CollectionToolbar, ColumnVisibilityMenu, CompactMonthInput, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { Icon } from "./icon";
import { formatMoney } from "@/lib/format";
import { MemberIdentity } from "./member-identity";
import { ReportImageExporter } from "./report-image-exporter";
import { CopyPublicLinkButton } from "./copy-public-link-button";
import { balanceCellColumnId, balanceSourceMonthLabel } from "@/lib/balance-report";
import type { OpeningBalance } from "@/lib/opening-balance";
import { OpeningBalanceBadge } from "./opening-balance-badge";
import { DebtReminderButton } from "./debt-reminder-button";

type MonthlyType = { id: string; name: string; calculation: "MONTHLY" | "OCCURRENCE"; iconName: string; color: string | null; defaultAmount: number; reportAsIcon: boolean; isLossPenalty: boolean; reportNextMonth: boolean };
type ChargeDisplayType = Pick<MonthlyType, "id" | "name" | "calculation" | "iconName" | "color" | "defaultAmount" | "reportAsIcon" | "reportNextMonth"> & { sourceMonth?: string };
type MonthlyCell = { typeId: string; quantity: number; total: number };
type MonthlyMember = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; avatarVersion: number | null; total: number; cells: MonthlyCell[] };

function MonthlyCellView({ type, cell }: { type: ChargeDisplayType; cell?: MonthlyCell }) {
  if (!cell) return <span className="monthly-empty">—</span>;
  if (!type.reportAsIcon) return <span className="monthly-quantity" title={`${type.name} · ${cell.quantity} lần`}><strong>{cell.quantity}</strong></span>;
  return <span className="icon-count" style={{ color: type.color ?? undefined }} title={`${type.name} · ${cell.quantity} lần`}>{Array.from({ length: cell.quantity }, (_, index) => <Icon name={type.iconName} key={index} className="report-charge-icon" />)}<small className="report-charge-quantity">({cell.quantity})</small></span>;
}

function BalanceCellView({ type, cell }: { type: ChargeDisplayType; cell?: MonthlyCell }) {
  if (!cell) return <span className="monthly-empty">—</span>;
  return <span className="balance-period-cell" title={`${type.name} · ${cell.quantity} lần`}>
    <strong>{formatMoney(cell.total)}</strong>
    <small style={{ color: type.color ?? undefined }}>(<Icon name={type.iconName} /> × {cell.quantity})</small>
  </span>;
}

function MonthlyReportSnapshot({ members, types, isColumnVisible }: {
  members: MonthlyMember[];
  types: MonthlyType[];
  isColumnVisible: (id: string) => boolean;
}) {
  const visibleTypes = types.filter((type) => isColumnVisible(`type:${type.id}`));
  const total = members.reduce((sum, member) => sum + member.total, 0);
  const totalOccurrences = members.reduce((sum, member) => sum + member.cells.reduce((cellSum, cell) => cellSum + cell.quantity, 0), 0);
  const medalType = types.find((type) => normalizeSearch(type.name) === "huan chuong")
    ?? types.find((type) => type.iconName === "medal");
  const medalCount = medalType
    ? members.reduce((sum, member) => sum + (member.cells.find((cell) => cell.typeId === medalType.id)?.quantity ?? 0), 0)
    : 0;

  return <main className="monthly-report-snapshot">
    <section className="report-export-summary">
      <div><small>THÀNH VIÊN</small><strong>{members.length}</strong></div>
      <div><small>LƯỢT PHÁT SINH</small><strong>{totalOccurrences}</strong></div>
      <div><small>HUÂN CHƯƠNG</small><strong>{medalCount}</strong></div>
      <div><small>TỔNG PHẢI THU</small><strong>{formatMoney(total)}</strong></div>
    </section>
    <table>
      <thead><tr>{isColumnVisible("rank") && <th className="snapshot-rank">Hạng</th>}<th className="snapshot-member">Thành viên</th>{visibleTypes.map((type) => <th key={type.id}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong></th>)}{isColumnVisible("total") && <th>Tổng phải thu</th>}</tr></thead>
      <tbody>{members.map((member, index) => <tr key={member.id}>{isColumnVisible("rank") && <td className="snapshot-rank">#{index + 1}</td>}<td className="snapshot-member"><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} compact /></td>{visibleTypes.map((type) => <td key={type.id}><MonthlyCellView type={type} cell={member.cells.find((cell) => cell.typeId === type.id)} /></td>)}{isColumnVisible("total") && <td><strong>{formatMoney(member.total)}</strong></td>}</tr>)}</tbody>
      <tfoot><tr>{isColumnVisible("rank") && <td />}<td className="snapshot-member"><strong>Tổng danh sách</strong></td>{visibleTypes.map((type) => <td key={type.id}><strong>{members.reduce((sum, member) => sum + (member.cells.find((cell) => cell.typeId === type.id)?.quantity ?? 0), 0)}</strong></td>)}{isColumnVisible("total") && <td><strong>{formatMoney(total)}</strong></td>}</tr></tfoot>
    </table>
  </main>;
}

export function MonthlyReportCollection({ clubName, logoUrl, month, monthLabel, previousMonth, nextMonth, total, types, members }: { clubName: string; logoUrl: string | null; month: string; monthLabel: string; previousMonth: string; nextMonth: string; total: number; types: MonthlyType[]; members: MonthlyMember[] }) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("ALL");
  const [sort, setSort] = useState("MEDAL_DESC");
  const [view, setView] = useResponsiveView("fcfund:report-monthly:view");
  const medalType = useMemo(
    () => types.find((type) => normalizeSearch(type.name) === "huan chuong")
      ?? types.find((type) => type.iconName === "medal"),
    [types],
  );
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "rank", label: "Hạng" }, { id: "member", label: "Thành viên", required: true },
    ...types.map((type) => ({ id: `type:${type.id}`, label: type.name })),
    { id: "total", label: "Tổng phải thu" },
  ], [types]);
  const columns = useColumnVisibility("fcfund:report-monthly:columns:v3", columnDefinitions);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = members.filter((member) => {
      if (search && !normalizeSearch(`${member.name} ${member.code}`).includes(search)) return false;
      if (activity === "HAS" && member.cells.length === 0) return false;
      if (activity === "NONE" && member.cells.length > 0) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "MEDAL_DESC") {
        const medalQuantity = (member: MonthlyMember) =>
          medalType
            ? member.cells.find((item) => item.typeId === medalType.id)?.quantity ?? 0
            : 0;
        return medalQuantity(b) - medalQuantity(a)
          || b.total - a.total
          || a.name.localeCompare(b.name, "vi");
      }
      if (sort.startsWith("TYPE:")) {
        const typeId = sort.slice(5);
        const quantity = (member: MonthlyMember) =>
          member.cells.find((item) => item.typeId === typeId)?.quantity ?? 0;
        return quantity(b) - quantity(a)
          || b.total - a.total
          || a.name.localeCompare(b.name, "vi");
      }
      if (sort === "TOTAL_DESC") return b.total - a.total || a.name.localeCompare(b.name, "vi");
      if (sort === "TOTAL_ASC") return a.total - b.total || a.name.localeCompare(b.name, "vi");
      return a.name.localeCompare(b.name, "vi");
    });
    return result;
  }, [activity, medalType, members, query, sort]);

  const exportWidth = Math.max(1080,
    330
    + types.filter((type) => columns.isVisible(`type:${type.id}`)).length * 145
    + (columns.isVisible("total") ? 150 : 0),
  );

  return <article className="panel monthly-report">
    <div className="monthly-report-heading">
      <div><span className="eyebrow">Phát sinh theo tháng</span><h2>{monthLabel}</h2><p>{formatMoney(total)} tổng khoản phải thu trong tháng</p></div>
      <div className="monthly-report-actions">
        <div className="month-controls"><Link href={`/reports?month=${previousMonth}`} aria-label="Tháng trước">‹</Link><Form action="/reports"><CompactMonthInput key={month} name="month" value={month} label="Chọn tháng báo cáo" /><PendingButton className="button small report-view-button" pendingLabel="Đang tải…">Xem</PendingButton></Form><Link href={`/reports?month=${nextMonth}`} aria-label="Tháng sau">›</Link></div>
        <ReportImageExporter iconOnly title={`Báo cáo phát sinh ${monthLabel}`} subtitle={`${visible.length} thành viên · Theo bộ lọc và thứ tự đang hiển thị`} clubName={clubName} logoUrl={logoUrl} filename={`bao-cao-phat-sinh-${month}.png`} width={exportWidth}>
          <MonthlyReportSnapshot members={visible} types={types} isColumnVisible={columns.isVisible} />
        </ReportImageExporter>
      </div>
    </div>
    <div className="report-toolbar-pad">
      <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc mã..." count={visible.length} view={view} onViewChange={setView}>
        <select value={activity} onChange={(event) => setActivity(event.target.value)}><option value="ALL">Mọi phát sinh</option><option value="HAS">Có phát sinh</option><option value="NONE">Không phát sinh</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="MEDAL_DESC">Huân chương cao nhất</option><option value="NAME">Tên A–Z</option><option value="TOTAL_DESC">Tổng phải thu cao nhất</option><option value="TOTAL_ASC">Tổng phải thu thấp nhất</option>{types.map((type) => <option value={`TYPE:${type.id}`} key={type.id}>{type.name} nhiều nhất</option>)}</select>
        {view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}
      </CollectionToolbar>
    </div>
    {view === "list" ? <div className="monthly-table-wrap">
      <table className={`monthly-table report-sticky-table ${columns.isVisible("rank") ? "has-rank-column" : ""}`}>
        <thead><tr>{columns.isVisible("rank") && <th className="report-rank-column">Hạng</th>}<th className="report-member-column">Thành viên</th>{types.map((type) => columns.isVisible(`type:${type.id}`) && <th key={type.id}><span className="monthly-type-icon" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong><small>Số lượt</small></th>)}{columns.isVisible("total") && <th className="align-right">Tổng phải thu</th>}</tr></thead>
        <tbody>{visible.map((member, index) => <tr key={member.id}>{columns.isVisible("rank") && <td className="report-rank-cell">#{index + 1}</td>}<td className="report-member-column"><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} compact /></td>{types.map((type) => columns.isVisible(`type:${type.id}`) && <td key={type.id}><MonthlyCellView type={type} cell={member.cells.find((cell) => cell.typeId === type.id)} /></td>)}{columns.isVisible("total") && <td className="align-right"><strong>{formatMoney(member.total)}</strong></td>}</tr>)}</tbody>
        <tfoot><tr>{columns.isVisible("rank") && <td className="report-rank-cell" />}<td className="report-member-column"><strong>Tổng toàn tháng</strong></td>{types.map((type) => columns.isVisible(`type:${type.id}`) && <td key={type.id}><strong>{visible.reduce((sum, member) => sum + (member.cells.find((cell) => cell.typeId === type.id)?.quantity ?? 0), 0)}</strong></td>)}{columns.isVisible("total") && <td className="align-right"><strong>{formatMoney(total)}</strong></td>}</tr></tfoot>
      </table>
    </div> : <div className="monthly-card-grid">{visible.map((member, index) => <article className="monthly-member-card" key={member.id}><header><span className="report-rank-badge">#{index + 1}</span><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} /></header><div>{member.cells.length ? member.cells.map((cell) => { const type = types.find((item) => item.id === cell.typeId); return type ? <div key={cell.typeId}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /><b>{type.name}</b></span><span><MonthlyCellView type={type} cell={cell} /></span></div> : null; }) : <p>Không có phát sinh trong tháng.</p>}</div><footer className="monthly-payment-summary monthly-total-summary"><span><small>Tổng phải thu</small><strong>{formatMoney(member.total)}</strong></span></footer></article>)}</div>}
    {!visible.length && <div className="collection-empty">Không tìm thấy thành viên phù hợp.</div>}
  </article>;
}

type BalanceCell = MonthlyCell & { month: string; sourceMonth: string };
type BalanceType = ChargeDisplayType & { sourceMonth: string };
export type BalanceGroup = { month: string; label: string; types: BalanceType[] };
export type BalanceRow = { id: string; name: string; code: string; avatarVersion: number | null; charged: number; paid: number; balance: number; currentBalance?: number; reminderAvailableAt?: string | null; openingBalance: OpeningBalance | null; cells: Array<BalanceCell & { typeId: string }> };

function visibleBalanceCharged(row: BalanceRow, groups: BalanceGroup[], isColumnVisible: (id: string) => boolean) {
  return groups.reduce((total, group) => total + group.types.reduce((groupTotal, type) => {
    const sourceMonth = type.sourceMonth ?? group.month;
    if (!isColumnVisible(balanceCellColumnId(group.month, type.id, sourceMonth))) return groupTotal;
    return groupTotal + (row.cells.find((cell) => cell.month === group.month && cell.sourceMonth === sourceMonth && cell.typeId === type.id)?.total ?? 0);
  }, 0), 0);
}

function BalanceReportTable({ rows, groups, isColumnVisible, snapshot = false, reminder }: {
  rows: BalanceRow[];
  groups: BalanceGroup[];
  isColumnVisible: (id: string) => boolean;
  snapshot?: boolean;
  reminder?: { fromMonth: string; toMonth: string; enabled: boolean; reason: string };
}) {
  const visibleGroups = groups.map((group) => ({
    ...group,
    types: group.types.filter((type) => isColumnVisible(balanceCellColumnId(group.month, type.id, type.sourceMonth))),
  })).filter((group) => group.types.length);
  const cellColumnCount = visibleGroups.reduce((sum, group) => sum + group.types.length, 0);
  const totalCharged = rows.reduce((sum, row) => sum + visibleBalanceCharged(row, groups, isColumnVisible), 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = rows.reduce((sum, row) => sum + (row.openingBalance?.amount ?? 0), 0) + totalPaid - totalCharged;
  const showOutside = rows.some((row) => row.openingBalance) && isColumnVisible("outside");
  const totalOutside = rows.reduce((sum, row) => sum + (row.openingBalance?.amount ?? 0), 0);

  return <table className={`${snapshot ? "balance-snapshot-table" : "monthly-table balance-period-table report-sticky-table"} ${isColumnVisible("rank") ? "has-rank-column" : ""}`}>
    <thead>
      <tr>{isColumnVisible("rank") && <th rowSpan={cellColumnCount ? 3 : 1} className={snapshot ? "snapshot-rank" : "report-rank-column"}>Hạng</th>}<th rowSpan={cellColumnCount ? 3 : 1} className={snapshot ? "snapshot-member" : "report-member-column"}>Thành viên</th>{showOutside && <th rowSpan={cellColumnCount ? 3 : 1}>Số dư trước kỳ</th>}{cellColumnCount > 0 && <th colSpan={cellColumnCount} className="balance-charge-super-header">Các khoản phát sinh</th>}{isColumnVisible("charged") && <th rowSpan={cellColumnCount ? 3 : 1}>Phát sinh</th>}{isColumnVisible("paid") && <th rowSpan={cellColumnCount ? 3 : 1}>Đã đóng</th>}{isColumnVisible("balance") && <th rowSpan={cellColumnCount ? 3 : 1}>Số dư cuối kỳ</th>}{reminder && <th rowSpan={cellColumnCount ? 3 : 1} className="debt-reminder-sticky">Nhắc</th>}</tr>
      {cellColumnCount > 0 && <tr>{visibleGroups.map((group) => <th colSpan={group.types.length} className="balance-month-header" key={group.month}>{group.label}</th>)}</tr>}
      {cellColumnCount > 0 && <tr>{visibleGroups.flatMap((group) => group.types.map((type) => <th key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><span className="monthly-type-icon" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong>{type.sourceMonth !== group.month && <small>{balanceSourceMonthLabel(type.sourceMonth)}</small>}</th>))}</tr>}
    </thead>
    <tbody>{rows.map((row, index) => {
      const charged = visibleBalanceCharged(row, groups, isColumnVisible);
      const balance = (row.openingBalance?.amount ?? 0) + row.paid - charged;
      return <tr key={row.id}>{isColumnVisible("rank") && <td className={snapshot ? "snapshot-rank" : "report-rank-cell"}>#{index + 1}</td>}<td className={snapshot ? "snapshot-member" : "report-member-column"}><MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarVersion} compact /></td>{showOutside && <td className="outside-period-cell">{row.openingBalance ? snapshot ? <strong className={row.openingBalance.amount < 0 ? "money-out" : "money-in"}>{row.openingBalance.amount > 0 ? "+" : ""}{formatMoney(row.openingBalance.amount)}</strong> : <OpeningBalanceBadge balance={row.openingBalance} /> : <span className="monthly-empty">—</span>}</td>}{visibleGroups.flatMap((group) => group.types.map((type) => <td key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><BalanceCellView type={type} cell={row.cells.find((cell) => cell.month === group.month && cell.sourceMonth === type.sourceMonth && cell.typeId === type.id)} /></td>))}{isColumnVisible("charged") && <td className="align-right"><strong>{formatMoney(charged)}</strong></td>}{isColumnVisible("paid") && <td className="align-right" title="Tổng tiền đã đóng trong kỳ, không phân bổ theo loại thu"><strong>{formatMoney(row.paid)}</strong></td>}{isColumnVisible("balance") && <td className="align-right"><strong className={balance < 0 ? "money-out" : "money-in"}>{balance > 0 ? "+" : ""}{formatMoney(balance)}</strong></td>}{reminder && <td className="debt-reminder-sticky"><DebtReminderButton memberId={row.id} fromMonth={reminder.fromMonth} toMonth={reminder.toMonth} enabled={reminder.enabled && (row.currentBalance ?? 0) < 0 && !row.reminderAvailableAt} reason={row.reminderAvailableAt ? `Có thể nhắc lại sau ${row.reminderAvailableAt}` : (row.currentBalance ?? 0) >= 0 ? "Thành viên hiện không nợ" : reminder.reason} /></td>}</tr>;
    })}</tbody>
    <tfoot><tr>{isColumnVisible("rank") && <td />}<td className={snapshot ? "snapshot-member" : "report-member-column"}><strong>Tổng danh sách</strong></td>{showOutside && <td className="outside-period-cell"><strong className={totalOutside < 0 ? "money-out" : "money-in"}>{totalOutside > 0 ? "+" : ""}{formatMoney(totalOutside)}</strong></td>}{visibleGroups.flatMap((group) => group.types.map((type) => <td key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><strong>{formatMoney(rows.reduce((sum, row) => sum + (row.cells.find((cell) => cell.month === group.month && cell.sourceMonth === type.sourceMonth && cell.typeId === type.id)?.total ?? 0), 0))}</strong></td>))}{isColumnVisible("charged") && <td className="align-right"><strong>{formatMoney(totalCharged)}</strong></td>}{isColumnVisible("paid") && <td className="align-right" title="Tổng tiền đã đóng trong kỳ, không phân bổ theo loại thu"><strong>{formatMoney(totalPaid)}</strong></td>}{isColumnVisible("balance") && <td className="align-right"><strong className={totalBalance < 0 ? "money-out" : "money-in"}>{totalBalance > 0 ? "+" : ""}{formatMoney(totalBalance)}</strong></td>}{reminder && <td className="debt-reminder-sticky" />}</tr></tfoot>
  </table>;
}

function BalanceReportSnapshot({ rows, groups, isColumnVisible }: { rows: BalanceRow[]; groups: BalanceGroup[]; isColumnVisible: (id: string) => boolean }) {
  const charged = rows.reduce((sum, row) => sum + visibleBalanceCharged(row, groups, isColumnVisible), 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const balance = rows.reduce((sum, row) => sum + (row.openingBalance?.amount ?? 0), 0) + paid - charged;
  return <main className="monthly-report-snapshot balance-report-snapshot"><section className="report-export-summary"><div><small>THÀNH VIÊN</small><strong>{rows.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(charged)}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(paid)}</strong></div><div><small>SỐ DƯ CUỐI KỲ</small><strong className={balance < 0 ? "money-out" : "money-in"}>{balance > 0 ? "+" : ""}{formatMoney(balance)}</strong></div></section><BalanceReportTable rows={rows} groups={groups} isColumnVisible={isColumnVisible} snapshot /></main>;
}

export function BalanceCollection({ clubName, logoUrl, rows, groups, period, fromMonth, toMonth, fromLabel, toLabel, canRemind, currentMonth, paymentReady }: {
  clubName: string;
  logoUrl: string | null;
  rows: BalanceRow[];
  groups: BalanceGroup[];
  period: "range" | "all";
  fromMonth: string;
  toMonth: string;
  fromLabel: string;
  toLabel: string;
  canRemind?: boolean;
  currentMonth?: string;
  paymentReady?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [sort, setSort] = useState("BALANCE_ASC");
  const [selectedPeriod, setSelectedPeriod] = useState<"range" | "all">(period);
  const [selectedFromMonth, setSelectedFromMonth] = useState(fromMonth);
  const [selectedToMonth, setSelectedToMonth] = useState(toMonth);
  const [view, setView] = useResponsiveView("fcfund:report-balance:view");
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "rank", label: "Hạng" },
    { id: "member", label: "Thành viên", required: true },
    ...(rows.some((row) => row.openingBalance) ? [{ id: "outside", label: "Số dư trước kỳ" }] : []),
    ...groups.flatMap((group) => group.types.map((type) => ({ id: balanceCellColumnId(group.month, type.id, type.sourceMonth), label: `${group.label} · ${type.name}${type.sourceMonth !== group.month ? ` · ${balanceSourceMonthLabel(type.sourceMonth)}` : ""}` }))),
    { id: "charged", label: "Phát sinh" }, { id: "paid", label: "Đã đóng" }, { id: "balance", label: "Số dư cuối kỳ" },
  ], [groups, rows]);
  const columns = useColumnVisibility("fcfund:report-balance:columns:v4", columnDefinitions);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const useVisibleTypes = view === "list";
    const isTypeVisible = (id: string) => !columns.hidden.includes(id);
    const metrics = (row: BalanceRow) => {
      const charged = useVisibleTypes ? visibleBalanceCharged(row, groups, isTypeVisible) : row.charged;
      return { charged, balance: (row.openingBalance?.amount ?? 0) + row.paid - charged };
    };
    const result = rows.filter((row) => {
      if (search && !normalizeSearch(`${row.name} ${row.code}`).includes(search)) return false;
      const { balance } = metrics(row);
      if (state === "DEBT" && balance >= 0) return false;
      if (state === "CREDIT" && balance <= 0) return false;
      if (state === "EVEN" && balance !== 0) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "NAME") return a.name.localeCompare(b.name, "vi");
      if (sort === "CHARGED") return metrics(b).charged - metrics(a).charged || a.name.localeCompare(b.name, "vi");
      if (sort === "PAID") return b.paid - a.paid || a.name.localeCompare(b.name, "vi");
      if (sort === "BALANCE_DESC") return metrics(b).balance - metrics(a).balance || a.name.localeCompare(b.name, "vi");
      return metrics(a).balance - metrics(b).balance || a.name.localeCompare(b.name, "vi");
    });
    return result;
  }, [columns.hidden, groups, query, rows, sort, state, view]);
  const periodLabel = period === "all" ? "Toàn bộ thời gian" : fromMonth === toMonth ? fromLabel : `${fromLabel} – ${toLabel}`;
  const visibleCellCount = groups.reduce((sum, group) => sum + group.types.filter((type) => columns.isVisible(balanceCellColumnId(group.month, type.id, type.sourceMonth))).length, 0);
  const totalCellCount = groups.reduce((sum, group) => sum + group.types.length, 0);
  const showOutside = visible.some((row) => row.openingBalance) && columns.isVisible("outside");
  const exportWidth = Math.max(1080, 330 + visibleCellCount * 145 + ["charged", "paid", "balance"].filter((id) => columns.isVisible(id)).length * 150 + (showOutside ? 150 : 0));
  const reminder = canRemind ? { fromMonth, toMonth, enabled: period === "range" && toMonth === currentMonth && !!paymentReady, reason: !paymentReady ? "Cần cấu hình ngân hàng nhận tiền, BIN và số tài khoản" : period !== "range" || toMonth !== currentMonth ? "Chỉ nhắc nợ khi kỳ kết thúc ở tháng hiện tại" : "Nhắc đóng quỹ" } : undefined;

  return <article className="panel table-panel balance-collection">
    <div className="monthly-report-heading balance-report-heading"><div><span className="eyebrow">Báo cáo theo kỳ</span><h2>{periodLabel}</h2><p>Số dư cuối kỳ = số dư trước kỳ + tiền đã đóng trong kỳ − phát sinh trong kỳ. Khoản chuyển kỳ được tính vào tháng kế tiếp.</p></div><div className="monthly-report-actions"><Form action="/reports" className="balance-period-controls"><input type="hidden" name="tab" value="balances" /><select name="balancePeriod" value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value as "range" | "all")} aria-label="Phạm vi báo cáo"><option value="range">Khoảng tháng</option><option value="all">Toàn bộ</option></select>{selectedPeriod === "range" && <><CompactMonthInput name="balanceFromMonth" value={selectedFromMonth} onChange={setSelectedFromMonth} label="Từ tháng" /><span className="month-range-arrow" aria-hidden="true">→</span><CompactMonthInput name="balanceToMonth" value={selectedToMonth} onChange={setSelectedToMonth} label="Đến tháng" /></>}<PendingButton className="button small report-view-button" pendingLabel="Đang tải…">Xem</PendingButton></Form><ReportImageExporter iconOnly title={`Báo cáo theo kỳ · ${periodLabel}`} subtitle={`${visible.length} thành viên · Theo bộ lọc và thứ tự đang hiển thị`} clubName={clubName} logoUrl={logoUrl} filename={`bao-cao-theo-ky-${period === "all" ? "toan-bo" : `${fromMonth}_${toMonth}`}.png`} width={exportWidth}><BalanceReportSnapshot rows={visible} groups={groups} isColumnVisible={columns.isVisible} /></ReportImageExporter><CopyPublicLinkButton path="/public/report?tab=balances" label="Chia sẻ báo cáo theo kỳ" iconOnly /></div></div>
    <div className="report-toolbar-pad"><CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc mã..." count={visible.length} view={view} onViewChange={setView}><select value={state} onChange={(event) => setState(event.target.value)}><option value="ALL">Mọi công nợ</option><option value="DEBT">Đang nợ</option><option value="EVEN">Cân bằng</option><option value="CREDIT">Đóng dư</option></select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option><option value="NAME">Tên A–Z</option><option value="CHARGED">Tổng phát sinh cao nhất</option><option value="PAID">Đã đóng cao nhất</option></select>{view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}</CollectionToolbar>{view === "list" && visibleCellCount < totalCellCount && <p className="panel-note balance-visibility-note">Phát sinh và Số dư cuối kỳ đang tính theo loại thu đang hiển thị. Đã đóng là tổng tiền thực nộp trong kỳ.</p>}</div>
    {view === "list" ? <div className="monthly-table-wrap"><BalanceReportTable rows={visible} groups={groups} isColumnVisible={columns.isVisible} reminder={reminder} /></div> : <div className="balance-card-grid">{visible.map((row, index) => <article className="balance-member-card balance-period-card" key={row.id}><header><span className="report-rank-badge">#{index + 1}</span><MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarVersion} /><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong>{reminder && <DebtReminderButton memberId={row.id} fromMonth={fromMonth} toMonth={toMonth} enabled={reminder.enabled && (row.currentBalance ?? 0) < 0 && !row.reminderAvailableAt} reason={row.reminderAvailableAt ? `Có thể nhắc lại sau ${row.reminderAvailableAt}` : (row.currentBalance ?? 0) >= 0 ? "Thành viên hiện không nợ" : reminder.reason} />}</header>{showOutside && row.openingBalance && <div className={`outside-period-card-note${row.openingBalance.amount > 0 ? " opening-credit" : ""}`}><span>Số dư trước kỳ</span><OpeningBalanceBadge balance={row.openingBalance} /></div>}<section className="balance-card-months">{groups.map((group) => { const groupCells = group.types.flatMap((type) => { const cell = row.cells.find((item) => item.month === group.month && item.sourceMonth === type.sourceMonth && item.typeId === type.id); return cell ? [{ type, cell }] : []; }); return groupCells.length ? <div key={group.month}><h3>{group.label}</h3>{groupCells.map(({ type, cell }) => <p key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><span><b>{type.name}</b>{type.sourceMonth !== group.month && <small>{balanceSourceMonthLabel(type.sourceMonth)}</small>}</span><BalanceCellView type={type} cell={cell} /></p>)}</div> : null; })}{!row.cells.length && <p className="balance-card-empty">Không có khoản phát sinh trong kỳ.</p>}</section><footer className="balance-card-summary"><span><small>Phát sinh</small><b>{formatMoney(row.charged)}</b></span><span><small>Đã đóng</small><b>{formatMoney(row.paid)}</b></span><span><small>Số dư cuối kỳ</small><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></span></footer></article>)}</div>}
    {!visible.length && <div className="collection-empty">Không tìm thấy công nợ phù hợp.</div>}
  </article>;
}
