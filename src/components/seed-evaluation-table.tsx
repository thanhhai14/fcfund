"use client";

import { useMemo, useState } from "react";
import { CollectionToolbar, normalizeSearch } from "./collection-controls";

type SeedRow = {
  id: string;
  name: string;
  isGuest: boolean;
  seedTier: string | null;
  matchCount: number;
  winCount: number;
  lossCount: number;
  lossRate: number | null;
};

const SEED_ORDER: Record<string, number> = { TIER_1: 1, TIER_2: 2, TIER_3: 3, TIER_4: 4, GOALKEEPER: 5 };

export function SeedEvaluationTable({ rows }: { rows: SeedRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME");
  const [seeds, setSeeds] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.id, row.seedTier ?? ""])));
  const ordered = useMemo(() => [...rows].sort((a, b) => {
    if (sort === "SEED") return (SEED_ORDER[seeds[a.id]] ?? 99) - (SEED_ORDER[seeds[b.id]] ?? 99) || a.name.localeCompare(b.name, "vi");
    if (sort === "MATCHES") return b.matchCount - a.matchCount || a.name.localeCompare(b.name, "vi");
    if (sort === "LOSS_RATE") return (b.lossRate ?? -1) - (a.lossRate ?? -1) || a.name.localeCompare(b.name, "vi");
    return a.name.localeCompare(b.name, "vi");
  }), [rows, seeds, sort]);
  const search = normalizeSearch(query);
  const visibleCount = ordered.filter((row) => (!search || normalizeSearch(row.name).includes(search)) && (filter === "ALL" || (filter === "MISSING" ? !seeds[row.id] : seeds[row.id] === filter))).length;

  return <>
    <CollectionToolbar query={query} onQueryChange={setQuery} placeholder="Tìm thành viên..." count={visibleCount}>
      <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Mọi Seed</option><option value="MISSING">Chưa có Seed</option><option value="TIER_1">Tier 1</option><option value="TIER_2">Tier 2</option><option value="TIER_3">Tier 3</option><option value="TIER_4">Tier 4</option><option value="GOALKEEPER">Thủ môn</option></select>
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="NAME">Tên A–Z</option><option value="SEED">Theo Seed</option><option value="MATCHES">Nhiều trận trước</option><option value="LOSS_RATE">Tỷ lệ thua cao</option></select>
    </CollectionToolbar>
    <div className="seed-table-wrap"><table className="seed-table"><thead><tr><th>Thành viên</th><th>Seed trận này</th><th>Trận gần đây</th><th>Thắng suy luận</th><th>Thua suy luận</th><th>Tỷ lệ thua</th></tr></thead><tbody>{ordered.map((row) => {
      const visible = (!search || normalizeSearch(row.name).includes(search)) && (filter === "ALL" || (filter === "MISSING" ? !seeds[row.id] : seeds[row.id] === filter));
      return <tr className={`${!seeds[row.id] ? "missing-seed" : ""} ${visible ? "" : "filtered-out"}`} key={row.id}><td><strong>{row.name}</strong>{row.isGuest && <small>Khách</small>}</td><td><select name={`seed_${row.id}`} value={seeds[row.id]} onChange={(event) => setSeeds((current) => ({ ...current, [row.id]: event.target.value }))} required><option value="" disabled>Chọn Seed</option><option value="TIER_1">Tier 1</option><option value="TIER_2">Tier 2</option><option value="TIER_3">Tier 3</option><option value="TIER_4">Tier 4</option><option value="GOALKEEPER">Thủ môn</option></select></td><td>{row.matchCount}</td><td>{row.winCount}</td><td>{row.lossCount}</td><td>{row.lossRate === null ? "Chưa có dữ liệu" : `${Math.round(row.lossRate / 100)}%`}</td></tr>;
    })}</tbody></table></div>
  </>;
}
