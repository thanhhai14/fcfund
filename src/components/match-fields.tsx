"use client";

import { useMemo, useState } from "react";
import { CollectionToolbar, normalizeSearch } from "./collection-controls";
import { Icon } from "./icon";
import { formatMoney } from "@/lib/format";

type MatrixMember = { id: string; fullName: string };
type MatrixChargeType = { id: string; name: string; defaultAmount: number; iconName: string; color: string | null };

export function MatchFields({
  memberRows,
  occurrenceTypes,
  playedOn,
  note = "",
  initialParticipantIds = [],
  initialChargeQuantities = {},
}: {
  memberRows: MatrixMember[];
  occurrenceTypes: MatrixChargeType[];
  playedOn: string;
  note?: string;
  initialParticipantIds?: string[];
  initialChargeQuantities?: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("ASC");
  const [selected, setSelected] = useState(() => new Set(initialParticipantIds));
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
    <div className="form-row"><label>Ngày thi đấu<input name="playedOn" type="date" defaultValue={playedOn} required /></label><label>Ghi chú<input name="note" defaultValue={note} placeholder="Sân, khung giờ..." /></label></div>
    <div>
      <span className="field-label">Người tham gia và khoản thu</span>
      <p className="matrix-help">Nhập số lần phát sinh từ 1 trở lên sẽ tự đánh dấu người đó tham gia trận.</p>
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
            <strong>{member.fullName}</strong>
            <label className="box-check" title="Đánh dấu tham gia"><input type="checkbox" name="participants" value={member.id} checked={isSelected} onChange={(event) => setParticipant(member.id, event.target.checked)} /><span>✓</span></label>
            {occurrenceTypes.map((type) => { const key = `${member.id}|${type.id}`; return <label className="quantity-field" title={`${type.name} · ${member.fullName}`} key={type.id}><input type="number" name={`matchChargeQuantity:${member.id}:${type.id}`} min="0" max="99" step="1" inputMode="numeric" defaultValue={initialChargeQuantities[key] ?? 0} onChange={(event) => { if (Number(event.target.value) > 0) setParticipant(member.id, true); }} aria-label={`Số lần ${type.name} của ${member.fullName}`} /></label>; })}
          </div>;
        })}
      </div>
    </div>
  </>;
}
