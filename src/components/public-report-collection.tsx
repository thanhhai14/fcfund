"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { Icon } from "./icon";
import { ReportImageExporter } from "./report-image-exporter";
import { useResponsiveView, type CollectionView } from "./collection-controls";
import { formatMoney, initials } from "@/lib/format";

export type PublicReportType = { id: string; name: string; iconName: string; color: string | null };
export type PublicReportGroup = { month: string; label: string; types: PublicReportType[] };
export type PublicReportCell = { memberId: string; month: string; typeId: string; quantity: number; total: number };
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

function PublicReportTable({ rows, groups, snapshot = false }: { rows: PublicReportRow[]; groups: PublicReportGroup[]; snapshot?: boolean }) {
  const cellCount = groups.reduce((sum, group) => sum + group.types.length, 0);
  const totalCharged = rows.reduce((sum, row) => sum + row.charged, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = totalPaid - totalCharged;
  return <table className={`public-report-table ${snapshot ? "public-report-table-snapshot" : ""}`}>
    <thead>
      <tr><th rowSpan={cellCount ? 3 : 1} className="public-report-rank-column">Hạng</th><th rowSpan={cellCount ? 3 : 1} className="public-report-member-column">Thành viên</th>{cellCount > 0 && <th colSpan={cellCount} className="public-report-charge-header">Các khoản phát sinh</th>}<th rowSpan={cellCount ? 3 : 1}>Tổng</th><th rowSpan={cellCount ? 3 : 1}>Đã đóng</th><th rowSpan={cellCount ? 3 : 1}>Còn lại</th></tr>
      {cellCount > 0 && <tr>{groups.map((group) => <th key={group.month} colSpan={group.types.length} className="public-report-month-header">{group.label}</th>)}</tr>}
      {cellCount > 0 && <tr>{groups.flatMap((group) => group.types.map((type) => <th key={`${group.month}-${type.id}`}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong></th>))}</tr>}
    </thead>
    <tbody>{rows.map((row, index) => <tr key={row.id}><td className="public-report-rank-column">#{index + 1}</td><td className="public-report-member-column"><PublicMemberIdentity row={row} compact /></td>{groups.flatMap((group) => group.types.map((type) => <td key={`${group.month}-${type.id}`}><PublicBalanceCell type={type} cell={row.cells.find((cell) => cell.month === group.month && cell.typeId === type.id)} /></td>))}<td><strong>{formatMoney(row.charged)}</strong></td><td><strong>{formatMoney(row.paid)}</strong></td><td><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></td></tr>)}</tbody>
    <tfoot><tr><td className="public-report-rank-column" /><td className="public-report-member-column"><strong>Tổng danh sách</strong></td>{groups.flatMap((group) => group.types.map((type) => <td key={`${group.month}-${type.id}`}><strong>{formatMoney(rows.reduce((sum, row) => sum + (row.cells.find((cell) => cell.month === group.month && cell.typeId === type.id)?.total ?? 0), 0))}</strong></td>))}<td><strong>{formatMoney(totalCharged)}</strong></td><td><strong>{formatMoney(totalPaid)}</strong></td><td><strong className={totalBalance < 0 ? "money-out" : "money-in"}>{totalBalance > 0 ? "+" : ""}{formatMoney(totalBalance)}</strong></td></tr></tfoot>
  </table>;
}

function PublicReportSnapshot({ rows, groups }: { rows: PublicReportRow[]; groups: PublicReportGroup[] }) {
  const charged = rows.reduce((sum, row) => sum + row.charged, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const balance = paid - charged;
  return <main className="monthly-report-snapshot public-report-snapshot">
    <section className="report-export-summary"><div><small>THÀNH VIÊN</small><strong>{rows.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(charged)}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(paid)}</strong></div><div><small>CÒN LẠI</small><strong className={balance < 0 ? "money-out" : "money-in"}>{balance > 0 ? "+" : ""}{formatMoney(balance)}</strong></div></section>
    <PublicReportTable rows={rows} groups={groups} snapshot />
  </main>;
}

function PublicReportCard({ row, groups, rank }: { row: PublicReportRow; groups: PublicReportGroup[]; rank: number }) {
  return <article className="public-report-member">
    <header><span className="public-report-rank">#{rank}</span><PublicMemberIdentity row={row} /><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></header>
    <div className="public-report-months">{groups.map((group) => {
      const groupCells = group.types.map((type) => ({ type, cell: row.cells.find((cell) => cell.month === group.month && cell.typeId === type.id) })).filter((item): item is { type: PublicReportType; cell: PublicReportCell } => Boolean(item.cell));
      return groupCells.length ? <section key={group.month}><h2>{group.label}</h2>{groupCells.map(({ type, cell }) => <p key={type.id}><span>{type.name}</span><PublicBalanceCell type={type} cell={cell} /></p>)}</section> : null;
    })}{!row.cells.length && <p className="public-report-empty">Không có khoản phát sinh trong kỳ.</p>}</div>
    <footer><span><small>Tổng</small><b>{formatMoney(row.charged)}</b></span><span><small>Đã đóng</small><b>{formatMoney(row.paid)}</b></span><span><small>Còn lại</small><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></span></footer>
  </article>;
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
  const visible = useMemo(() => {
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").trim();
    const result = rows.filter((row) => !normalized || row.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").includes(normalized));
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

  return <main className="public-report-page">
    <header className="public-report-hero">
      <div className="public-report-brand"><PublicClubLogo name={clubName} src={logoUrl} /><div><small>BÁO CÁO CÔNG KHAI</small><h1>{clubName}</h1><p>{appName} · Công nợ lũy kế</p></div></div>
      <div className="public-report-period"><small>KỲ BÁO CÁO</small><strong>{periodLabel}</strong><span>Cập nhật theo dữ liệu hiện tại</span></div>
      <div className="public-report-hero-actions"><ReportImageExporter iconOnly title={captureTitle} subtitle={`${visible.length} thành viên · Theo bộ lọc và thứ tự đang hiển thị`} clubName={clubName} logoUrl={logoUrl} filename={`bao-cao-cong-no-${period === "all" ? "toan-bo" : `${fromMonth}_${toMonth}`}.png`} width={Math.max(1080, 330 + groups.reduce((sum, group) => sum + group.types.length, 0) * 145 + 450)}><PublicReportSnapshot rows={visible} groups={groups} /></ReportImageExporter></div>
    </header>
    <section className="public-report-summary"><div><small>THÀNH VIÊN</small><strong>{visible.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(visible.reduce((sum, row) => sum + row.charged, 0))}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(visible.reduce((sum, row) => sum + row.paid, 0))}</strong></div><div><small>CÒN LẠI</small><strong className={visible.reduce((sum, row) => sum + row.balance, 0) < 0 ? "money-out" : "money-in"}>{formatMoney(visible.reduce((sum, row) => sum + row.balance, 0))}</strong></div></section>
    <p className="public-report-note"><Icon name="info" /> Đã đóng là tổng tiền thực nộp trong kỳ; các khoản phát sinh được nhóm theo từng tháng.</p>
    <section className="public-report-controls" aria-label="Bộ lọc báo cáo công khai">
      <label className="public-report-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm thành viên..." /></label>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp"><option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option><option value="NAME">Tên A–Z</option><option value="CHARGED">Phát sinh cao nhất</option><option value="PAID">Đã đóng cao nhất</option></select>
      <form action="/public/report" method="get" className="public-report-period-form"><input type="hidden" name="tab" value="balances" /><select name="period" defaultValue={period} aria-label="Phạm vi thời gian"><option value="range">Khoảng tháng</option><option value="all">Toàn bộ</option></select>{period === "range" && <><input type="month" name="fromMonth" defaultValue={fromMonth} aria-label="Từ tháng" /><span aria-hidden="true">→</span><input type="month" name="toMonth" defaultValue={toMonth} aria-label="Đến tháng" /></>}<button className="button small report-view-button" type="submit"><Icon name="eye" /> Xem</button></form>
      <span className="public-report-result-count">{visible.length} kết quả</span>
      <div className="view-toggle" aria-label="Kiểu hiển thị"><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list" as CollectionView)}><Icon name="list" /><span>List</span></button><button type="button" className={view === "card" ? "active" : ""} onClick={() => setView("card" as CollectionView)}><Icon name="grid" /><span>Card</span></button></div>
    </section>
    {view === "list" ? <div className="public-report-table-wrap"><PublicReportTable rows={visible} groups={groups} /></div> : <section className="public-report-members" aria-label="Công nợ từng thành viên">{visible.map((row, index) => <PublicReportCard key={row.id} row={row} groups={groups} rank={index + 1} />)}{!visible.length && <p className="public-report-empty">Không tìm thấy thành viên phù hợp.</p>}</section>}
    {view === "list" && !visible.length && <p className="public-report-empty">Không tìm thấy thành viên phù hợp.</p>}
    <footer className="public-report-footer"><strong>{clubName}</strong><span>Báo cáo công khai · Không yêu cầu đăng nhập</span></footer>
  </main>;
}
