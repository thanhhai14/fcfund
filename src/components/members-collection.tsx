"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CollectionToolbar, ColumnVisibilityMenu, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { formatMoney } from "@/lib/format";
import { MemberIdentity } from "./member-identity";

export type MemberCollectionRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  hasAccount: boolean;
  accountLabel: string;
  balance: number;
  formScore: number;
  avatarVersion: number | null;
};

export function MembersCollection({ rows, showForm }: { rows: MemberCollectionRow[]; showForm: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [account, setAccount] = useState("ALL");
  const [balance, setBalance] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const [view, setView] = useResponsiveView("fcfund:members:view");
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "rank", label: "Hạng" },
    { id: "member", label: "Thành viên", required: true },
    { id: "phone", label: "Điện thoại" },
    { id: "status", label: "Trạng thái" },
    { id: "account", label: "Tài khoản" },
    ...(showForm ? [{ id: "form", label: "Phong độ" }] : []),
    { id: "balance", label: "Công nợ" },
  ], [showForm]);
  const columns = useColumnVisibility("fcfund:members:columns", columnDefinitions);
  const gridTemplateColumns = columnDefinitions.filter((column) => columns.isVisible(column.id)).map((column) => column.id === "rank" ? "52px" : column.id === "member" ? "2fr" : column.id === "phone" ? "1.2fr" : column.id === "form" ? ".75fr" : "1fr").join(" ");

  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = rows.filter((row) => {
      if (search && !normalizeSearch(`${row.name} ${row.code} ${row.phone}`).includes(search)) return false;
      if (status !== "ALL" && row.status !== status) return false;
      if (account === "HAS" && !row.hasAccount) return false;
      if (account === "NONE" && row.hasAccount) return false;
      if (balance === "DEBT" && row.balance >= 0) return false;
      if (balance === "CREDIT" && row.balance <= 0) return false;
      if (balance === "EVEN" && row.balance !== 0) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "NAME_DESC") return b.name.localeCompare(a.name, "vi");
      if (sort === "CODE") return a.code.localeCompare(b.code, "vi", { numeric: true });
      if (sort === "BALANCE_ASC") return a.balance - b.balance;
      if (sort === "BALANCE_DESC") return b.balance - a.balance;
      if (sort === "FORM_ASC") return a.formScore - b.formScore || a.name.localeCompare(b.name, "vi");
      if (sort === "FORM_DESC") return b.formScore - a.formScore || a.name.localeCompare(b.name, "vi");
      return a.name.localeCompare(b.name, "vi");
    });
    return result;
  }, [account, balance, query, rows, sort, status]);

  return (
    <>
      <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm tên, mã hoặc số điện thoại..." count={visible.length} view={view} onViewChange={setView}>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Trạng thái"><option value="ALL">Mọi trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Đã nghỉ</option></select>
        <select value={account} onChange={(event) => setAccount(event.target.value)} aria-label="Tài khoản"><option value="ALL">Mọi tài khoản</option><option value="HAS">Có tài khoản</option><option value="NONE">Chưa có tài khoản</option></select>
        <select value={balance} onChange={(event) => setBalance(event.target.value)} aria-label="Công nợ"><option value="ALL">Mọi công nợ</option><option value="DEBT">Đang nợ</option><option value="CREDIT">Đóng dư</option><option value="EVEN">Cân bằng</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp"><option value="NAME_ASC">Tên A–Z</option><option value="NAME_DESC">Tên Z–A</option><option value="CODE">Mã thành viên</option>{showForm && <><option value="FORM_DESC">Phong độ cao nhất</option><option value="FORM_ASC">Phong độ thấp nhất</option></>}<option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option></select>
        {view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}
      </CollectionToolbar>

      {view === "list" ? (
        <div className="member-list-view">
          <div className="member-list-head" style={{ gridTemplateColumns }}>{columns.isVisible("rank") && <span className="member-rank-column">Hạng</span>}{columns.isVisible("member") && <span>Thành viên</span>}{columns.isVisible("phone") && <span>Điện thoại</span>}{columns.isVisible("status") && <span>Trạng thái</span>}{columns.isVisible("account") && <span>Tài khoản</span>}{showForm && columns.isVisible("form") && <span className="member-form-column">Phong độ</span>}{columns.isVisible("balance") && <span>Công nợ</span>}</div>
          {visible.map((member, index) => <Link href={`/members/${member.id}`} className="member-list-row" style={{ gridTemplateColumns }} key={member.id}>
            {columns.isVisible("rank") && <strong className="member-rank-column">#{index + 1}</strong>}
            <MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} />
            {columns.isVisible("phone") && <span>{member.phone}</span>}
            {columns.isVisible("status") && <span className="member-status-cell"><i className={`status-dot ${member.status.toLowerCase()}`} />{member.status === "ACTIVE" ? "Hoạt động" : "Đã nghỉ"}</span>}
            {columns.isVisible("account") && <span>{member.accountLabel}</span>}
            {showForm && columns.isVisible("form") && <strong className="member-form-score member-form-column">{Math.round(member.formScore / 100)} điểm</strong>}
            {columns.isVisible("balance") && <strong className={member.balance < 0 ? "money-out" : "money-in"}>{member.balance > 0 ? "+" : ""}{formatMoney(member.balance)}</strong>}
          </Link>)}
        </div>
      ) : (
        <section className="member-grid">
          {visible.map((member) => <Link href={`/members/${member.id}`} className={`member-card ${member.status === "INACTIVE" ? "inactive" : ""}`} key={member.id}>
            <div className="member-card-top"><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} secondary={member.phone} /><span className={`status-dot ${member.status.toLowerCase()}`} /></div>
            <div className="member-card-meta"><div><small>Tài khoản</small><strong>{member.accountLabel}</strong></div>{showForm && <div className="align-right"><small>Phong độ</small><strong className="member-form-score">{Math.round(member.formScore / 100)} điểm</strong></div>}<div className="align-right"><small>{member.balance < 0 ? "Còn nợ" : "Số dư"}</small><strong className={member.balance < 0 ? "money-out" : "money-in"}>{formatMoney(Math.abs(member.balance))}</strong></div></div>
          </Link>)}
        </section>
      )}
      {!visible.length && <div className="panel collection-empty">Không tìm thấy thành viên phù hợp.</div>}
    </>
  );
}
