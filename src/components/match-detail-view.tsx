"use client";

import { useMemo, useState } from "react";
import { formatMoney, initials } from "@/lib/format";
import { Icon } from "./icon";

type ChargeView = {
  id: string;
  name: string;
  iconName: string;
  color: string | null;
  quantity: number;
  amount: number;
};

export type MatchParticipantView = {
  id: string;
  name: string;
  seedTier: string | null;
  teamId: string | null;
  teamName: string | null;
  teamIndex: number | null;
  teamColor: string | null;
  charges: ChargeView[];
};

export type MatchTeamView = {
  id: string;
  name: string;
  index: number;
  color: string | null;
  place: number | null;
};

const SEED_LABELS: Record<string, string> = {
  TIER_1: "Tier 1",
  TIER_2: "Tier 2",
  TIER_3: "Tier 3",
  TIER_4: "Tier 4",
  GOALKEEPER: "Thủ môn",
};

type SortMode = "name" | "team" | "charge";

function firstChargeName(row: MatchParticipantView) {
  return [...row.charges].sort((a, b) => a.name.localeCompare(b.name, "vi"))[0]?.name ?? "zzz";
}

function chargeSummary(charges: ChargeView[]) {
  return {
    quantity: charges.reduce((sum, charge) => sum + charge.quantity, 0),
    amount: charges.reduce((sum, charge) => sum + charge.amount, 0),
  };
}

export function MatchDetailView({
  participants,
  teams,
  canViewSeed,
  canViewTeams,
}: {
  participants: MatchParticipantView[];
  teams: MatchTeamView[];
  canViewSeed: boolean;
  canViewTeams: boolean;
}) {
  const [mode, setMode] = useState<"list" | "teams">("list");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [descending, setDescending] = useState(false);
  const [query, setQuery] = useState("");

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    const rows = participants.filter((row) => !normalizedQuery || row.name.toLocaleLowerCase("vi").includes(normalizedQuery));
    rows.sort((first, second) => {
      let comparison = 0;
      if (sortMode === "team") comparison = (first.teamIndex ?? 999) - (second.teamIndex ?? 999)
        || first.name.localeCompare(second.name, "vi");
      else if (sortMode === "charge") comparison = firstChargeName(first).localeCompare(firstChargeName(second), "vi")
        || first.name.localeCompare(second.name, "vi");
      else comparison = first.name.localeCompare(second.name, "vi");
      return descending ? -comparison : comparison;
    });
    return rows;
  }, [descending, participants, query, sortMode]);

  const totals = chargeSummary(participants.flatMap((participant) => participant.charges));

  function selectSort(next: SortMode) {
    if (sortMode === next) setDescending((current) => !current);
    else {
      setSortMode(next);
      setDescending(false);
    }
  }

  return (
    <section className="match-detail-content">
      <div className="match-view-switch" role="tablist" aria-label="Kiểu hiển thị trận đấu">
        <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>Danh sách</button>
        {canViewTeams && <button type="button" className={mode === "teams" ? "active" : ""} onClick={() => setMode("teams")}>Theo đội</button>}
      </div>

      {mode === "list" ? (
        <>
          <div className="match-list-toolbar">
            <label className="match-search"><Icon name="user" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm thành viên..." /></label>
            <span>Sắp xếp</span>
            <div className="match-sort-buttons">
              <button type="button" className={sortMode === "name" ? "active" : ""} onClick={() => selectSort("name")}><Icon name="user" /> Tên {sortMode === "name" && (descending ? "↓" : "↑")}</button>
              <button type="button" className={sortMode === "team" ? "active" : ""} onClick={() => selectSort("team")}><Icon name="people-group" /> Đội {sortMode === "team" && (descending ? "↓" : "↑")}</button>
              <button type="button" className={sortMode === "charge" ? "active" : ""} onClick={() => selectSort("charge")}><Icon name="medal" /> Loại thu {sortMode === "charge" && (descending ? "↓" : "↑")}</button>
            </div>
          </div>
          <div className="match-detail-table-wrap">
            <table className="match-detail-table">
              <thead><tr><th>Thành viên</th>{canViewSeed && <th>Seed</th>}<th>Đội</th><th>Khoản thu</th><th>Số lần</th><th>Thành tiền</th></tr></thead>
              <tbody>
                {visibleRows.map((row) => {
                  const summary = chargeSummary(row.charges);
                  return (
                    <tr key={row.id}>
                      <td><span className="match-list-person"><b>{initials(row.name)}</b><strong>{row.name}</strong></span></td>
                      {canViewSeed && <td>{row.seedTier ? <span className={`seed-chip ${row.seedTier.toLowerCase()}`}>{SEED_LABELS[row.seedTier] ?? row.seedTier}</span> : <span className="table-muted">Chưa xếp</span>}</td>}
                      <td>{row.teamName ? <span className="team-tag" style={{ borderColor: row.teamColor ?? undefined, color: row.teamColor ?? undefined }}>{row.teamName}</span> : <span className="table-muted">Chưa chia đội</span>}</td>
                      <td>{row.charges.length ? <span className="detail-charge-tags">{row.charges.map((charge) => <span key={charge.id} style={{ color: charge.color ?? undefined }}><Icon name={charge.iconName} /> {charge.name}</span>)}</span> : <span className="table-muted">Không phát sinh</span>}</td>
                      <td className="numeric-cell">{summary.quantity ? `×${summary.quantity}` : "—"}</td>
                      <td className="numeric-cell"><strong>{formatMoney(summary.amount)}</strong></td>
                    </tr>
                  );
                })}
                {!visibleRows.length && <tr><td colSpan={canViewSeed ? 6 : 5} className="no-table-results">Không tìm thấy thành viên phù hợp.</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={canViewSeed ? 3 : 2}>Hiển thị {visibleRows.length} / {participants.length} thành viên</td><td>Tổng cộng</td><td className="numeric-cell">{totals.quantity} lần</td><td className="numeric-cell"><strong>{formatMoney(totals.amount)}</strong></td></tr></tfoot>
            </table>
          </div>
        </>
      ) : canViewTeams ? (
        <div className="match-team-view-grid">
          {teams.map((team) => {
            const members = participants.filter((participant) => participant.teamId === team.id);
            const teamTotals = chargeSummary(members.flatMap((member) => member.charges));
            return (
              <article className="match-team-view-card" style={{ borderTopColor: team.color ?? undefined }} key={team.id}>
                <header><div><h2>{team.name}</h2><span>{team.place ? `Hạng ${team.place} · ` : ""}{members.length} người</span></div><Icon name="people-group" /></header>
                <div className="match-team-view-members">
                  {members.map((member) => (
                    <div key={member.id}>
                      <b className="member-mini-avatar">{initials(member.name)}</b>
                      <span><strong>{member.name}</strong>{canViewSeed && <small>{member.seedTier ? SEED_LABELS[member.seedTier] ?? member.seedTier : "Chưa có Seed"}</small>}</span>
                      <span className="team-member-charge">{member.charges.map((charge) => <em key={charge.id} style={{ color: charge.color ?? undefined }} title={`${charge.name} · ${formatMoney(charge.amount)}`}><Icon name={charge.iconName} /> ×{charge.quantity}</em>)}{!member.charges.length && <small>—</small>}</span>
                    </div>
                  ))}
                </div>
                <footer><span>Tổng: {teamTotals.quantity} lần</span><strong>{formatMoney(teamTotals.amount)}</strong></footer>
              </article>
            );
          })}
          {!teams.length && <div className="panel empty-state match-team-empty"><span><Icon name="people-group" /></span><h3>Chưa có đội hình</h3><p>Trận này chưa có đội hình được xác nhận.</p></div>}
        </div>
      ) : null}
    </section>
  );
}
