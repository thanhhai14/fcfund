"use client";

import { useMemo, useState } from "react";
import { CollectionToolbar, ColumnVisibilityMenu, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { Disclosure } from "./disclosure";
import { Icon } from "./icon";
import { MutationForm, SubmitButton } from "./mutation-form";
import { formatDate, formatMoney } from "@/lib/format";
import { softDeleteFinancialAction, updateMemberChargeAction } from "@/app/(app)/mutations";
import { MemberIdentity } from "./member-identity";
import { CompactDateRangeFilter } from "./compact-date-range-filter";

export type ChargeCollectionRow = {
  id: string;
  memberName: string;
  memberId: string;
  avatarUpdatedAt: Date | null;
  typeName: string;
  iconName: string;
  color: string | null;
  source: string;
  date: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  note: string | null;
};

const SOURCE_LABELS: Record<string, string> = { AUTO_MONTHLY: "Theo tháng", MANUAL: "Nhập tay", MATCH: "Trận đấu", ADJUSTMENT: "Điều chỉnh" };
const CHARGE_COLUMNS: CollectionColumn[] = [
  { id: "member", label: "Thành viên", required: true }, { id: "source", label: "Nguồn" },
  { id: "date", label: "Ngày" }, { id: "type", label: "Loại thu" },
  { id: "quantity", label: "Số lượng" }, { id: "amount", label: "Số tiền" },
];

function ChargeActions({ row }: { row: ChargeCollectionRow }) {
  return <Disclosure label="•••" className="row-disclosure">
    <MutationForm action={updateMemberChargeAction} className="form-stack compact">
      <input type="hidden" name="id" value={row.id} />
      <label>Số lượng<input name="quantity" type="number" min="1" defaultValue={row.quantity} /></label>
      <label>Đơn giá<input name="unitAmount" type="number" min="0" defaultValue={row.unitAmount} /></label>
      <label>Ngày<input name="chargeDate" type="date" defaultValue={row.date} /></label>
      <label>Ghi chú<input name="note" defaultValue={row.note ?? ""} /></label>
      <SubmitButton>Lưu thay đổi</SubmitButton>
    </MutationForm>
    <form action={softDeleteFinancialAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="entity" value="charge" /><button className="button danger wide small">Xóa khoản này</button></form>
  </Disclosure>;
}

export function ChargesCollection({ rows, canManage, defaultDateFrom, defaultDateTo }: { rows: ChargeCollectionRow[]; canManage: boolean; defaultDateFrom: string; defaultDateTo: string }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [sort, setSort] = useState("DATE_DESC");
  const [view, setView] = useResponsiveView("fcfund:charges:view");
  const columns = useColumnVisibility("fcfund:charges:columns", CHARGE_COLUMNS);
  const types = useMemo(() => [...new Set(rows.map((row) => row.typeName))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = rows.filter((row) => {
      if (search && !normalizeSearch(`${row.memberName} ${row.note ?? ""}`).includes(search)) return false;
      if (type !== "ALL" && row.typeName !== type) return false;
      if (source !== "ALL" && row.source !== source) return false;
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "DATE_ASC") return a.date.localeCompare(b.date);
      if (sort === "NAME") return a.memberName.localeCompare(b.memberName, "vi");
      if (sort === "AMOUNT_DESC") return b.totalAmount - a.totalAmount;
      if (sort === "AMOUNT_ASC") return a.totalAmount - b.totalAmount;
      if (sort === "QUANTITY") return b.quantity - a.quantity;
      return b.date.localeCompare(a.date);
    });
    return result;
  }, [dateFrom, dateTo, query, rows, sort, source, type]);

  return <>
    <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên hoặc ghi chú..." count={visible.length} view={view} onViewChange={setView}>
      <select value={type} onChange={(event) => setType(event.target.value)}><option value="ALL">Mọi loại thu</option>{types.map((name) => <option key={name}>{name}</option>)}</select>
      <select value={source} onChange={(event) => setSource(event.target.value)}><option value="ALL">Mọi nguồn</option>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <CompactDateRangeFilter dateFrom={dateFrom} dateTo={dateTo} today={defaultDateTo} onChange={(range) => { setDateFrom(range.dateFrom); setDateTo(range.dateTo); }} />
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="DATE_DESC">Mới nhất</option><option value="DATE_ASC">Cũ nhất</option><option value="NAME">Tên thành viên</option><option value="AMOUNT_DESC">Tiền cao nhất</option><option value="AMOUNT_ASC">Tiền thấp nhất</option><option value="QUANTITY">Số lần nhiều nhất</option></select>
      {view === "list" && <ColumnVisibilityMenu columns={CHARGE_COLUMNS} hidden={columns.hidden} onToggle={columns.toggle} />}
    </CollectionToolbar>
    {view === "list" ? <article className="panel table-panel"><div className="data-table-wrap"><table className="data-table charges-list-table"><thead><tr><th>Thành viên</th>{columns.isVisible("source") && <th>Nguồn</th>}{columns.isVisible("date") && <th>Ngày</th>}{columns.isVisible("type") && <th>Loại thu</th>}{columns.isVisible("quantity") && <th className="align-right">Số lượng</th>}{columns.isVisible("amount") && <th className="align-right">Số tiền</th>}{canManage && <th />}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td><MemberIdentity memberId={row.memberId} name={row.memberName} avatarVersion={row.avatarUpdatedAt} compact /></td>{columns.isVisible("source") && <td>{SOURCE_LABELS[row.source] ?? row.source}</td>}{columns.isVisible("date") && <td>{formatDate(row.date)}</td>}{columns.isVisible("type") && <td><span className="charge-type-icon-only" style={{ color: row.color ?? undefined }} title={row.typeName} aria-label={row.typeName}><Icon name={row.iconName} /></span></td>}{columns.isVisible("quantity") && <td className="align-right">×{row.quantity}</td>}{columns.isVisible("amount") && <td className="align-right"><strong className="money-out">{formatMoney(row.totalAmount)}</strong></td>}{canManage && <td><ChargeActions row={row} /></td>}</tr>)}</tbody></table></div></article> : <div className="financial-card-grid">{visible.map((row) => <article className="financial-card" key={row.id}><header><MemberIdentity memberId={row.memberId} name={row.memberName} avatarVersion={row.avatarUpdatedAt} secondary={`${SOURCE_LABELS[row.source] ?? row.source} · ${formatDate(row.date)}`} />{canManage && <ChargeActions row={row} />}</header><span className="category-pill" style={{ color: row.color ?? undefined, borderLeftColor: row.color ?? undefined }}><Icon name={row.iconName} /> {row.typeName}</span><p>{row.note || "Không có ghi chú"}</p><footer><span>{row.quantity} × {formatMoney(row.unitAmount)}</span><strong className="money-out">{formatMoney(row.totalAmount)}</strong></footer></article>)}</div>}
    {!visible.length && <div className="panel collection-empty">Không có khoản phải thu phù hợp.</div>}
  </>;
}
