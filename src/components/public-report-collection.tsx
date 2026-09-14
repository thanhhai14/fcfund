"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { Icon } from "./icon";
import { ReportImageExporter } from "./report-image-exporter";
import { CollectionToolbar, ColumnVisibilityMenu, CompactMonthInput, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { formatMoney, initials } from "@/lib/format";
import { balanceCellColumnId, balanceSourceMonthLabel } from "@/lib/balance-report";

export type PublicReportType = { id: string; name: string; calculation: "MONTHLY" | "OCCURRENCE"; iconName: string; color: string | null; reportNextMonth: boolean; sourceMonth: string };
export type PublicReportGroup = { month: string; label: string; types: PublicReportType[] };
export type PublicReportCell = { memberId: string; month: string; sourceMonth: string; typeId: string; quantity: number; total: number };
export type PublicReportRow = { id: string; name: string; avatarVersion: number | null; charged: number; paid: number; balance: number; cells: PublicReportCell[] };

function PublicClubLogo({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="public-report-brand-logo">
    {src && !failed ? <img src={src} alt={`Logo ${name}`} width="64" height="64" onError={() => setFailed(true)} /> : initials(name)}
  </span>;
}

function PublicMemberIdentity({ row, compact = false }: { row: PublicReportRow; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const avatarSrc = row.avatarVersion ? `/api/public-report/members/${row.id}/avatar?v=${row.avatarVersion}` : null;
  return <span className={`public-member-identity ${compact ? "compact" : ""}`}>
    <span className="public-report-member-avatar">
      {avatarSrc && !failed ? <img src={avatarSrc} alt={`Avatar ${row.name}`} width="96" height="96" onError={() => setFailed(true)} /> : initials(row.name)}
    </span>
    <strong>{row.name}</strong>
  </span>;
}

function PublicBalanceCell({ type, cell }: { type: PublicReportType; cell?: PublicReportCell }) {
  if (!cell) return <span className="public-report-empty-cell">—</span>;
  return <span className="public-report-table-value" title={`${type.name} · ${cell.quantity} lần`}>
    <strong>{formatMoney(cell.total)}</strong>
    <small style={{ color: type.color ?? undefined }}>(<Icon name={type.iconName} /> × {cell.quantity})</small>
  </span>;
}

function PublicReportTable({ rows, groups, isColumnVisible, snapshot = false }: { rows: PublicReportRow[]; groups: PublicReportGroup[]; isColumnVisible: (id: string) => boolean; snapshot?: boolean }) {
  const visibleGroups = groups.map((group) => ({ ...group, types: group.types.filter((type) => isColumnVisible(balanceCellColumnId(group.month, type.id, type.sourceMonth))) })).filter((group) => group.types.length);
  const cellCount = visibleGroups.reduce((sum, group) => sum + group.types.length, 0);
  const totalCharged = rows.reduce((sum, row) => sum + row.charged, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = totalPaid - totalCharged;
  return <table className={`public-report-table ${snapshot ? "public-report-table-snapshot" : ""}`}>
    <thead>
      <tr>{isColumnVisible("rank") && <th rowSpan={cellCount ? 3 : 1} className="public-report-rank-column">Hạng</th>}<th rowSpan={cellCount ? 3 : 1} className="public-report-member-column">Thành viên</th>{cellCount > 0 && <th colSpan={cellCount} className="public-report-charge-header">Các khoản phát sinh</th>}{isColumnVisible("charged") && <th rowSpan={cellCount ? 3 : 1}>Tổng</th>}{isColumnVisible("paid") && <th rowSpan={cellCount ? 3 : 1}>Đã đóng</th>}{isColumnVisible("balance") && <th rowSpan={cellCount ? 3 : 1}>Còn lại</th>}</tr>
      {cellCount > 0 && <tr>{visibleGroups.map((group) => <th key={group.month} colSpan={group.types.length} className="public-report-month-header">{group.label}</th>)}</tr>}
      {cellCount > 0 && <tr>{visibleGroups.flatMap((group) => group.types.map((type) => <th key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong>{type.sourceMonth !== group.month && <small>{balanceSourceMonthLabel(type.sourceMonth)}</small>}</th>))}</tr>}
    </thead>
    <tbody>{rows.map((row, index) => <tr key={row.id}>{isColumnVisible("rank") && <td className="public-report-rank-column">#{index + 1}</td>}<td className="public-report-member-column"><PublicMemberIdentity row={row} compact /></td>{visibleGroups.flatMap((group) => group.types.map((type) => <td key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><PublicBalanceCell type={type} cell={row.cells.find((cell) => cell.month === group.month && cell.sourceMonth === type.sourceMonth && cell.typeId === type.id)} /></td>))}{isColumnVisible("charged") && <td><strong>{formatMoney(row.charged)}</strong></td>}{isColumnVisible("paid") && <td><strong>{formatMoney(row.paid)}</strong></td>}{isColumnVisible("balance") && <td><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></td>}</tr>)}</tbody>
    <tfoot><tr>{isColumnVisible("rank") && <td className="public-report-rank-column" />}<td className="public-report-member-column"><strong>Tổng danh sách</strong></td>{visibleGroups.flatMap((group) => group.types.map((type) => <td key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><strong>{formatMoney(rows.reduce((sum, row) => sum + (row.cells.find((cell) => cell.month === group.month && cell.sourceMonth === type.sourceMonth && cell.typeId === type.id)?.total ?? 0), 0))}</strong></td>))}{isColumnVisible("charged") && <td><strong>{formatMoney(totalCharged)}</strong></td>}{isColumnVisible("paid") && <td><strong>{formatMoney(totalPaid)}</strong></td>}{isColumnVisible("balance") && <td><strong className={totalBalance < 0 ? "money-out" : "money-in"}>{totalBalance > 0 ? "+" : ""}{formatMoney(totalBalance)}</strong></td>}</tr></tfoot>
  </table>;
}

function PublicReportSnapshot({ rows, groups, isColumnVisible }: { rows: PublicReportRow[]; groups: PublicReportGroup[]; isColumnVisible: (id: string) => boolean }) {
  const charged = rows.reduce((sum, row) => sum + row.charged, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const balance = paid - charged;
  return <main className="monthly-report-snapshot public-report-snapshot">
    <section className="report-export-summary"><div><small>THÀNH VIÊN</small><strong>{rows.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(charged)}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(paid)}</strong></div><div><small>CÒN LẠI</small><strong className={balance < 0 ? "money-out" : "money-in"}>{balance > 0 ? "+" : ""}{formatMoney(balance)}</strong></div></section>
    <PublicReportTable rows={rows} groups={groups} isColumnVisible={isColumnVisible} snapshot />
  </main>;
}

function PublicReportCard({ row, groups, rank }: { row: PublicReportRow; groups: PublicReportGroup[]; rank: number }) {
  return <article className="public-report-member">
    <header><span className="public-report-rank">#{rank}</span><PublicMemberIdentity row={row} /><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></header>
    <div className="public-report-months">{groups.map((group) => {
      const groupCells = group.types.map((type) => ({ type, cell: row.cells.find((cell) => cell.month === group.month && cell.sourceMonth === type.sourceMonth && cell.typeId === type.id) })).filter((item): item is { type: PublicReportType; cell: PublicReportCell } => Boolean(item.cell));
      return groupCells.length ? <section key={group.month}><h2>{group.label}</h2>{groupCells.map(({ type, cell }) => <p key={balanceCellColumnId(group.month, type.id, type.sourceMonth)}><span><b>{type.name}</b>{type.sourceMonth !== group.month && <small>{balanceSourceMonthLabel(type.sourceMonth)}</small>}</span><PublicBalanceCell type={type} cell={cell} /></p>)}</section> : null;
    })}{!row.cells.length && <p className="public-report-empty">Không có khoản phát sinh trong kỳ.</p>}</div>
    <footer><span><small>Tổng</small><b>{formatMoney(row.charged)}</b></span><span><small>Đã đóng</small><b>{formatMoney(row.paid)}</b></span><span><small>Còn lại</small><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></span></footer>
  </article>;
}

function PublicPeriodForm({ period, fromMonth, toMonth }: { period: "range" | "all"; fromMonth: string; toMonth: string }) {
  const [selectedPeriod, setSelectedPeriod] = useState<"range" | "all">(period);
  const [selectedFromMonth, setSelectedFromMonth] = useState(fromMonth);
  const [selectedToMonth, setSelectedToMonth] = useState(toMonth);
  return <form action="/public/report" method="get" className="balance-period-controls"><input type="hidden" name="tab" value="balances" /><select name="period" value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value as "range" | "all")} aria-label="Phạm vi thời gian"><option value="range">Khoảng tháng</option><option value="all">Toàn bộ</option></select>{selectedPeriod === "range" && <><CompactMonthInput name="fromMonth" value={selectedFromMonth} onChange={setSelectedFromMonth} label="Từ tháng" /><span className="month-range-arrow" aria-hidden="true">→</span><CompactMonthInput name="toMonth" value={selectedToMonth} onChange={setSelectedToMonth} label="Đến tháng" /></>}<button className="button small report-view-button" type="submit">Xem</button></form>;
}

export function PublicReportCollection({ clubName, appName, logoUrl, rows, groups, period, fromMonth, toMonth, fromLabel, toLabel }: {
  clubName: string;
  appName: string;
  logoUrl: string | null;
  rows: PublicReportRow[];
  groups: PublicReportGroup[];
  period: "range" | "all";
  fromMonth: string;
  toMonth: string;
  fromLabel: string;
  toLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("BALANCE_ASC");
  const [view, setView] = useResponsiveView("fcfund:public-report:view");
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "rank", label: "Hạng" },
    { id: "member", label: "Thành viên", required: true },
    ...groups.flatMap((group) => group.types.map((type) => ({
      id: balanceCellColumnId(group.month, type.id, type.sourceMonth),
      label: `${group.label} · ${type.name}${type.sourceMonth !== group.month ? ` · ${balanceSourceMonthLabel(type.sourceMonth)}` : ""}`,
    }))),
    { id: "charged", label: "Tổng" },
    { id: "paid", label: "Đã đóng" },
    { id: "balance", label: "Còn lại" },
  ], [groups]);
  const columns = useColumnVisibility("fcfund:public-report:columns:v3", columnDefinitions);
  const displayGroups = useMemo(() => groups.map((group) => ({
    ...group,
    types: group.types.filter((type) => !columns.hidden.includes(balanceCellColumnId(group.month, type.id, type.sourceMonth))),
  })).filter((group) => group.types.length), [columns.hidden, groups]);
  const visible = useMemo(() => {
    const normalized = normalizeSearch(query);
    const result = rows.filter((row) => !normalized || normalizeSearch(row.name).includes(normalized));
    result.sort((left, right) => {
      if (sort === "NAME") return left.name.localeCompare(right.name, "vi");
      if (sort === "CHARGED") return right.charged - left.charged || left.name.localeCompare(right.name, "vi");
      if (sort === "PAID") return right.paid - left.paid || left.name.localeCompare(right.name, "vi");
      if (sort === "BALANCE_DESC") return right.balance - left.balance || left.name.localeCompare(right.name, "vi");
      return left.balance - right.balance || left.name.localeCompare(right.name, "vi");
    });
    return result;
  }, [query, rows, sort]);
  const periodLabel = period === "all" ? "Toàn bộ thời gian" : fromMonth === toMonth ? fromLabel : `${fromLabel} – ${toLabel}`;
  const captureTitle = `Báo cáo công nợ · ${periodLabel}`;
  const visibleCellCount = groups.reduce((sum, group) => sum + group.types.filter((type) => columns.isVisible(balanceCellColumnId(group.month, type.id, type.sourceMonth))).length, 0);
  const exportWidth = Math.max(1080, 330 + visibleCellCount * 145 + ["charged", "paid", "balance"].filter((id) => columns.isVisible(id)).length * 150);

  return <main className="public-report-page">
    <header className="public-report-hero">
      <div className="public-report-brand"><PublicClubLogo name={clubName} src={logoUrl} /><div><small>BÁO CÁO CÔNG KHAI</small><h1>{clubName}</h1><p>{appName} · Công nợ lũy kế</p></div></div>
      <div className="public-report-period"><small>KỲ BÁO CÁO</small><strong>{periodLabel}</strong><span>Cập nhật theo dữ liệu hiện tại</span></div>
      <div className="public-report-hero-actions"><ReportImageExporter iconOnly title={captureTitle} subtitle={`${visible.length} thành viên · Theo bộ lọc và thứ tự đang hiển thị`} clubName={clubName} logoUrl={logoUrl} filename={`bao-cao-cong-no-${period === "all" ? "toan-bo" : `${fromMonth}_${toMonth}`}.png`} width={exportWidth}><PublicReportSnapshot rows={visible} groups={groups} isColumnVisible={columns.isVisible} /></ReportImageExporter></div>
    </header>
    <section className="public-report-summary"><div><small>THÀNH VIÊN</small><strong>{visible.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(visible.reduce((sum, row) => sum + row.charged, 0))}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(visible.reduce((sum, row) => sum + row.paid, 0))}</strong></div><div><small>CÒN LẠI</small><strong className={visible.reduce((sum, row) => sum + row.balance, 0) < 0 ? "money-out" : "money-in"}>{formatMoney(visible.reduce((sum, row) => sum + row.balance, 0))}</strong></div></section>
    <p className="public-report-note"><Icon name="info" /> Khoản phạt được tổng kết vào tháng kế tiếp; tiền đã đóng tính theo ngày nộp thực tế.</p>
    <div className="report-toolbar-pad"><CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên..." count={visible.length} view={view} onViewChange={setView}>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp"><option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option><option value="NAME">Tên A–Z</option><option value="CHARGED">Phát sinh cao nhất</option><option value="PAID">Đã đóng cao nhất</option></select>
        <PublicPeriodForm key={`${period}-${fromMonth}-${toMonth}`} period={period} fromMonth={fromMonth} toMonth={toMonth} />
        {view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}
      </CollectionToolbar></div>
    {view === "list" ? <div className="public-report-table-wrap"><PublicReportTable rows={visible} groups={groups} isColumnVisible={columns.isVisible} /></div> : <section className="public-report-members" aria-label="Công nợ từng thành viên">{visible.map((row, index) => <PublicReportCard key={row.id} row={row} groups={displayGroups} rank={index + 1} />)}{!visible.length && <p className="public-report-empty">Không tìm thấy thành viên phù hợp.</p>}</section>}
    {view === "list" && !visible.length && <p className="public-report-empty">Không tìm thấy thành viên phù hợp.</p>}
    <footer className="public-report-footer"><strong>{clubName}</strong><span>Báo cáo công khai · Không yêu cầu đăng nhập</span></footer>
  </main>;
}
