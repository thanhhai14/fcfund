"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CollectionToolbar, ColumnVisibilityMenu, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { Icon } from "./icon";
import { formatMoney } from "@/lib/format";
import { MemberIdentity } from "./member-identity";

type MonthlyType = { id: string; name: string; iconName: string; color: string | null; defaultAmount: number; reportAsIcon: boolean; total: number };
type MonthlyCell = { typeId: string; quantity: number; total: number };
type MonthlyMember = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; avatarVersion: number | null; total: number; cells: MonthlyCell[] };

function MonthlyCellView({ type, cell }: { type: MonthlyType; cell?: MonthlyCell }) {
  if (!cell) return <span className="monthly-empty">—</span>;
  if (!type.reportAsIcon) return <span className="monthly-money"><strong>{formatMoney(cell.total)}</strong>{cell.quantity > 1 && <small>{cell.quantity} lần</small>}</span>;
  return <span className="icon-count" style={{ color: type.color ?? undefined }} title={`${cell.quantity} lần · ${formatMoney(cell.total)}`}>{Array.from({ length: cell.quantity }, (_, index) => <Icon name={type.iconName} key={index} className="report-charge-icon" />)}<small className="report-charge-quantity">({cell.quantity})</small></span>;
}

export function MonthlyReportCollection({ month, monthLabel, previousMonth, nextMonth, total, types, members }: { month: string; monthLabel: string; previousMonth: string; nextMonth: string; total: number; types: MonthlyType[]; members: MonthlyMember[] }) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("ALL");
  const [sort, setSort] = useState("NAME");
  const [view, setView] = useResponsiveView("fcfund:report-monthly:view");
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "rank", label: "Hạng" }, { id: "member", label: "Thành viên", required: true },
    ...types.map((type) => ({ id: `type:${type.id}`, label: type.name })), { id: "total", label: "Tổng tháng" },
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
      return a.name.localeCompare(b.name, "vi");
    });
    return result;
  }, [activity, members, query, sort, types]);

  return <article className="panel monthly-report">
    <div className="monthly-report-heading"><div><span className="eyebrow">Phát sinh theo tháng</span><h2>{monthLabel}</h2><p>{formatMoney(total)} tổng khoản phải thu trong tháng</p></div><div className="month-controls"><Link href={`/reports?month=${previousMonth}`} aria-label="Tháng trước">‹</Link><form action="/reports" method="get"><input type="month" name="month" defaultValue={month} aria-label="Chọn tháng báo cáo" /><button className="button secondary small">Xem</button></form><Link href={`/reports?month=${nextMonth}`} aria-label="Tháng sau">›</Link></div></div>
    <div className="report-toolbar-pad"><CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc mã..." count={visible.length} view={view} onViewChange={setView}><select value={activity} onChange={(event) => setActivity(event.target.value)}><option value="ALL">Mọi phát sinh</option><option value="HAS">Có phát sinh</option><option value="NONE">Không phát sinh</option></select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="NAME">Tên A–Z</option><option value="TOTAL_DESC">Tổng tháng cao nhất</option><option value="TOTAL_ASC">Tổng tháng thấp nhất</option>{types.map((type) => <option value={`TYPE:${type.id}`} key={type.id}>{type.name} nhiều nhất</option>)}</select>{view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}</CollectionToolbar></div>
    {view === "list" ? <div className="monthly-table-wrap"><table className={`monthly-table report-sticky-table ${columns.isVisible("rank") ? "has-rank-column" : ""}`}><thead><tr>{columns.isVisible("rank") && <th className="report-rank-column">Hạng</th>}<th className="report-member-column">Thành viên</th>{types.map((type) => columns.isVisible(`type:${type.id}`) && <th key={type.id}><span className="monthly-type-icon" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><strong>{type.name}</strong><small>{type.reportAsIcon ? "Theo số lần" : formatMoney(type.defaultAmount)}</small></th>)}{columns.isVisible("total") && <th className="align-right">Tổng tháng</th>}</tr></thead><tbody>{visible.map((member, index) => <tr key={member.id}>{columns.isVisible("rank") && <td className="report-rank-cell">#{index + 1}</td>}<td className="report-member-column"><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} compact /></td>{types.map((type) => columns.isVisible(`type:${type.id}`) && <td key={type.id}><MonthlyCellView type={type} cell={member.cells.find((cell) => cell.typeId === type.id)} /></td>)}{columns.isVisible("total") && <td className="align-right"><strong>{formatMoney(member.total)}</strong></td>}</tr>)}</tbody><tfoot><tr>{columns.isVisible("rank") && <td className="report-rank-cell" />}<td className="report-member-column"><strong>Tổng toàn tháng</strong></td>{types.map((type) => columns.isVisible(`type:${type.id}`) && <td key={type.id}><strong>{formatMoney(type.total)}</strong></td>)}{columns.isVisible("total") && <td className="align-right"><strong>{formatMoney(total)}</strong></td>}</tr></tfoot></table></div> : <div className="monthly-card-grid">{visible.map((member, index) => <article className="monthly-member-card" key={member.id}><header><span className="report-rank-badge">#{index + 1}</span><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} /><strong>{formatMoney(member.total)}</strong></header><div>{member.cells.length ? member.cells.map((cell) => { const type = types.find((item) => item.id === cell.typeId); return type ? <div key={cell.typeId}><span style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /><b>{type.name}</b></span><span><MonthlyCellView type={type} cell={cell} /></span></div> : null; }) : <p>Không có phát sinh trong tháng.</p>}</div></article>)}</div>}
    {!visible.length && <div className="collection-empty">Không tìm thấy thành viên phù hợp.</div>}
  </article>;
}

export type BalanceRow = { id: string; name: string; code: string; avatarVersion: number | null; charged: number; paid: number; balance: number };

export function BalanceCollection({ rows }: { rows: BalanceRow[] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [sort, setSort] = useState("BALANCE_ASC");
  const [view, setView] = useResponsiveView("fcfund:report-balance:view");
  const columnDefinitions: CollectionColumn[] = [{ id: "rank", label: "Hạng" }, { id: "member", label: "Thành viên", required: true }, { id: "charged", label: "Phải đóng" }, { id: "paid", label: "Đã nộp" }, { id: "balance", label: "Số dư" }];
  const columns = useColumnVisibility("fcfund:report-balance:columns", columnDefinitions);
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
      if (sort === "CHARGED") return b.charged - a.charged;
      if (sort === "PAID") return b.paid - a.paid;
      if (sort === "BALANCE_DESC") return b.balance - a.balance;
      return a.balance - b.balance;
    });
    return result;
  }, [query, rows, sort, state]);

  return <article className="panel table-panel balance-collection"><div className="panel-heading padded"><div><span className="eyebrow">Công nợ lũy kế</span><h2>Theo thành viên</h2></div></div><div className="report-toolbar-pad"><CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc mã..." count={visible.length} view={view} onViewChange={setView}><select value={state} onChange={(event) => setState(event.target.value)}><option value="ALL">Mọi công nợ</option><option value="DEBT">Đang nợ</option><option value="EVEN">Cân bằng</option><option value="CREDIT">Đóng dư</option></select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option><option value="NAME">Tên A–Z</option><option value="CHARGED">Phải đóng cao nhất</option><option value="PAID">Đã nộp cao nhất</option></select>{view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}</CollectionToolbar></div>{view === "list" ? <div className="data-table-wrap"><table className={`data-table report-sticky-table ${columns.isVisible("rank") ? "has-rank-column" : ""}`}><thead><tr>{columns.isVisible("rank") && <th className="report-rank-column">Hạng</th>}<th className="report-member-column">Thành viên</th>{columns.isVisible("charged") && <th className="align-right">Phải đóng</th>}{columns.isVisible("paid") && <th className="align-right">Đã nộp</th>}{columns.isVisible("balance") && <th className="align-right">Số dư</th>}</tr></thead><tbody>{visible.map((row, index) => <tr key={row.id}>{columns.isVisible("rank") && <td className="report-rank-cell">#{index + 1}</td>}<td className="report-member-column"><MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarVersion} compact /></td>{columns.isVisible("charged") && <td className="align-right">{formatMoney(row.charged)}</td>}{columns.isVisible("paid") && <td className="align-right">{formatMoney(row.paid)}</td>}{columns.isVisible("balance") && <td className="align-right"><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></td>}</tr>)}</tbody></table></div> : <div className="balance-card-grid">{visible.map((row, index) => <article className="balance-member-card" key={row.id}><header><span className="report-rank-badge">#{index + 1}</span><MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarVersion} /><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></header><div><span><small>Phải đóng</small><b>{formatMoney(row.charged)}</b></span><span><small>Đã nộp</small><b>{formatMoney(row.paid)}</b></span></div></article>)}</div>}{!visible.length && <div className="collection-empty">Không tìm thấy công nợ phù hợp.</div>}</article>;
}
