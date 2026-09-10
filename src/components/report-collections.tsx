"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CollectionToolbar, ColumnVisibilityMenu, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { Icon } from "./icon";
import { formatMoney } from "@/lib/format";
import { MemberIdentity } from "./member-identity";
import { ReportImageExporter } from "./report-image-exporter";

type MonthlyType = { id: string; name: string; iconName: string; color: string | null; defaultAmount: number; reportAsIcon: boolean; total: number };
type ChargeDisplayType = Pick<MonthlyType, "id" | "name" | "iconName" | "color" | "defaultAmount" | "reportAsIcon">;
type MonthlyCell = { typeId: string; quantity: number; total: number };
type MonthlyMember = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; avatarVersion: number | null; total: number; paid: number; cells: MonthlyCell[] };

function shortMonth(value: string) {
  const [year, month] = value.split("-");
  return month && year ? `${month}/${year}` : "--/----";
}

function CompactMonthInput({ name, value: initialValue, onChange, label }: { name: string; value: string; onChange?: (value: string) => void; label: string }) {
  const [value, setValue] = useState(initialValue);
  return <label className="compact-month-picker" title={label}>
    <span>{shortMonth(value)}</span>
    <input type="month" name={name} value={value} onClick={(event) => {
      try {
        event.currentTarget.showPicker();
      } catch {
        // Trình duyệt không hỗ trợ showPicker vẫn dùng bộ chọn native mặc định.
      }
    }} onChange={(event) => {
      setValue(event.target.value);
      onChange?.(event.target.value);
    }} aria-label={label} required />
  </label>;
}

function MonthlyCellView({ type, cell }: { type: ChargeDisplayType; cell?: MonthlyCell }) {
  if (!cell) return <span className="monthly-empty">—</span>;
  if (!type.reportAsIcon) return <span className="monthly-money"><strong>{formatMoney(cell.total)}</strong>{cell.quantity > 1 && <small>{cell.quantity} lần</small>}</span>;
  return <span className="icon-count" style={{ color: type.color ?? undefined }} title={`${cell.quantity} lần · ${formatMoney(cell.total)}`}>{Array.from({ length: cell.quantity }, (_, index) => <Icon name={type.iconName} key={index} className="report-charge-icon" />)}<small className="report-charge-quantity">({cell.quantity})</small></span>;
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
  const paid = members.reduce((sum, member) => sum + member.paid, 0);
  const remaining = paid - total;

  return <main className="monthly-report-snapshot">
    <section className="report-export-summary">
      <div><small>THÀNH VIÊN</small><strong>{members.length}</strong></div>
      <div><small>TỔNG PHẢI ĐÓNG</small><strong>{formatMoney(total)}</strong></div>
      <div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(paid)}</strong></div>
      <div><small>CÒN LẠI</small><strong className={remaining < 0 ? "money-out" : "money-in"}>{remaining > 0 ? "+" : ""}{formatMoney(remaining)}</strong></div>
    </section>
    <table>
      <thead><tr>{isColumnVisible("rank") && <th className="snapshot-rank">Hạng</th>}<th className="snapshot-member">Thành viên</th>{visibleTypes.map((type) => <th key={type.id}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong></th>)}{isColumnVisible("total") && <th>Tổng tháng</th>}{isColumnVisible("paid") && <th>Đã đóng</th>}{isColumnVisible("remaining") && <th>Còn lại</th>}</tr></thead>
      <tbody>{members.map((member, index) => {
        const memberRemaining = member.paid - member.total;
        return <tr key={member.id}>{isColumnVisible("rank") && <td className="snapshot-rank">#{index + 1}</td>}<td className="snapshot-member"><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} compact /></td>{visibleTypes.map((type) => <td key={type.id}><MonthlyCellView type={type} cell={member.cells.find((cell) => cell.typeId === type.id)} /></td>)}{isColumnVisible("total") && <td><strong>{formatMoney(member.total)}</strong></td>}{isColumnVisible("paid") && <td><strong>{formatMoney(member.paid)}</strong></td>}{isColumnVisible("remaining") && <td><strong className={memberRemaining < 0 ? "money-out" : "money-in"}>{memberRemaining > 0 ? "+" : ""}{formatMoney(memberRemaining)}</strong></td>}</tr>;
      })}</tbody>
      <tfoot><tr>{isColumnVisible("rank") && <td />}<td className="snapshot-member"><strong>Tổng danh sách</strong></td>{visibleTypes.map((type) => <td key={type.id}><strong>{formatMoney(members.reduce((sum, member) => sum + (member.cells.find((cell) => cell.typeId === type.id)?.total ?? 0), 0))}</strong></td>)}{isColumnVisible("total") && <td><strong>{formatMoney(total)}</strong></td>}{isColumnVisible("paid") && <td><strong>{formatMoney(paid)}</strong></td>}{isColumnVisible("remaining") && <td><strong className={remaining < 0 ? "money-out" : "money-in"}>{remaining > 0 ? "+" : ""}{formatMoney(remaining)}</strong></td>}</tr></tfoot>
    </table>
  </main>;
}

export function MonthlyReportCollection({ clubName, logoUrl, month, monthLabel, previousMonth, nextMonth, total, paidTotal, types, members }: { clubName: string; logoUrl: string | null; month: string; monthLabel: string; previousMonth: string; nextMonth: string; total: number; paidTotal: number; types: MonthlyType[]; members: MonthlyMember[] }) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("ALL");
  const [sort, setSort] = useState("NAME");
  const [view, setView] = useResponsiveView("fcfund:report-monthly:view");
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "rank", label: "Hạng" }, { id: "member", label: "Thành viên", required: true },
    ...types.map((type) => ({ id: `type:${type.id}`, label: type.name })),
    { id: "total", label: "Tổng tháng" }, { id: "paid", label: "Đã đóng" }, { id: "remaining", label: "Còn lại" },
  ], [types]);
  const columns = useColumnVisibility("fcfund:report-monthly:columns", columnDefinitions);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = members.filter((member) => {
      if (search && !normalizeSearch(`${member.name} ${member.code}`).includes(search)) return false;
      if (activity === "HAS" && member.total <= 0) return false;
      if (activity === "NONE" && member.total > 0) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort.startsWith("TYPE:")) {
        const type = types.find((item) => item.id === sort.slice(5));
        const score = (member: MonthlyMember) => {
          const cell = member.cells.find((item) => item.typeId === type?.id);
          return type?.reportAsIcon ? cell?.quantity ?? 0 : cell?.total ?? 0;
        };
        return score(b) - score(a) || a.name.localeCompare(b.name, "vi");
      }
      if (sort === "TOTAL_DESC") return b.total - a.total || a.name.localeCompare(b.name, "vi");
      if (sort === "TOTAL_ASC") return a.total - b.total || a.name.localeCompare(b.name, "vi");
      if (sort === "PAID_DESC") return b.paid - a.paid || a.name.localeCompare(b.name, "vi");
      if (sort === "REMAINING_ASC") return (a.paid - a.total) - (b.paid - b.total) || a.name.localeCompare(b.name, "vi");
      if (sort === "REMAINING_DESC") return (b.paid - b.total) - (a.paid - a.total) || a.name.localeCompare(b.name, "vi");
      return a.name.localeCompare(b.name, "vi");
    });
    return result;
  }, [activity, members, query, sort, types]);

  const remainingTotal = paidTotal - total;
  const exportWidth = Math.max(1080,
    330
    + types.filter((type) => columns.isVisible(`type:${type.id}`)).length * 145
    + ["total", "paid", "remaining"].filter((id) => columns.isVisible(id)).length * 150,
  );

  return <article className="panel monthly-report">
    <div className="monthly-report-heading">
      <div><span className="eyebrow">Phát sinh theo tháng</span><h2>{monthLabel}</h2><p>{formatMoney(total)} tổng khoản phải thu trong tháng</p></div>
      <div className="monthly-report-actions">
        <div className="month-controls"><Link href={`/reports?month=${previousMonth}`} aria-label="Tháng trước">‹</Link><form action="/reports" method="get"><CompactMonthInput key={month} name="month" value={month} label="Chọn tháng báo cáo" /><button className="button small report-view-button">Xem</button></form><Link href={`/reports?month=${nextMonth}`} aria-label="Tháng sau">›</Link></div>
        <ReportImageExporter iconOnly title={`Báo cáo phát sinh ${monthLabel}`} subtitle={`${visible.length} thành viên · Theo bộ lọc và thứ tự đang hiển thị`} clubName={clubName} logoUrl={logoUrl} filename={`bao-cao-phat-sinh-${month}.png`} width={exportWidth}>
          <MonthlyReportSnapshot members={visible} types={types} isColumnVisible={columns.isVisible} />
        </ReportImageExporter>
      </div>
    </div>
    <div className="report-toolbar-pad">
      <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc mã..." count={visible.length} view={view} onViewChange={setView}>
        <select value={activity} onChange={(event) => setActivity(event.target.value)}><option value="ALL">Mọi phát sinh</option><option value="HAS">Có phát sinh</option><option value="NONE">Không phát sinh</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="NAME">Tên A–Z</option><option value="TOTAL_DESC">Tổng tháng cao nhất</option><option value="TOTAL_ASC">Tổng tháng thấp nhất</option><option value="PAID_DESC">Đã đóng cao nhất</option><option value="REMAINING_ASC">Còn nợ nhiều trước</option><option value="REMAINING_DESC">Đóng dư nhiều trước</option>{types.map((type) => <option value={`TYPE:${type.id}`} key={type.id}>{type.name} nhiều nhất</option>)}</select>
        {view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}
      </CollectionToolbar>
    </div>
    {view === "list" ? <div className="monthly-table-wrap">
      <table className={`monthly-table report-sticky-table ${columns.isVisible("rank") ? "has-rank-column" : ""}`}>
        <thead><tr>{columns.isVisible("rank") && <th className="report-rank-column">Hạng</th>}<th className="report-member-column">Thành viên</th>{types.map((type) => columns.isVisible(`type:${type.id}`) && <th key={type.id}><span className="monthly-type-icon" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong><small>{type.reportAsIcon ? "Theo số lần" : formatMoney(type.defaultAmount)}</small></th>)}{columns.isVisible("total") && <th className="align-right">Tổng tháng</th>}{columns.isVisible("paid") && <th className="align-right">Đã đóng</th>}{columns.isVisible("remaining") && <th className="align-right">Còn lại</th>}</tr></thead>
        <tbody>{visible.map((member, index) => {
          const remaining = member.paid - member.total;
          return <tr key={member.id}>{columns.isVisible("rank") && <td className="report-rank-cell">#{index + 1}</td>}<td className="report-member-column"><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} compact /></td>{types.map((type) => columns.isVisible(`type:${type.id}`) && <td key={type.id}><MonthlyCellView type={type} cell={member.cells.find((cell) => cell.typeId === type.id)} /></td>)}{columns.isVisible("total") && <td className="align-right"><strong>{formatMoney(member.total)}</strong></td>}{columns.isVisible("paid") && <td className="align-right"><strong>{formatMoney(member.paid)}</strong></td>}{columns.isVisible("remaining") && <td className="align-right"><strong className={remaining < 0 ? "money-out" : "money-in"}>{remaining > 0 ? "+" : ""}{formatMoney(remaining)}</strong></td>}</tr>;
        })}</tbody>
        <tfoot><tr>{columns.isVisible("rank") && <td className="report-rank-cell" />}<td className="report-member-column"><strong>Tổng toàn tháng</strong></td>{types.map((type) => columns.isVisible(`type:${type.id}`) && <td key={type.id}><strong>{formatMoney(type.total)}</strong></td>)}{columns.isVisible("total") && <td className="align-right"><strong>{formatMoney(total)}</strong></td>}{columns.isVisible("paid") && <td className="align-right"><strong>{formatMoney(paidTotal)}</strong></td>}{columns.isVisible("remaining") && <td className="align-right"><strong className={remainingTotal < 0 ? "money-out" : "money-in"}>{remainingTotal > 0 ? "+" : ""}{formatMoney(remainingTotal)}</strong></td>}</tr></tfoot>
      </table>
    </div> : <div className="monthly-card-grid">{visible.map((member, index) => {
      const remaining = member.paid - member.total;
      return <article className="monthly-member-card" key={member.id}><header><span className="report-rank-badge">#{index + 1}</span><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} /><strong>{formatMoney(member.total)}</strong></header><div>{member.cells.length ? member.cells.map((cell) => { const type = types.find((item) => item.id === cell.typeId); return type ? <div key={cell.typeId}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /><b>{type.name}</b></span><span><MonthlyCellView type={type} cell={cell} /></span></div> : null; }) : <p>Không có phát sinh trong tháng.</p>}</div><footer className="monthly-payment-summary"><span><small>Đã đóng</small><strong>{formatMoney(member.paid)}</strong></span><span><small>Còn lại</small><strong className={remaining < 0 ? "money-out" : "money-in"}>{remaining > 0 ? "+" : ""}{formatMoney(remaining)}</strong></span></footer></article>;
    })}</div>}
    {!visible.length && <div className="collection-empty">Không tìm thấy thành viên phù hợp.</div>}
  </article>;
}

type BalanceCell = MonthlyCell & { month: string };
export type BalanceGroup = { month: string; label: string; types: ChargeDisplayType[] };
export type BalanceRow = { id: string; name: string; code: string; avatarVersion: number | null; charged: number; paid: number; balance: number; cells: Array<BalanceCell & { typeId: string }> };

function BalanceReportTable({ rows, groups, isColumnVisible, snapshot = false }: {
  rows: BalanceRow[];
  groups: BalanceGroup[];
  isColumnVisible: (id: string) => boolean;
  snapshot?: boolean;
}) {
  const visibleGroups = groups.map((group) => ({
    ...group,
    types: group.types.filter((type) => isColumnVisible(`cell:${group.month}:${type.id}`)),
  })).filter((group) => group.types.length);
  const cellColumnCount = visibleGroups.reduce((sum, group) => sum + group.types.length, 0);
  const totalCharged = rows.reduce((sum, row) => sum + row.charged, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = totalPaid - totalCharged;

  return <table className={`${snapshot ? "balance-snapshot-table" : "monthly-table balance-period-table report-sticky-table"} ${isColumnVisible("rank") ? "has-rank-column" : ""}`}>
    <thead>
      <tr>{isColumnVisible("rank") && <th rowSpan={cellColumnCount ? 3 : 1} className={snapshot ? "snapshot-rank" : "report-rank-column"}>Hạng</th>}<th rowSpan={cellColumnCount ? 3 : 1} className={snapshot ? "snapshot-member" : "report-member-column"}>Thành viên</th>{cellColumnCount > 0 && <th colSpan={cellColumnCount} className="balance-charge-super-header">Các khoản phát sinh</th>}{isColumnVisible("charged") && <th rowSpan={cellColumnCount ? 3 : 1}>Tổng</th>}{isColumnVisible("paid") && <th rowSpan={cellColumnCount ? 3 : 1}>Đã đóng</th>}{isColumnVisible("balance") && <th rowSpan={cellColumnCount ? 3 : 1}>Còn lại</th>}</tr>
      {cellColumnCount > 0 && <tr>{visibleGroups.map((group) => <th colSpan={group.types.length} className="balance-month-header" key={group.month}>{group.label}</th>)}</tr>}
      {cellColumnCount > 0 && <tr>{visibleGroups.flatMap((group) => group.types.map((type) => <th key={`${group.month}-${type.id}`}><span className="monthly-type-icon" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong></th>))}</tr>}
    </thead>
    <tbody>{rows.map((row, index) => <tr key={row.id}>{isColumnVisible("rank") && <td className={snapshot ? "snapshot-rank" : "report-rank-cell"}>#{index + 1}</td>}<td className={snapshot ? "snapshot-member" : "report-member-column"}><MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarVersion} compact /></td>{visibleGroups.flatMap((group) => group.types.map((type) => <td key={`${group.month}-${type.id}`}><BalanceCellView type={type} cell={row.cells.find((cell) => cell.month === group.month && cell.typeId === type.id)} /></td>))}{isColumnVisible("charged") && <td className="align-right"><strong>{formatMoney(row.charged)}</strong></td>}{isColumnVisible("paid") && <td className="align-right"><strong>{formatMoney(row.paid)}</strong></td>}{isColumnVisible("balance") && <td className="align-right"><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></td>}</tr>)}</tbody>
    <tfoot><tr>{isColumnVisible("rank") && <td />}<td className={snapshot ? "snapshot-member" : "report-member-column"}><strong>Tổng danh sách</strong></td>{visibleGroups.flatMap((group) => group.types.map((type) => <td key={`${group.month}-${type.id}`}><strong>{formatMoney(rows.reduce((sum, row) => sum + (row.cells.find((cell) => cell.month === group.month && cell.typeId === type.id)?.total ?? 0), 0))}</strong></td>))}{isColumnVisible("charged") && <td className="align-right"><strong>{formatMoney(totalCharged)}</strong></td>}{isColumnVisible("paid") && <td className="align-right"><strong>{formatMoney(totalPaid)}</strong></td>}{isColumnVisible("balance") && <td className="align-right"><strong className={totalBalance < 0 ? "money-out" : "money-in"}>{totalBalance > 0 ? "+" : ""}{formatMoney(totalBalance)}</strong></td>}</tr></tfoot>
  </table>;
}

function BalanceReportSnapshot({ rows, groups, isColumnVisible }: { rows: BalanceRow[]; groups: BalanceGroup[]; isColumnVisible: (id: string) => boolean }) {
  const charged = rows.reduce((sum, row) => sum + row.charged, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const balance = paid - charged;
  return <main className="monthly-report-snapshot balance-report-snapshot"><section className="report-export-summary"><div><small>THÀNH VIÊN</small><strong>{rows.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(charged)}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(paid)}</strong></div><div><small>CÒN LẠI</small><strong className={balance < 0 ? "money-out" : "money-in"}>{balance > 0 ? "+" : ""}{formatMoney(balance)}</strong></div></section><BalanceReportTable rows={rows} groups={groups} isColumnVisible={isColumnVisible} snapshot /></main>;
}

export function BalanceCollection({ clubName, logoUrl, rows, groups, period, fromMonth, toMonth, fromLabel, toLabel }: {
  clubName: string;
  logoUrl: string | null;
  rows: BalanceRow[];
  groups: BalanceGroup[];
  period: "range" | "all";
  fromMonth: string;
  toMonth: string;
  fromLabel: string;
  toLabel: string;
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
    ...groups.flatMap((group) => group.types.map((type) => ({ id: `cell:${group.month}:${type.id}`, label: `${group.label} · ${type.name}` }))),
    { id: "charged", label: "Tổng" }, { id: "paid", label: "Đã đóng" }, { id: "balance", label: "Còn lại" },
  ], [groups]);
  const columns = useColumnVisibility("fcfund:report-balance:columns:v2", columnDefinitions);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = rows.filter((row) => {
      if (search && !normalizeSearch(`${row.name} ${row.code}`).includes(search)) return false;
      if (state === "DEBT" && row.balance >= 0) return false;
      if (state === "CREDIT" && row.balance <= 0) return false;
      if (state === "EVEN" && row.balance !== 0) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "NAME") return a.name.localeCompare(b.name, "vi");
      if (sort === "CHARGED") return b.charged - a.charged || a.name.localeCompare(b.name, "vi");
      if (sort === "PAID") return b.paid - a.paid || a.name.localeCompare(b.name, "vi");
      if (sort === "BALANCE_DESC") return b.balance - a.balance || a.name.localeCompare(b.name, "vi");
      return a.balance - b.balance || a.name.localeCompare(b.name, "vi");
    });
    return result;
  }, [query, rows, sort, state]);
  const periodLabel = period === "all" ? "Toàn bộ thời gian" : fromMonth === toMonth ? fromLabel : `${fromLabel} – ${toLabel}`;
  const visibleCellCount = groups.reduce((sum, group) => sum + group.types.filter((type) => columns.isVisible(`cell:${group.month}:${type.id}`)).length, 0);
  const exportWidth = Math.max(1080, 330 + visibleCellCount * 145 + ["charged", "paid", "balance"].filter((id) => columns.isVisible(id)).length * 150);

  return <article className="panel table-panel balance-collection">
    <div className="monthly-report-heading balance-report-heading"><div><span className="eyebrow">Công nợ theo khoảng tháng</span><h2>{periodLabel}</h2><p>Các khoản phát sinh và tiền đã đóng trong cùng khoảng thời gian</p></div><div className="monthly-report-actions"><form action="/reports" method="get" className="balance-period-controls"><input type="hidden" name="tab" value="balances" /><select name="balancePeriod" value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value as "range" | "all")} aria-label="Phạm vi công nợ"><option value="range">Khoảng tháng</option><option value="all">Toàn bộ</option></select>{selectedPeriod === "range" && <><CompactMonthInput name="balanceFromMonth" value={selectedFromMonth} onChange={setSelectedFromMonth} label="Từ tháng" /><span className="month-range-arrow" aria-hidden="true">→</span><CompactMonthInput name="balanceToMonth" value={selectedToMonth} onChange={setSelectedToMonth} label="Đến tháng" /></>}<button className="button small report-view-button">Xem</button></form><ReportImageExporter iconOnly title={`Báo cáo công nợ · ${periodLabel}`} subtitle={`${visible.length} thành viên · Theo bộ lọc và thứ tự đang hiển thị`} clubName={clubName} logoUrl={logoUrl} filename={`bao-cao-cong-no-${period === "all" ? "toan-bo" : `${fromMonth}_${toMonth}`}.png`} width={exportWidth}><BalanceReportSnapshot rows={visible} groups={groups} isColumnVisible={columns.isVisible} /></ReportImageExporter></div></div>
    <div className="report-toolbar-pad"><CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc mã..." count={visible.length} view={view} onViewChange={setView}><select value={state} onChange={(event) => setState(event.target.value)}><option value="ALL">Mọi công nợ</option><option value="DEBT">Đang nợ</option><option value="EVEN">Cân bằng</option><option value="CREDIT">Đóng dư</option></select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option><option value="NAME">Tên A–Z</option><option value="CHARGED">Tổng phát sinh cao nhất</option><option value="PAID">Đã đóng cao nhất</option></select>{view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}</CollectionToolbar></div>
    {view === "list" ? <div className="monthly-table-wrap"><BalanceReportTable rows={visible} groups={groups} isColumnVisible={columns.isVisible} /></div> : <div className="balance-card-grid">{visible.map((row, index) => <article className="balance-member-card balance-period-card" key={row.id}><header><span className="report-rank-badge">#{index + 1}</span><MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarVersion} /><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></header><section className="balance-card-months">{groups.map((group) => { const groupCells = group.types.flatMap((type) => { const cell = row.cells.find((item) => item.month === group.month && item.typeId === type.id); return cell ? [{ type, cell }] : []; }); return groupCells.length ? <div key={group.month}><h3>{group.label}</h3>{groupCells.map(({ type, cell }) => <p key={type.id}><span><b>{type.name}</b></span><BalanceCellView type={type} cell={cell} /></p>)}</div> : null; })}{!row.cells.length && <p className="balance-card-empty">Không có khoản phát sinh trong kỳ.</p>}</section><footer className="balance-card-summary"><span><small>Tổng</small><b>{formatMoney(row.charged)}</b></span><span><small>Đã đóng</small><b>{formatMoney(row.paid)}</b></span><span><small>Còn lại</small><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></span></footer></article>)}</div>}
    {!visible.length && <div className="collection-empty">Không tìm thấy công nợ phù hợp.</div>}
  </article>;
}
