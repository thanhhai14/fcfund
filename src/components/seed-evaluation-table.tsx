"use client";

import { useMemo, useState } from "react";
import { CollectionToolbar, ColumnVisibilityMenu, normalizeSearch, useColumnVisibility, type CollectionColumn } from "./collection-controls";
import { MemberIdentity } from "./member-identity";

type SeedRow = {
  id: string;
  name: string;
  memberId: string | null;
  avatarVersion: number | null;
  isGuest: boolean;
  seedTier: string | null;
  suggestedSeedTier: string | null;
  matchCount: number;
  winCount: number;
  formScore: number;
  inferredMatchCount: number;
  lowForm: boolean;
  goalkeeperAvailable: boolean;
};

const SEED_ORDER: Record<string, number> = { TIER_1: 1, TIER_2: 2, TIER_3: 3, TIER_4: 4, TIER_5: 5, TIER_6: 6, TIER_7: 7 };
const SEED_COLUMNS: CollectionColumn[] = [{ id: "member", label: "Thành viên", required: true }, { id: "seed", label: "Seed trận này", required: true }, { id: "goalkeeper", label: "Có thể bắt gôn", required: true }, { id: "matches", label: "Số trận" }, { id: "wins", label: "Hạng nhất" }, { id: "formScore", label: "Phong độ" }];

export function SeedEvaluationTable({ rows }: { rows: SeedRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME");
  const [seeds, setSeeds] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.id, SEED_ORDER[row.seedTier ?? ""] ? row.seedTier! : SEED_ORDER[row.suggestedSeedTier ?? ""] ? row.suggestedSeedTier! : ""])));
  const columns = useColumnVisibility("fcfund:seed-evaluation:columns", SEED_COLUMNS);
  const ordered = useMemo(() => [...rows].sort((a, b) => {
    if (sort === "SEED") return (SEED_ORDER[seeds[a.id]] ?? 99) - (SEED_ORDER[seeds[b.id]] ?? 99) || a.name.localeCompare(b.name, "vi");
    if (sort === "MATCHES") return b.matchCount - a.matchCount || a.name.localeCompare(b.name, "vi");
    if (sort === "FORM_ASC") return a.formScore - b.formScore || a.name.localeCompare(b.name, "vi");
    if (sort === "FORM_DESC") return b.formScore - a.formScore || a.name.localeCompare(b.name, "vi");
    return a.name.localeCompare(b.name, "vi");
  }), [rows, seeds, sort]);
  const search = normalizeSearch(query);
  const visibleCount = ordered.filter((row) => (!search || normalizeSearch(row.name).includes(search)) && (filter === "ALL" || (filter === "MISSING" ? !seeds[row.id] : seeds[row.id] === filter))).length;

  return <>
    <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên..." count={visibleCount}>
      <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Mọi Seed</option><option value="MISSING">Chưa có Seed</option>{[1,2,3,4,5,6,7].map((tier) => <option key={tier} value={`TIER_${tier}`}>Tier {tier}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="NAME">Tên A–Z</option><option value="SEED">Theo Seed</option><option value="MATCHES">Nhiều trận trước</option><option value="FORM_ASC">Phong độ thấp trước</option><option value="FORM_DESC">Phong độ cao trước</option></select>
      <ColumnVisibilityMenu columns={SEED_COLUMNS} hidden={columns.hidden} onToggle={columns.toggle} />
    </CollectionToolbar>
    <div className="seed-table-wrap"><table className="seed-table"><thead><tr><th>Thành viên</th><th>Seed trận này</th><th>Có thể bắt gôn</th>{columns.isVisible("matches") && <th>Số trận</th>}{columns.isVisible("wins") && <th>Hạng nhất</th>}{columns.isVisible("formScore") && <th>Phong độ</th>}</tr></thead><tbody>{ordered.map((row) => {
      const visible = (!search || normalizeSearch(row.name).includes(search)) && (filter === "ALL" || (filter === "MISSING" ? !seeds[row.id] : seeds[row.id] === filter));
      return <tr className={`${!seeds[row.id] ? "missing-seed" : ""} ${row.lowForm ? "low-form" : ""} ${visible ? "" : "filtered-out"}`} key={row.id}><td><MemberIdentity memberId={row.memberId} name={row.name} avatarVersion={row.avatarVersion} secondary={row.isGuest ? "Khách" : row.inferredMatchCount ? `${row.inferredMatchCount} trận suy luận` : null} compact /></td><td><select name={`seed_${row.id}`} value={seeds[row.id]} onChange={(event) => setSeeds((current) => ({ ...current, [row.id]: event.target.value }))} required><option value="" disabled>Chọn Seed</option>{[1,2,3,4,5,6,7].map((tier) => <option key={tier} value={`TIER_${tier}`}>Tier {tier}</option>)}</select></td><td className="seed-goalkeeper-cell"><label><input type="checkbox" name={`goalkeeper_${row.id}`} defaultChecked={row.goalkeeperAvailable} /> <span>Thủ môn</span></label></td>{columns.isVisible("matches") && <td>{row.matchCount}</td>}{columns.isVisible("wins") && <td>{row.winCount}</td>}{columns.isVisible("formScore") && <td><strong className={`form-score ${row.lowForm ? "low" : ""}`}>{Math.round(row.formScore / 100)}</strong></td>}</tr>;
    })}</tbody></table></div>
  </>;
}
