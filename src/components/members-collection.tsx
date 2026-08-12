"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CollectionToolbar, ColumnVisibilityMenu, normalizeSearch, useColumnVisibility, useResponsiveView, type CollectionColumn } from "./collection-controls";
import { formatMoney } from "@/lib/format";
import { MemberIdentity } from "./member-identity";
import { InfoTooltip } from "./info-tooltip";
import { Icon } from "./icon";
import { preferredFootLabel } from "@/lib/member-profile";

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
  bio: string | null;
  nickname: string | null;
  preferredPosition: string | null;
  preferredFoot: string | null;
  shirtNumber: number | null;
  matchCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
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
    { id: "shirt", label: "Số áo" },
    { id: "nickname", label: "Biệt danh" },
    { id: "position", label: "Vị trí" },
    { id: "foot", label: "Chân thuận" },
    { id: "bio", label: "Giới thiệu" },
    ...(showForm ? [
      { id: "matches", label: "Số trận" },
      { id: "record", label: "Thắng / Thua" },
      { id: "winRate", label: "Tỷ lệ thắng" },
    ] : []),
    { id: "phone", label: "Điện thoại", defaultVisible: false },
    { id: "status", label: "Trạng thái", defaultVisible: false },
    { id: "account", label: "Tài khoản", defaultVisible: false },
    ...(showForm ? [{ id: "form", label: "Phong độ" }] : []),
    { id: "balance", label: "Công nợ" },
  ], [showForm]);
  const columns = useColumnVisibility("fcfund:members:columns:v2", columnDefinitions);
  const columnWidths: Record<string, { track: string; minimum: number }> = {
    rank: { track: "52px", minimum: 52 }, member: { track: "minmax(200px, 2fr)", minimum: 220 },
    shirt: { track: "70px", minimum: 70 }, nickname: { track: "minmax(105px, 1fr)", minimum: 120 },
    position: { track: "minmax(105px, 1fr)", minimum: 120 }, foot: { track: "90px", minimum: 90 },
    bio: { track: "70px", minimum: 70 }, matches: { track: "75px", minimum: 75 },
    record: { track: "100px", minimum: 100 }, winRate: { track: "90px", minimum: 90 },
    phone: { track: "130px", minimum: 130 }, status: { track: "110px", minimum: 110 },
    account: { track: "120px", minimum: 120 }, form: { track: "95px", minimum: 95 },
    balance: { track: "120px", minimum: 120 },
  };
  const visibleColumns = columnDefinitions.filter((column) => columns.isVisible(column.id));
  const gridTemplateColumns = visibleColumns.map((column) => columnWidths[column.id].track).join(" ");
  const gridMinWidth = visibleColumns.reduce((sum, column) => sum + columnWidths[column.id].minimum, 0) + Math.max(0, visibleColumns.length - 1) * 14 + 30;

  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    const result = rows.filter((row) => {
      if (search && !normalizeSearch(`${row.name} ${row.code} ${row.phone} ${row.nickname ?? ""} ${row.preferredPosition ?? ""}`).includes(search)) return false;
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
      if (sort === "MATCHES_DESC") return b.matchCount - a.matchCount || a.name.localeCompare(b.name, "vi");
      if (sort === "WIN_RATE_DESC") return (b.winRate ?? -1) - (a.winRate ?? -1) || a.name.localeCompare(b.name, "vi");
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
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp"><option value="NAME_ASC">Tên A–Z</option><option value="NAME_DESC">Tên Z–A</option><option value="CODE">Mã thành viên</option>{showForm && <><option value="MATCHES_DESC">Thi đấu nhiều nhất</option><option value="WIN_RATE_DESC">Tỷ lệ thắng cao nhất</option><option value="FORM_DESC">Phong độ cao nhất</option><option value="FORM_ASC">Phong độ thấp nhất</option></>}<option value="BALANCE_ASC">Nợ nhiều trước</option><option value="BALANCE_DESC">Dư nhiều trước</option></select>
        {view === "list" && <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />}
      </CollectionToolbar>

      {view === "list" ? (
        <div className="member-list-view">
          <div className="member-list-head" style={{ gridTemplateColumns, minWidth: gridMinWidth }}>{columns.isVisible("rank") && <span className="member-rank-column">Hạng</span>}{columns.isVisible("member") && <span>Thành viên</span>}{columns.isVisible("shirt") && <span className="member-centered-column">Số áo</span>}{columns.isVisible("nickname") && <span>Biệt danh</span>}{columns.isVisible("position") && <span>Vị trí</span>}{columns.isVisible("foot") && <span>Chân thuận</span>}{columns.isVisible("bio") && <span className="member-centered-column">Giới thiệu</span>}{showForm && columns.isVisible("matches") && <span className="member-centered-column">Số trận</span>}{showForm && columns.isVisible("record") && <span className="member-centered-column">Thắng / Thua</span>}{showForm && columns.isVisible("winRate") && <span className="member-centered-column">Tỷ lệ thắng</span>}{columns.isVisible("phone") && <span>Điện thoại</span>}{columns.isVisible("status") && <span>Trạng thái</span>}{columns.isVisible("account") && <span>Tài khoản</span>}{showForm && columns.isVisible("form") && <span className="member-form-column">Phong độ</span>}{columns.isVisible("balance") && <span>Công nợ</span>}</div>
          {visible.map((member, index) => <Link href={`/members/${member.id}`} className="member-list-row" style={{ gridTemplateColumns, minWidth: gridMinWidth }} key={member.id}>
            {columns.isVisible("rank") && <strong className="member-rank-column">#{index + 1}</strong>}
            <MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} />
            {columns.isVisible("shirt") && <strong className="member-centered-column">{member.shirtNumber !== null ? `#${member.shirtNumber}` : "—"}</strong>}
            {columns.isVisible("nickname") && <span>{member.nickname || "—"}</span>}
            {columns.isVisible("position") && <span>{member.preferredPosition || "—"}</span>}
            {columns.isVisible("foot") && <span className="preferred-foot-value">{member.preferredFoot ? <><Icon name="shoe-prints" />{preferredFootLabel(member.preferredFoot)}</> : "—"}</span>}
            {columns.isVisible("bio") && <span className="member-centered-column"><InfoTooltip content={member.bio} label={`Giới thiệu của ${member.name}`} /></span>}
            {showForm && columns.isVisible("matches") && <strong className="member-centered-column">{member.matchCount}</strong>}
            {showForm && columns.isVisible("record") && <span className="member-record member-centered-column"><b>{member.winCount} T</b><i>{member.lossCount} B</i></span>}
            {showForm && columns.isVisible("winRate") && <strong className="member-win-rate member-centered-column">{member.winRate !== null ? `${member.winRate}%` : "—"}</strong>}
            {columns.isVisible("phone") && <span>{member.phone}</span>}
            {columns.isVisible("status") && <span className="member-status-cell"><i className={`status-dot ${member.status.toLowerCase()}`} />{member.status === "ACTIVE" ? "Hoạt động" : "Đã nghỉ"}</span>}
            {columns.isVisible("account") && <span>{member.accountLabel}</span>}
            {showForm && columns.isVisible("form") && <strong className="member-form-score member-form-column">{Math.round(member.formScore / 100)} điểm</strong>}
            {columns.isVisible("balance") && <strong className={member.balance < 0 ? "money-out" : "money-in"}>{member.balance > 0 ? "+" : ""}{formatMoney(member.balance)}</strong>}
          </Link>)}
        </div>
      ) : (
        <section className="member-grid">
          {visible.map((member, index) => <Link href={`/members/${member.id}`} className={`member-card ${member.status === "INACTIVE" ? "inactive" : ""}`} key={member.id}>
            <div className="member-card-top"><span className="report-rank-badge member-card-rank">#{index + 1}</span><MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarVersion} secondary={[member.nickname, member.preferredPosition].filter(Boolean).join(" · ") || null} /><InfoTooltip content={member.bio} label={`Giới thiệu của ${member.name}`} /></div>
            <div className="member-card-cv">{member.shirtNumber !== null && <span>#{member.shirtNumber}</span>}{member.preferredFoot && <span className="preferred-foot-value"><Icon name="shoe-prints" />{preferredFootLabel(member.preferredFoot)}</span>}{member.shirtNumber === null && !member.preferredFoot && <span>Chưa cập nhật CV</span>}</div>
            <div className="member-card-meta">{showForm && <><div><small>Số trận</small><strong>{member.matchCount}</strong></div><div><small>Thắng / Thua</small><strong><span className="won">{member.winCount}</span> / <span className="lost">{member.lossCount}</span></strong></div><div><small>Tỷ lệ thắng</small><strong>{member.winRate !== null ? `${member.winRate}%` : "—"}</strong></div><div><small>Phong độ</small><strong className="member-form-score">{Math.round(member.formScore / 100)} điểm</strong></div></>}<div><small>{member.balance < 0 ? "Còn nợ" : "Số dư"}</small><strong className={member.balance < 0 ? "money-out" : "money-in"}>{formatMoney(Math.abs(member.balance))}</strong></div></div>
          </Link>)}
        </section>
      )}
      {!visible.length && <div className="panel collection-empty">Không tìm thấy thành viên phù hợp.</div>}
    </>
  );
}
