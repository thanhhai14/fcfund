"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { Icon } from "./icon";
import { ColumnVisibilityMenu, useColumnVisibility, type CollectionColumn } from "./collection-controls";
import { MemberIdentity } from "./member-identity";
import { MatchMemberReplacement } from "./match-member-replacement";
import type { MemberSelectOption } from "./searchable-member-select";

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
  teamMemberId: string | null;
  memberId: string | null;
  name: string;
  avatarVersion: number | null;
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
  canManageTeams,
  matchId,
  confirmedVersionId,
  replacementMembers,
  resultContent,
}: {
  participants: MatchParticipantView[];
  teams: MatchTeamView[];
  canViewSeed: boolean;
  canViewTeams: boolean;
  canManageTeams: boolean;
  matchId: string;
  confirmedVersionId: string | null;
  replacementMembers: MemberSelectOption[];
  resultContent: ReactNode;
}) {
  const [section, setSection] = useState<"result" | "members">("result");
  const [mode, setMode] = useState<"list" | "teams">("list");
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.id ?? "");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [descending, setDescending] = useState(false);
  const [query, setQuery] = useState("");
  const columnDefinitions = useMemo<CollectionColumn[]>(() => [
    { id: "member", label: "Thành viên", required: true },
    ...(canViewSeed ? [{ id: "seed", label: "Seed" }] : []),
    { id: "team", label: "Đội" }, { id: "charges", label: "Khoản thu" },
    { id: "quantity", label: "Số lần" }, { id: "amount", label: "Thành tiền" },
  ], [canViewSeed]);
  const columns = useColumnVisibility("fcfund:match-detail:columns", columnDefinitions);
  const visibleColumnCount = columnDefinitions.filter((column) => columns.isVisible(column.id)).length;

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
            <ColumnVisibilityMenu columns={columnDefinitions} hidden={columns.hidden} onToggle={columns.toggle} />
          </div>
          <div className="match-detail-table-wrap">
            <table className="match-detail-table">
              <thead><tr><th>Thành viên</th>{canViewSeed && columns.isVisible("seed") && <th>Seed</th>}{columns.isVisible("team") && <th>Đội</th>}{columns.isVisible("charges") && <th>Khoản thu</th>}{columns.isVisible("quantity") && <th>Số lần</th>}{columns.isVisible("amount") && <th>Thành tiền</th>}</tr></thead>
              <tbody>
                {visibleRows.map((row) => {
                  const summary = chargeSummary(row.charges);
                  return (
                    <tr key={row.id}>
                      <td><MemberIdentity memberId={row.memberId} name={row.name} avatarVersion={row.avatarVersion} /></td>
                      {canViewSeed && columns.isVisible("seed") && <td>{row.seedTier ? <span className={`seed-chip ${row.seedTier.toLowerCase()}`}>{SEED_LABELS[row.seedTier] ?? row.seedTier}</span> : <span className="table-muted">Chưa xếp</span>}</td>}
                      {columns.isVisible("team") && <td>{row.teamName ? <span className="team-result-cell"><span className="team-tag" style={{ borderColor: row.teamColor ?? undefined, color: row.teamColor ?? undefined }}>{row.teamName}</span>{row.teamPlace && <small className={row.teamPlace === 1 ? "won" : "lost"}>{resultLabel(row.teamPlace)}</small>}</span> : <span className="table-muted">Chưa chia đội</span>}</td>}
                      {columns.isVisible("charges") && <td>{row.charges.length ? <span className="detail-charge-tags">{row.charges.map((charge) => <ChargeMark charge={charge} key={charge.id} />)}</span> : <span className="table-muted">Không phát sinh</span>}</td>}
                      {columns.isVisible("quantity") && <td className="numeric-cell">{summary.quantity ? `×${summary.quantity}` : "—"}</td>}
                      {columns.isVisible("amount") && <td className="numeric-cell"><strong>{formatMoney(summary.amount)}</strong></td>}
                    </tr>
                  );
                })}
                {!visibleRows.length && <tr><td colSpan={visibleColumnCount} className="no-table-results">Không tìm thấy thành viên phù hợp.</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={visibleColumnCount}>Hiển thị {visibleRows.length} / {participants.length} thành viên · Tổng {totals.quantity} lần · {formatMoney(totals.amount)}</td></tr></tfoot>
            </table>
          </div>
          <div className="match-detail-card-list">
            {visibleRows.map((row) => {
              const summary = chargeSummary(row.charges);
              return <article className="match-detail-member-card" key={row.id}>
                <header>
                  <MemberIdentity memberId={row.memberId} name={row.name} avatarVersion={row.avatarVersion} />
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
          {teams.map((team) => {
            const members = participants.filter((participant) => participant.teamId === team.id);
            const teamTotals = chargeSummary(members.flatMap((member) => member.charges));
            return (
              <article
                className={`match-team-view-card ${(activeTeamId || teams[0]?.id) === team.id ? "active" : "inactive"}`}
                style={{ borderTopColor: team.color ?? undefined }}
                key={team.id}
              >
                <header><div><h2>{team.name}</h2><span className={team.place === 1 ? "won" : team.place ? "lost" : ""}>{team.place ? `${resultLabel(team.place)} · ` : ""}{members.length} người</span></div><Icon name="people-group" /></header>
                <div className="match-team-view-members">
                  {members.map((member) => (
                    <div key={member.id}>
                      <MemberIdentity memberId={member.memberId} name={member.name} avatarVersion={member.avatarVersion} secondary={canViewSeed ? member.seedTier ? SEED_LABELS[member.seedTier] ?? member.seedTier : "Chưa có Seed" : null} compact />
                      <span className="team-member-charge">{member.charges.map((charge) => <ChargeMark charge={charge} showQuantity key={charge.id} />)}{!member.charges.length && <small>—</small>}</span>
                      {canManageTeams && confirmedVersionId && member.teamMemberId && <MatchMemberReplacement
                        matchId={matchId}
                        versionId={confirmedVersionId}
                        teamMemberId={member.teamMemberId}
                        current={{ memberId: member.memberId, name: member.name, avatarVersion: member.avatarVersion }}
                        teamName={team.name}
                        teamPlace={team.place}
                        chargeQuantity={chargeSummary(member.charges).quantity}
                        chargeAmount={chargeSummary(member.charges).amount}
                        options={replacementMembers}
                      />}
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
