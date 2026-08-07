"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CollectionToolbar, normalizeSearch, useResponsiveView } from "./collection-controls";
import { formatMoney, initials } from "@/lib/format";

export type MemberCollectionRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  hasAccount: boolean;
  accountLabel: string;
  balance: number;
};

export function MembersCollection({ rows }: { rows: MemberCollectionRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [account, setAccount] = useState("ALL");
  const [balance, setBalance] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const [view, setView] = useResponsiveView("fcfund:members:view");

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
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp"><option value="NAME_ASC">Tên A–Z</option><option value="NAME_DESC">Tên Z–A</option><option value="CODE">Mã thành viên</option><option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option></select>
      </CollectionToolbar>

      {view === "list" ? (
        <div className="member-list-view">
          <div className="member-list-head"><span>Thành viên</span><span>Điện thoại</span><span>Trạng thái</span><span>Tài khoản</span><span>Công nợ</span></div>
          {visible.map((member) => <Link href={`/members/${member.id}`} className="member-list-row" key={member.id}>
            <span className="member-list-identity"><b>{initials(member.name)}</b><span><strong>{member.name}</strong><small>{member.code}</small></span></span>
            <span>{member.phone}</span>
            <span><i className={`status-dot ${member.status.toLowerCase()}`} />{member.status === "ACTIVE" ? "Hoạt động" : "Đã nghỉ"}</span>
            <span>{member.accountLabel}</span>
            <strong className={member.balance < 0 ? "money-out" : "money-in"}>{member.balance > 0 ? "+" : ""}{formatMoney(member.balance)}</strong>
          </Link>)}
        </div>
      ) : (
        <section className="member-grid">
          {visible.map((member) => <Link href={`/members/${member.id}`} className={`member-card ${member.status === "INACTIVE" ? "inactive" : ""}`} key={member.id}>
            <div className="member-card-top"><span className="member-avatar">{initials(member.name)}</span><div><h2>{member.name}</h2><p>{member.code} · {member.phone}</p></div><span className={`status-dot ${member.status.toLowerCase()}`} /></div>
            <div className="member-card-meta"><div><small>Tài khoản</small><strong>{member.accountLabel}</strong></div><div className="align-right"><small>{member.balance < 0 ? "Còn nợ" : "Số dư"}</small><strong className={member.balance < 0 ? "money-out" : "money-in"}>{formatMoney(Math.abs(member.balance))}</strong></div></div>
          </Link>)}
        </section>
      )}
      {!visible.length && <div className="panel collection-empty">Không tìm thấy thành viên phù hợp.</div>}
    </>
  );
}
