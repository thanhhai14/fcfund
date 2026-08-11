import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import {
  avatars,
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  members,
} from "@/db/schema";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { SeedEvaluationTable } from "@/components/seed-evaluation-table";
import { TeamCountField } from "@/components/team-count-field";
import { MemberIdentity } from "@/components/member-identity";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getMatchFormStats } from "@/lib/match-form-stats";
import { can } from "@/lib/permissions";
import {
  confirmMatchTeamsAction,
  generateMatchTeamsAction,
  saveAndLockMatchSeedsAction,
  saveManualTeamsAction,
  unlockMatchSeedsAction,
} from "./actions";

const SEED_LABELS = {
  TIER_1: "Tier 1",
  TIER_2: "Tier 2",
  TIER_3: "Tier 3",
  TIER_4: "Tier 4",
  GOALKEEPER: "Thủ môn",
} as const;

function formScore(value: number) {
  return `${Math.round(value / 100)} điểm`;
}

export default async function MatchTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const canViewTeams = await can(PERMISSIONS.MATCH_TEAMS_VIEW);
  if (!canViewTeams) redirect("/matches");
  const canManageTeams = await can(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const canManageSeeds = await can(PERMISSIONS.MATCH_SEED_MANAGE);
  const canViewSeeds = canManageSeeds || await can(PERMISSIONS.MATCH_SEED_VIEW);
  const canViewFormReport = canManageTeams || await can(PERMISSIONS.MATCH_FORM_REPORT_VIEW);
  const { id } = await params;

  const [match] = await db.select().from(matches).where(and(
    eq(matches.id, id),
    eq(matches.clubId, user.clubId),
    isNull(matches.deletedAt),
  )).limit(1);
  if (!match) notFound();

  const participantRows = await db.select({
    id: matchParticipants.id,
    memberId: matchParticipants.memberId,
    memberName: members.fullName,
    guestName: matchParticipants.guestName,
    seedTier: matchParticipants.seedTier,
    seedEvaluatedAt: matchParticipants.seedEvaluatedAt,
    avatarUpdatedAt: avatars.updatedAt,
  }).from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .leftJoin(avatars, eq(matchParticipants.memberId, avatars.memberId))
    .where(eq(matchParticipants.matchId, id));
  const participants = participantRows
    .map((row) => ({ ...row, name: row.memberName ?? row.guestName ?? "Khách" }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const memberIds = participants.flatMap((participant) => participant.memberId ? [participant.memberId] : []);
  const previousSeedRows = memberIds.length ? await db.select({
    memberId: matchParticipants.memberId,
    seedTier: matchParticipants.seedTier,
    playedOn: matches.playedOn,
    seedEvaluatedAt: matchParticipants.seedEvaluatedAt,
  }).from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(and(
      eq(matches.clubId, user.clubId),
      isNull(matches.deletedAt),
      lt(matches.playedOn, match.playedOn),
      inArray(matchParticipants.memberId, memberIds),
      isNotNull(matchParticipants.seedTier),
    ))
    .orderBy(desc(matches.playedOn), desc(matchParticipants.seedEvaluatedAt)) : [];
  const previousSeeds = new Map<string, NonNullable<(typeof previousSeedRows)[number]["seedTier"]>>();
  for (const row of previousSeedRows) {
    if (row.memberId && row.seedTier && !previousSeeds.has(row.memberId)) {
      previousSeeds.set(row.memberId, row.seedTier);
    }
  }

  const versions = await db.select().from(matchTeamVersions)
    .where(eq(matchTeamVersions.matchId, id))
    .orderBy(desc(matchTeamVersions.version));
  const draft = versions.find((version) => version.status === "DRAFT");
  const confirmed = versions.find((version) => version.status === "CONFIRMED");
  const displayedVersion = canManageTeams && draft ? draft : confirmed;
  const lookbackMatches = displayedVersion?.lookbackMatches ?? 10;
  const stats = await getMatchFormStats({
    clubId: user.clubId,
    playedOn: match.playedOn,
    memberIds,
    lookbackMatches,
  });

  const teamRows = displayedVersion ? await db.select().from(matchTeams)
    .where(eq(matchTeams.versionId, displayedVersion.id))
    .orderBy(matchTeams.teamIndex) : [];
  const teamMemberRows = displayedVersion ? await db.select({
    ...getTableColumns(matchTeamMembers),
    avatarUpdatedAt: avatars.updatedAt,
  }).from(matchTeamMembers)
    .leftJoin(avatars, eq(matchTeamMembers.memberId, avatars.memberId))
    .where(eq(matchTeamMembers.versionId, displayedVersion.id))
    .orderBy(matchTeamMembers.displayOrder) : [];
  const effectiveSeed = (participant: (typeof participants)[number]) => participant.seedTier
    ?? (participant.memberId ? previousSeeds.get(participant.memberId) : undefined);
  const missingSeeds = participants.filter((participant) => !effectiveSeed(participant));
  const goalkeeperCount = participants.filter((participant) => effectiveSeed(participant) === "GOALKEEPER").length;
  const maxTeamCount = participants.length;
  const isDraftLocked = Boolean(draft?.tierLockedAt);

  return (
    <>
      <PageHeader
        eyebrow={`Trận đấu · ${formatDate(match.playedOn)}`}
        title="Chia đội"
        description={`${participants.length} người tham gia · Seed được đánh giá riêng cho trận này`}
        action={<Link href="/matches" className="button secondary">← Trở lại trận đấu</Link>}
      />

      <section className="team-builder-summary">
        <article><small>Người tham gia</small><strong>{participants.length}</strong><span>{participants.length >= 10 ? "Đủ điều kiện tạo đội" : `Cần thêm ${10 - participants.length} người`}</span></article>
        <article><small>Thủ môn</small><strong>{goalkeeperCount}</strong><span>Được phân bổ đều giữa các đội</span></article>
        <article><small>Phiên bản hiển thị</small><strong>{displayedVersion ? `v${displayedVersion.version}` : "—"}</strong><span>{displayedVersion?.status === "DRAFT" ? "Bản nháp" : displayedVersion?.status === "CONFIRMED" ? "Đã xác nhận" : "Chưa tạo đội"}</span></article>
      </section>

      {canManageSeeds && (!draft || !isDraftLocked) && (
        <section className="panel seed-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Bước 1</span><h2>Đánh giá Seed của trận</h2></div>
            <span className={`validation-badge ${missingSeeds.length ? "warning" : "valid"}`}>
              {missingSeeds.length ? `Thiếu ${missingSeeds.length} Seed` : "Đã đủ Seed"}
            </span>
          </div>
          <p className="panel-note">Dropdown được chọn sẵn theo Seed gần nhất. Hãy đánh giá lại và lưu để xác nhận Seed cho trận hiện tại.</p>
          <MutationForm action={saveAndLockMatchSeedsAction} className="form-stack">
            <input type="hidden" name="matchId" value={match.id} />
            <SeedEvaluationTable rows={participants.map((participant) => {
              const stat = participant.memberId ? stats.get(participant.memberId) : undefined;
              return {
                id: participant.id,
                name: participant.name,
                memberId: participant.memberId,
                avatarVersion: participant.avatarUpdatedAt?.getTime() ?? null,
                isGuest: !participant.memberId,
                seedTier: participant.seedTier,
                suggestedSeedTier: participant.memberId ? previousSeeds.get(participant.memberId) ?? null : null,
                matchCount: stat?.matchCount ?? 0,
                winCount: stat?.winCount ?? 0,
                formScore: stat?.formScore ?? 5000,
                inferredMatchCount: stat?.inferredMatchCount ?? 0,
                lowForm: stat?.lowForm ?? false,
              };
            })} />
            <div className="form-actions"><SubmitButton><Icon name="shield" /> Lưu và khóa Seed</SubmitButton></div>
          </MutationForm>
        </section>
      )}

      {canManageSeeds && draft && isDraftLocked && (
        <section className="seed-lock-bar">
          <span><Icon name="shield" /><strong>Seed đã khóa</strong><small> Mở khóa sẽ xóa đội hình nháp hiện tại.</small></span>
          <MutationForm action={unlockMatchSeedsAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <SubmitButton variant="secondary">Mở khóa để đánh giá lại</SubmitButton>
          </MutationForm>
        </section>
      )}

      {canManageTeams && draft?.tierLockedAt && (
        <section className="panel team-config-panel">
          <div className="panel-heading"><div><span className="eyebrow">Bước 2</span><h2>Cấu hình và tạo đội</h2></div></div>
          {participants.length < 10 && <p className="team-warning"><Icon name="triangle-exclamation" /> Cần ít nhất 10 người tham gia để tạo đội.</p>}
          {goalkeeperCount < (draft.teamCount ?? 2) && <p className="team-warning"><Icon name="triangle-exclamation" /> Có thể có đội không có thủ môn nếu số thủ môn ít hơn số đội.</p>}
          <MutationForm action={generateMatchTeamsAction} className="team-config-form">
            <input type="hidden" name="matchId" value={match.id} />
            <TeamCountField memberCount={participants.length} defaultValue={Math.min(draft.teamCount, Math.max(2, maxTeamCount))} />
            <label>Số trận gần nhất<input name="lookbackMatches" type="number" min="1" max="30" defaultValue={draft.lookbackMatches} required /></label>
            <SubmitButton disabled={participants.length < 10}>{teamRows.length ? "Chia lại đội" : "Tạo đội cân bằng"}</SubmitButton>
          </MutationForm>
        </section>
      )}

      {displayedVersion && teamRows.length > 0 && (
        <section className="team-result-section">
          <div className="team-result-heading">
            <div><span className="eyebrow">{displayedVersion.status === "DRAFT" ? "Bước 3 · Bản nháp" : "Đội hình chính thức"}</span><h2>Đội hình phiên bản {displayedVersion.version}</h2></div>
            {displayedVersion.randomKey && <small title={displayedVersion.randomKey}>Random key: {displayedVersion.randomKey.slice(0, 8)}</small>}
          </div>

          {displayedVersion.status === "DRAFT" && canManageTeams ? (
            <MutationForm action={saveManualTeamsAction} className="form-stack">
              <input type="hidden" name="matchId" value={match.id} />
              <div className="team-columns">
                {teamRows.map((team) => {
                  const rows = teamMemberRows.filter((row) => row.teamId === team.id);
                  return <TeamCard key={team.id} team={team} rows={rows} allTeams={teamRows} editable showSeed={canViewSeeds} showForm={canViewFormReport} />;
                })}
              </div>
              <div className="team-draft-actions">
                <span>Di chuyển bằng ô chọn đội; khóa người để giữ nguyên khi chia lại.</span>
                <SubmitButton variant="secondary">Lưu điều chỉnh</SubmitButton>
              </div>
            </MutationForm>
          ) : (
            <div className="team-columns">
              {teamRows.map((team) => <TeamCard key={team.id} team={team} rows={teamMemberRows.filter((row) => row.teamId === team.id)} allTeams={teamRows} showSeed={canViewSeeds} showForm={canViewFormReport} />)}
            </div>
          )}

          {displayedVersion.status === "DRAFT" && canManageTeams && (
            <MutationForm action={confirmMatchTeamsAction} className="confirm-team-form">
              <input type="hidden" name="matchId" value={match.id} />
              <div><strong>Xác nhận bản cuối</strong><small>Sau khi xác nhận, thay đổi tiếp theo sẽ tạo phiên bản mới.</small></div>
              <SubmitButton>Xác nhận đội hình</SubmitButton>
            </MutationForm>
          )}
        </section>
      )}

      {!displayedVersion && !canManageTeams && <section className="panel empty-state"><span><Icon name="people-group" /></span><h3>Chưa có đội hình</h3><p>Admin chưa xác nhận đội hình cho trận này.</p></section>}

      {confirmed && canManageTeams && !draft && (
        <section className="new-version-callout">
          <div><strong>Cần thay đổi đội hình?</strong><span>Đánh giá lại Seed ở bảng phía trên để tạo phiên bản {confirmed.version + 1}.</span></div>
        </section>
      )}
    </>
  );
}

function TeamCard({
  team,
  rows,
  allTeams,
  editable = false,
  showSeed = true,
  showForm = true,
}: {
  team: typeof matchTeams.$inferSelect;
  rows: Array<typeof matchTeamMembers.$inferSelect & { avatarUpdatedAt: Date | null }>;
  allTeams: Array<typeof matchTeams.$inferSelect>;
  editable?: boolean;
  showSeed?: boolean;
  showForm?: boolean;
}) {
  const averageFormScore = team.memberCount ? Math.round(team.formScoreTotal / team.memberCount) : 5000;
  return (
    <article className="team-card" style={{ borderTopColor: team.color ?? undefined }}>
      <header>
        <div><span className="team-color" style={{ background: team.color ?? undefined }} /><h3>{team.name}</h3></div>
        <strong>{team.memberCount} người</strong>
      </header>
      <div className="team-metrics">
        <span><small>Thủ môn</small><b>{team.goalkeeperCount}</b></span>
        <span><small>Điểm Seed</small><b>{team.outfieldSkillScore}</b></span>
        <span><small>Điểm phong độ</small><b>{showForm ? formScore(averageFormScore) : "Ẩn"}</b></span>
      </div>
      <div className="team-member-cards">
        {rows.map((row) => (
          <div key={row.id}>
            {showSeed ? <span className={`seed-chip ${row.seedTierSnapshot.toLowerCase()}`}>{SEED_LABELS[row.seedTierSnapshot]}</span> : <span className="seed-chip hidden-seed">Seed ẩn</span>}
            <MemberIdentity memberId={row.memberId} name={row.displayNameSnapshot} avatarVersion={row.avatarUpdatedAt} secondary={showForm ? `${row.recentMatchCountSnapshot} trận · ${row.recentMatchCountSnapshot - row.recentLossCountSnapshot} hạng nhất · ${formScore(row.formScoreSnapshot)}${row.inferredMatchCountSnapshot ? ` · ${row.inferredMatchCountSnapshot} suy luận` : ""}` : null} compact />
            {editable && <span className="team-member-controls">
              <select name={`team_${row.id}`} defaultValue={row.teamId} aria-label={`Đội của ${row.displayNameSnapshot}`}>
                {allTeams.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
              </select>
              <label title="Giữ người này ở đội khi chia lại"><input type="checkbox" name={`locked_${row.id}`} defaultChecked={row.isLocked} /> Khóa</label>
            </span>}
          </div>
        ))}
      </div>
    </article>
  );
}
