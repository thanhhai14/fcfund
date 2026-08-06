"use client";

import { useMemo, useState } from "react";
import { CollectionToolbar, normalizeSearch, useResponsiveView } from "./collection-controls";
import { Disclosure } from "./disclosure";
import { MutationForm, SubmitButton } from "./mutation-form";
import { formatDate, formatMoney } from "@/lib/format";
import { softDeleteFinancialAction, updateFundTransactionAction } from "@/app/(app)/mutations";

export type TransactionCollectionRow = {
  id: string;
  direction: "IN" | "OUT";
  kind: string;
  amount: number;
  date: string;
  note: string | null;
  memberName: string | null;
  categoryName: string | null;
  matchDate: string | null;
};

const KIND_LABELS: Record<string, string> = { MEMBER_PAYMENT: "Thành viên nộp", OTHER_INCOME: "Thu khác", EXPENSE: "Khoản chi", OPENING_BALANCE: "Số dư đầu kỳ", ADJUSTMENT: "Điều chỉnh" };

function TransactionActions({ row }: { row: TransactionCollectionRow }) {
  return <Disclosure label="•••" className="row-disclosure"><MutationForm action={updateFundTransactionAction} className="form-stack compact"><input type="hidden" name="id" value={row.id} /><label>Số tiền<input name="amount" type="number" min="1" defaultValue={row.amount} /></label><label>Ngày<input name="transactionDate" type="date" defaultValue={row.date} /></label><label>Ghi chú<input name="note" defaultValue={row.note ?? ""} /></label><SubmitButton>Lưu thay đổi</SubmitButton></MutationForm><form action={softDeleteFinancialAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="entity" value="transaction" /><button className="button danger wide small">Xóa giao dịch</button></form></Disclosure>;
}

export function TransactionsCollection({ rows, canManage }: { rows: TransactionCollectionRow[]; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [member, setMember] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("DATE_DESC");
  const [view, setView] = useResponsiveView("fcfund:transactions:view");
  const categories = useMemo(() => [...new Set(rows.flatMap((row) => row.categoryName ? [row.categoryName] : []))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const kinds = useMemo(() => [...new Set(rows.map((row) => row.kind))], [rows]);
  const memberNames = useMemo(() => [...new Set(rows.flatMap((row) => row.memberName ? [row.memberName] : []))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = rows.filter((row) => {
      if (search && !normalizeSearch(`${row.note ?? ""} ${row.memberName ?? ""} ${row.categoryName ?? ""}`).includes(search)) return false;
      if (direction !== "ALL" && row.direction !== direction) return false;
      if (kind !== "ALL" && row.kind !== kind) return false;
      if (category !== "ALL" && row.categoryName !== category) return false;
      if (member !== "ALL" && row.memberName !== member) return false;
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "DATE_ASC") return a.date.localeCompare(b.date);
      if (sort === "AMOUNT_DESC") return b.amount - a.amount;
      if (sort === "AMOUNT_ASC") return a.amount - b.amount;
      if (sort === "MEMBER") return (a.memberName ?? "zzz").localeCompare(b.memberName ?? "zzz", "vi");
      return b.date.localeCompare(a.date);
    });
    return result;
  }, [category, dateFrom, dateTo, direction, kind, member, query, rows, sort]);

  return <>
    <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm nội dung, thành viên, danh mục..." count={visible.length} view={view} onViewChange={setView}>
      <select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="ALL">Tất cả Thu/Chi</option><option value="IN">Khoản thu</option><option value="OUT">Khoản chi</option></select>
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="ALL">Mọi loại giao dịch</option>{kinds.map((value) => <option value={value} key={value}>{KIND_LABELS[value] ?? value}</option>)}</select>
      <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Mọi danh mục</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={member} onChange={(event) => setMember(event.target.value)}><option value="ALL">Mọi thành viên</option>{memberNames.map((value) => <option key={value}>{value}</option>)}</select>
      <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Từ ngày" title="Từ ngày" />
      <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Đến ngày" title="Đến ngày" />
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="DATE_DESC">Mới nhất</option><option value="DATE_ASC">Cũ nhất</option><option value="AMOUNT_DESC">Tiền cao nhất</option><option value="AMOUNT_ASC">Tiền thấp nhất</option><option value="MEMBER">Tên thành viên</option></select>
    </CollectionToolbar>
    {view === "list" ? <article className="panel table-panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Nội dung</th><th>Danh mục</th><th>Ngày</th><th>Thành viên</th><th className="align-right">Số tiền</th>{canManage && <th />}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td><strong>{row.note || (row.direction === "IN" ? "Khoản thu" : "Khoản chi")}</strong>{row.matchDate && <small>Trận ngày {formatDate(row.matchDate)}</small>}</td><td><span className={`direction-pill ${row.direction.toLowerCase()}`}>{row.direction === "IN" ? "Thu" : "Chi"} · {row.categoryName ?? KIND_LABELS[row.kind] ?? row.kind}</span></td><td>{formatDate(row.date)}</td><td>{row.memberName ?? "—"}</td><td className="align-right"><strong className={row.direction === "IN" ? "money-in" : "money-out"}>{row.direction === "IN" ? "+" : "-"}{formatMoney(row.amount)}</strong></td>{canManage && <td><TransactionActions row={row} /></td>}</tr>)}</tbody></table></div></article> : <div className="financial-card-grid">{visible.map((row) => <article className={`financial-card ${row.direction.toLowerCase()}`} key={row.id}><header><div><small>{formatDate(row.date)}{row.matchDate ? ` · Trận ${formatDate(row.matchDate)}` : ""}</small><h2>{row.note || (row.direction === "IN" ? "Khoản thu" : "Khoản chi")}</h2></div>{canManage && <TransactionActions row={row} />}</header><span className={`direction-pill ${row.direction.toLowerCase()}`}>{row.direction === "IN" ? "Thu" : "Chi"} · {row.categoryName ?? KIND_LABELS[row.kind] ?? row.kind}</span><p>{row.memberName ?? "Không gắn thành viên"}</p><footer><span>{KIND_LABELS[row.kind] ?? row.kind}</span><strong className={row.direction === "IN" ? "money-in" : "money-out"}>{row.direction === "IN" ? "+" : "-"}{formatMoney(row.amount)}</strong></footer></article>)}</div>}
    {!visible.length && <div className="panel collection-empty">Không có giao dịch phù hợp.</div>}
  </>;
}
