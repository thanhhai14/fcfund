"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatMoney, initials } from "@/lib/format";
import { Icon } from "./icon";

type ChargeView = {
  id: string;
  name: string;
  iconName: string;
  color: string | null;
  reportAsIcon: boolean;
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
  teamPlace: number | null;
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

function ChargeMark({ charge, showQuantity = false }: { charge: ChargeView; showQuantity?: boolean }) {
  const title = `${charge.name} · ${charge.quantity} lần · ${formatMoney(charge.amount)}`;
  if (charge.reportAsIcon) {
    return <span className="match-charge-mark icon-only" style={{ color: charge.color ?? undefined }} title={title} aria-label={title}><Icon name={charge.iconName} />{showQuantity && <small>×{charge.quantity}</small>}</span>;
  }
  return <span className="match-charge-mark text-only" title={title}>{charge.name}{showQuantity && <small>×{charge.quantity}</small>}</span>;
}

function resultLabel(place: number | null) {
  if (!place) return null;
  return `Hạng ${place} · ${place === 1 ? "Thắng" : "Thua"}`;
}

export function MatchDetailView({
  participants,
  teams,
  canViewSeed,
  canViewTeams,
  resultContent,
}: {
  participants: MatchParticipantView[];
  teams: MatchTeamView[];
  canViewSeed: boolean;
  canViewTeams: boolean;
  resultContent: ReactNode;
}) {
  const [section, setSection] = useState<"result" | "members">("result");
  const [mode, setMode] = useState<"list" | "teams">("list");
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.id ?? "");
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
      <div className="match-section-tabs" role="tablist" aria-label="Chi tiết trận đấu">
        <button type="button" role="tab" aria-selected={section === "result"} className={section === "result" ? "active" : ""} onClick={() => setSection("result")}>Kết quả</button>
        <button type="button" role="tab" aria-selected={section === "members"} className={section === "members" ? "active" : ""} onClick={() => setSection("members")}>Thành viên</button>
      </div>

      <div className="match-result-tab" hidden={section !== "result"}>{resultContent}</div>
      <div className="match-members-tab" hidden={section !== "members"}>
        <div className="match-view-switch" role="tablist" aria-label="Kiểu hiển thị thành viên">
          <button type="button" role="tab" aria-selected={mode === "list"} className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>Danh sách</button>
          {canViewTeams && <button type="button" role="tab" aria-selected={mode === "teams"} className={mode === "teams" ? "active" : ""} onClick={() => setMode("teams")}>Theo đội</button>}
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
                      <td>{row.teamName ? <span className="team-result-cell"><span className="team-tag" style={{ borderColor: row.teamColor ?? undefined, color: row.teamColor ?? undefined }}>{row.teamName}</span>{row.teamPlace && <small className={row.teamPlace === 1 ? "won" : "lost"}>{resultLabel(row.teamPlace)}</small>}</span> : <span className="table-muted">Chưa chia đội</span>}</td>
                      <td>{row.charges.length ? <span className="detail-charge-tags">{row.charges.map((charge) => <ChargeMark charge={charge} key={charge.id} />)}</span> : <span className="table-muted">Không phát sinh</span>}</td>
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
          <div className="match-detail-card-list">
            {visibleRows.map((row) => {
              const summary = chargeSummary(row.charges);
              return <article className="match-detail-member-card" key={row.id}>
                <header>
                  <span className="match-list-person"><b>{initials(row.name)}</b><strong>{row.name}</strong></span>
                  {row.teamName && <span className="team-tag" style={{ borderColor: row.teamColor ?? undefined, color: row.teamColor ?? undefined }}>{row.teamName}</span>}
                </header>
                <div className="match-member-card-meta">
                  {canViewSeed && <span><small>Seed</small><strong>{row.seedTier ? SEED_LABELS[row.seedTier] ?? row.seedTier : "Chưa xếp"}</strong></span>}
                  <span><small>Kết quả</small><strong className={row.teamPlace === 1 ? "won" : row.teamPlace ? "lost" : ""}>{resultLabel(row.teamPlace) ?? "Chưa có"}</strong></span>
                  <span><small>Số lần</small><strong>{summary.quantity || "—"}</strong></span>
                  <span><small>Thành tiền</small><strong>{formatMoney(summary.amount)}</strong></span>
                </div>
                <div className="detail-charge-tags">{row.charges.length ? row.charges.map((charge) => <ChargeMark charge={charge} showQuantity key={charge.id} />) : <span className="table-muted">Không phát sinh khoản thu</span>}</div>
              </article>;
            })}
            {!visibleRows.length && <p className="collection-empty">Không tìm thấy thành viên phù hợp.</p>}
            <footer className="match-card-list-total"><span>{visibleRows.length} / {participants.length} thành viên</span><strong>{totals.quantity} lần · {formatMoney(totals.amount)}</strong></footer>
          </div>
        </>
      ) : canViewTeams ? (
        <div className="match-team-browser">
          {!!teams.length && <div className="match-team-tabs" role="tablist" aria-label="Chọn đội">
            {teams.map((team) => <button type="button" role="tab" aria-selected={(activeTeamId || teams[0]?.id) === team.id} className={(activeTeamId || teams[0]?.id) === team.id ? "active" : ""} key={team.id} onClick={() => setActiveTeamId(team.id)}>{team.name}</button>)}
          </div>}
          <div className="match-team-view-grid">
          {teams.filter((team) => team.id === (activeTeamId || teams[0]?.id)).map((team) => {
            const members = participants.filter((participant) => participant.teamId === team.id);
            const teamTotals = chargeSummary(members.flatMap((member) => member.charges));
            return (
              <article className="match-team-view-card" style={{ borderTopColor: team.color ?? undefined }} key={team.id}>
                <header><div><h2>{team.name}</h2><span className={team.place === 1 ? "won" : team.place ? "lost" : ""}>{team.place ? `${resultLabel(team.place)} · ` : ""}{members.length} người</span></div><Icon name="people-group" /></header>
                <div className="match-team-view-members">
                  {members.map((member) => (
                    <div key={member.id}>
                      <b className="member-mini-avatar">{initials(member.name)}</b>
                      <span><strong>{member.name}</strong>{canViewSeed && <small>{member.seedTier ? SEED_LABELS[member.seedTier] ?? member.seedTier : "Chưa có Seed"}</small>}</span>
                      <span className="team-member-charge">{member.charges.map((charge) => <ChargeMark charge={charge} showQuantity key={charge.id} />)}{!member.charges.length && <small>—</small>}</span>
                    </div>
                  ))}
                </div>
                <footer><span>Tổng: {teamTotals.quantity} lần</span><strong>{formatMoney(teamTotals.amount)}</strong></footer>
              </article>
            );
          })}
          {!teams.length && <div className="panel empty-state match-team-empty"><span><Icon name="people-group" /></span><h3>Chưa có đội hình</h3><p>Trận này chưa có đội hình được xác nhận.</p></div>}
          </div>
        </div>
      ) : null}</div>
    </section>
  );
}
