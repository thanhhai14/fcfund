"use client";

import { useMemo, useState } from "react";
import { CollectionToolbar, normalizeSearch } from "./collection-controls";
import { Icon } from "./icon";
import { MemberIdentity } from "./member-identity";
import { formatMoney } from "@/lib/format";

type MatrixMember = { id: string; fullName: string; avatarUpdatedAt: Date | null };
type MatrixChargeType = { id: string; name: string; defaultAmount: number; iconName: string; color: string | null };

export function MatchFields({
  memberRows,
  occurrenceTypes,
  playedOn,
  note = "",
  initialParticipantIds = [],
  initialChargeQuantities = {},
  lockParticipants = false,
  lockPlayedOn = lockParticipants,
  lockedChargeTypeIds = [],
}: {
  memberRows: MatrixMember[];
  occurrenceTypes: MatrixChargeType[];
  playedOn: string;
  note?: string;
  initialParticipantIds?: string[];
  initialChargeQuantities?: Record<string, number>;
  lockParticipants?: boolean;
  lockPlayedOn?: boolean;
  lockedChargeTypeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("ASC");
  const [selected, setSelected] = useState(() => new Set(initialParticipantIds));
  const lockedChargeTypes = useMemo(() => new Set(lockedChargeTypeIds), [lockedChargeTypeIds]);
  const columns = `minmax(170px, 1fr) repeat(${1 + occurrenceTypes.length}, 88px)`;
  const ordered = useMemo(() => [...memberRows].sort((a, b) => sort === "DESC" ? b.fullName.localeCompare(a.fullName, "vi") : a.fullName.localeCompare(b.fullName, "vi")), [memberRows, sort]);
  const search = normalizeSearch(query);

  function setParticipant(memberId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(memberId); else next.delete(memberId);
      return next;
    });
  }

  return <>
    <div className="form-row"><label className="date-field">Ngày thi đấu<input name="playedOn" type="date" defaultValue={playedOn} required disabled={lockPlayedOn} /></label><label>Ghi chú<input name="note" defaultValue={note} placeholder="Sân, khung giờ..." /></label></div>
    <div>
      <span className="field-label">Người tham gia và khoản thu</span>
      <p className="matrix-help">{lockParticipants ? "Ngày và người tham gia đã được khóa theo trạng thái trận. Bạn vẫn có thể sửa các khoản thu được phép của người đang tham gia." : "Nhập số lần phát sinh từ 1 trở lên sẽ tự đánh dấu người đó tham gia trận."}</p>
      {lockParticipants && initialParticipantIds.map((memberId) => <input type="hidden" name="participants" value={memberId} key={memberId} />)}
      <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên..." count={selected.size} countLabel={`${selected.size} người đã chọn`}>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Tất cả thành viên</option><option value="SELECTED">Đã chọn</option><option value="UNSELECTED">Chưa chọn</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="ASC">Tên A–Z</option><option value="DESC">Tên Z–A</option></select>
      </CollectionToolbar>
      <div className="participant-matrix">
        <div className="matrix-head" style={{ gridTemplateColumns: columns }}><span>Thành viên</span><span>Tham gia</span>{occurrenceTypes.map((type) => <span key={type.id}><Icon name={type.iconName} /><small>{type.name}</small><small>{formatMoney(type.defaultAmount)}</small></span>)}</div>
        {ordered.map((member) => {
          const isSelected = selected.has(member.id);
          const visible = (!search || normalizeSearch(member.fullName).includes(search)) && (filter === "ALL" || (filter === "SELECTED" ? isSelected : !isSelected));
          return <div className={`matrix-row ${visible ? "" : "filtered-out"}`} style={{ gridTemplateColumns: columns }} key={member.id}>
            <MemberIdentity memberId={member.id} name={member.fullName} avatarVersion={member.avatarUpdatedAt} compact />
            <label className="box-check" title={lockParticipants ? "Người tham gia đã được khóa theo trạng thái trận" : "Đánh dấu tham gia"}><input type="checkbox" name={lockParticipants ? undefined : "participants"} value={member.id} checked={isSelected} disabled={lockParticipants} onChange={(event) => setParticipant(member.id, event.target.checked)} /><small className="matrix-mobile-label">Tham gia</small><span>✓</span></label>
            {occurrenceTypes.map((type) => {
              const key = `${member.id}|${type.id}`;
              const chargeLocked = lockedChargeTypes.has(type.id);
              return <label
                className="quantity-field"
                title={chargeLocked ? "Khoản phạt từ kết quả được quản lý trong phần Kết quả trận" : `${type.name} · ${member.fullName}`}
                key={type.id}
              ><small className="matrix-mobile-label"><Icon name={type.iconName} />{type.name}<em>{formatMoney(type.defaultAmount)}</em></small><input
                type="number"
                name={`matchChargeQuantity:${member.id}:${type.id}`}
                min="0"
                max="99"
                step="1"
                inputMode="numeric"
                defaultValue={initialChargeQuantities[key] ?? 0}
                disabled={chargeLocked || (lockParticipants && !isSelected)}
                onChange={(event) => { if (!lockParticipants && Number(event.target.value) > 0) setParticipant(member.id, true); }}
                aria-label={`Số lần ${type.name} của ${member.fullName}`}
              /></label>;
            })}
          </div>;
        })}
      </div>
    </div>
  </>;
}
