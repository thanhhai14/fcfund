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
  memberProfiles,
  members,
} from "@/db/schema";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { SeedEvaluationTable } from "@/components/seed-evaluation-table";
import { TeamDrawExperience, type TeamDrawData } from "@/components/team-draw-experience";
import { MemberIdentity } from "@/components/member-identity";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getMatchFormStats } from "@/lib/match-form-stats";
import { can } from "@/lib/permissions";
import { playerPositionsLabel, playerStrengthLabel } from "@/lib/player-profile";
import { isActiveSeedTier, SEED_LABELS, SEED_WEIGHT, type SeedTier } from "@/lib/seed-tier";
import {
  confirmMatchTeamsAction,
  createMatchTeamVersionAction,
  generateMatchTeamsAction,
  saveAndLockMatchSeedsAction,
  saveManualTeamsAction,
  unlockMatchSeedsAction,
} from "./actions";

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
    goalkeeperAvailable: matchParticipants.goalkeeperAvailable,
    seedEvaluatedAt: matchParticipants.seedEvaluatedAt,
    avatarUpdatedAt: avatars.updatedAt,
    desiredPositions: memberProfiles.desiredPositions,
    playerStrength: memberProfiles.playerStrength,
  }).from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .leftJoin(avatars, eq(matchParticipants.memberId, avatars.memberId))
    .leftJoin(memberProfiles, eq(matchParticipants.memberId, memberProfiles.memberId))
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
  const previousSeeds = new Map<string, SeedTier>();
  for (const row of previousSeedRows) {
    if (row.memberId && isActiveSeedTier(row.seedTier) && !previousSeeds.has(row.memberId)) {
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
  const effectiveSeed = (participant: (typeof participants)[number]) => isActiveSeedTier(participant.seedTier) ? participant.seedTier
    : (participant.memberId ? previousSeeds.get(participant.memberId) : undefined);
  const missingSeeds = participants.filter((participant) => !effectiveSeed(participant));
  const goalkeeperCount = participants.filter((participant) => participant.goalkeeperAvailable || (!participant.seedEvaluatedAt && participant.desiredPositions?.includes("GOALKEEPER"))).length;
  const missingRoleProfiles = participants.filter((participant) => !(participant.desiredPositions?.length) || !participant.playerStrength).length;
  const maxTeamCount = participants.length;
  const isDraftLocked = Boolean(draft?.tierLockedAt);
  const currentDraw: TeamDrawData | null = displayedVersion?.randomKey && teamRows.length ? {
    runId: displayedVersion.randomKey,
    teams: teamRows.map((team) => ({
      id: team.id,
      index: team.teamIndex,
      name: team.name,
      color: team.color ?? "#526170",
      goalkeeperCount: team.goalkeeperCount,
      members: teamMemberRows.filter((member) => member.teamId === team.id && member.participantId).map((member) => ({
        participantId: member.participantId!,
        memberId: member.memberId,
        name: member.displayNameSnapshot,
        seedTier: member.seedTierSnapshot,
        assignedAsGoalkeeper: member.assignedAsGoalkeeper,
        isLocked: member.isLocked,
      })),
    })),
  } : null;

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
        <article><small>Thủ môn</small><strong>{goalkeeperCount}</strong><span>{goalkeeperCount >= 2 ? "Đội thiếu sẽ mượn từ đội nghỉ" : "Cần ít nhất 2 người"}</span></article>
        <article><small>Hồ sơ chiến thuật</small><strong>{participants.length - missingRoleProfiles}/{participants.length}</strong><span>{missingRoleProfiles ? `${missingRoleProfiles} người dùng thiết lập trung lập` : "Đã đủ vị trí và thế mạnh"}</span></article>
        <article><small>Phiên bản hiển thị</small><strong>{displayedVersion ? `v${displayedVersion.version}` : "—"}</strong><span>{displayedVersion?.status === "DRAFT" ? "Bản nháp" : displayedVersion?.status === "CONFIRMED" ? "Đã xác nhận" : "Chưa tạo đội"}</span></article>
      </section>

      {canManageSeeds && (!confirmed || Boolean(draft)) && (!draft || !isDraftLocked) && (
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
                seedTier: isActiveSeedTier(participant.seedTier) ? participant.seedTier : null,
                suggestedSeedTier: participant.memberId ? previousSeeds.get(participant.memberId) ?? null : null,
                goalkeeperAvailable: participant.seedEvaluatedAt ? participant.goalkeeperAvailable : Boolean(participant.desiredPositions?.includes("GOALKEEPER")),
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

      {canManageSeeds && confirmed && !draft && (
        <section className="panel seed-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Bước 1</span><h2>Đánh giá Seed của trận</h2></div>
            <span className="validation-badge valid">Đội hình đã xác nhận</span>
          </div>
          <p className="panel-note">Seed và đội hình phiên bản {confirmed.version} đang được giữ nguyên. Chỉ tạo phiên bản mới khi bạn thực sự cần đánh giá lại và chia lại đội.</p>
          <MutationForm action={createMatchTeamVersionAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <SubmitButton><Icon name="plus" /> Tạo phiên bản mới</SubmitButton>
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
          {goalkeeperCount < 2 && <p className="team-warning"><Icon name="triangle-exclamation" /> Cần ít nhất 2 người được chọn làm thủ môn để có thể luân phiên cho mượn.</p>}
          {missingRoleProfiles > 0 && <p className="team-warning neutral"><Icon name="info" /> {missingRoleProfiles} người chưa khai báo đủ vị trí mong muốn và thế mạnh; hệ thống vẫn chia như cầu thủ linh hoạt/trung lập.</p>}
          <TeamDrawExperience
            action={generateMatchTeamsAction}
            matchId={match.id}
            matchLabel={`Trận ngày ${formatDate(match.playedOn)}`}
            participants={participants.map((participant) => ({
              participantId: participant.id,
              memberId: participant.memberId,
              name: participant.name,
              avatarVersion: participant.avatarUpdatedAt?.getTime() ?? null,
              seedTier: effectiveSeed(participant)!,
              goalkeeperAvailable: participant.goalkeeperAvailable,
              formScore: participant.memberId ? stats.get(participant.memberId)?.formScore ?? 5000 : 5000,
              desiredPositions: participant.desiredPositions ?? [],
              playerStrength: participant.playerStrength ?? null,
            }))}
            defaultTeamCount={Math.min(draft.teamCount, Math.max(2, maxTeamCount))}
            defaultLookbackMatches={draft.lookbackMatches}
            disabled={participants.length < 10}
            hasTeams={teamRows.length > 0}
            initialDraw={currentDraw}
          />
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
                  return <TeamCard key={team.id} team={team} rows={rows} allRows={teamMemberRows} allTeams={teamRows} editable showSeed={canViewSeeds} showForm={canViewFormReport} />;
                })}
              </div>
              <div className="team-draft-actions">
                <span>Di chuyển bằng ô chọn đội; khóa người để giữ nguyên khi chia lại.</span>
                <SubmitButton variant="secondary">Lưu điều chỉnh</SubmitButton>
              </div>
            </MutationForm>
          ) : (
            <div className="team-columns">
              {teamRows.map((team) => <TeamCard key={team.id} team={team} rows={teamMemberRows.filter((row) => row.teamId === team.id)} allRows={teamMemberRows} allTeams={teamRows} showSeed={canViewSeeds} showForm={canViewFormReport} />)}
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
          <div><strong>Cần xem lại đội hình?</strong><span>Trình chiếu lại kết quả bốc thăm của phiên bản {confirmed.version} mà không thay đổi dữ liệu.</span></div>
          {currentDraw && <TeamDrawExperience
            action={generateMatchTeamsAction}
            matchId={match.id}
            matchLabel={`Trận ngày ${formatDate(match.playedOn)}`}
            participants={participants.map((participant) => ({
              participantId: participant.id,
              memberId: participant.memberId,
              name: participant.name,
              avatarVersion: participant.avatarUpdatedAt?.getTime() ?? null,
              seedTier: effectiveSeed(participant)!,
              goalkeeperAvailable: participant.goalkeeperAvailable,
              formScore: participant.memberId ? stats.get(participant.memberId)?.formScore ?? 5000 : 5000,
              desiredPositions: participant.desiredPositions ?? [],
              playerStrength: participant.playerStrength ?? null,
            }))}
            defaultTeamCount={confirmed.teamCount}
            defaultLookbackMatches={confirmed.lookbackMatches}
            disabled
            hasTeams
            initialDraw={currentDraw}
            replayOnly
          />}
        </section>
      )}
    </>
  );
}

function TeamCard({
  team,
  rows,
  allRows,
  allTeams,
  editable = false,
  showSeed = true,
  showForm = true,
}: {
  team: typeof matchTeams.$inferSelect;
  rows: Array<typeof matchTeamMembers.$inferSelect & { avatarUpdatedAt: Date | null }>;
  allRows: Array<typeof matchTeamMembers.$inferSelect & { avatarUpdatedAt: Date | null }>;
  allTeams: Array<typeof matchTeams.$inferSelect>;
  editable?: boolean;
  showSeed?: boolean;
  showForm?: boolean;
}) {
  const goalkeeper = rows.find((row) => row.assignedAsGoalkeeper);
  const sharedGoalkeepers = allRows.filter((row) => row.assignedAsGoalkeeper && isActiveSeedTier(row.seedTierSnapshot));
  const borrowedGoalkeeper = !goalkeeper && sharedGoalkeepers.length ? {
    seedWeight: sharedGoalkeepers.reduce((sum, row) => sum + SEED_WEIGHT[row.seedTierSnapshot as SeedTier], 0) / sharedGoalkeepers.length,
    formScore: sharedGoalkeepers.reduce((sum, row) => sum + row.formScoreSnapshot, 0) / sharedGoalkeepers.length,
  } : null;
  const weightedMemberCount = rows.reduce((sum, row) => sum + (row.assignedAsGoalkeeper ? 0.15 : 1), 0) + (borrowedGoalkeeper ? 0.15 : 0);
  const weightedFormTotal = team.formScoreTotal + (borrowedGoalkeeper ? borrowedGoalkeeper.formScore * 0.15 : 0);
  const averageFormScore = weightedMemberCount ? Math.round(weightedFormTotal / weightedMemberCount) : 5000;
  const startingOutfield = rows.filter((row) => !row.assignedAsGoalkeeper && isActiveSeedTier(row.seedTierSnapshot))
    .sort((first, second) => SEED_WEIGHT[second.seedTierSnapshot as SeedTier] - SEED_WEIGHT[first.seedTierSnapshot as SeedTier]
      || second.formScoreSnapshot - first.formScoreSnapshot)
    .slice(0, 4);
  const lineupSkillScore = startingOutfield.reduce((sum, row) => sum + SEED_WEIGHT[row.seedTierSnapshot as SeedTier], 0)
    + (goalkeeper && isActiveSeedTier(goalkeeper.seedTierSnapshot) ? SEED_WEIGHT[goalkeeper.seedTierSnapshot] * 0.1 : borrowedGoalkeeper ? borrowedGoalkeeper.seedWeight * 0.1 : 0);
  const attackCount = rows.filter((row) => !row.assignedAsGoalkeeper && row.playerStrengthSnapshot === "ATTACK").length;
  const defenseCount = rows.filter((row) => !row.assignedAsGoalkeeper && row.playerStrengthSnapshot === "DEFENSE").length;
  const positionCounts = {
    DEFENDER: rows.filter((row) => !row.assignedAsGoalkeeper && row.desiredPositionsSnapshot.includes("DEFENDER")).length,
    MIDFIELDER: rows.filter((row) => !row.assignedAsGoalkeeper && row.desiredPositionsSnapshot.includes("MIDFIELDER")).length,
    FORWARD: rows.filter((row) => !row.assignedAsGoalkeeper && row.desiredPositionsSnapshot.includes("FORWARD")).length,
  };
  return (
    <article className="team-card" style={{ borderTopColor: team.color ?? undefined }}>
      <header>
        <div><span className="team-color" style={{ background: team.color ?? undefined }} /><h3>{team.name}</h3></div>
        <strong>{team.memberCount} người</strong>
      </header>
      <div className="team-metrics">
        <span><small>Thủ môn</small><b>{team.goalkeeperCount ? team.goalkeeperCount : "Mượn"}</b></span>
        <span><small>Seed đội hình 5</small><b>{Math.round(lineupSkillScore * 100) / 100}</b></span>
        <span><small>Điểm phong độ</small><b>{showForm ? formScore(averageFormScore) : "Ẩn"}</b></span>
        <span><small>Công / thủ</small><b>{attackCount} / {defenseCount}</b></span>
      </div>
      <div className="team-role-summary"><span>HV {positionCounts.DEFENDER}</span><span>TV {positionCounts.MIDFIELDER}</span><span>TĐ {positionCounts.FORWARD}</span></div>
      <div className="team-member-cards">
        {rows.map((row) => (
          <div key={row.id}>
            {showSeed ? <span className={`seed-chip ${row.seedTierSnapshot.toLowerCase()}`}>{SEED_LABELS[row.seedTierSnapshot]}{row.assignedAsGoalkeeper ? " · Thủ môn" : ""}</span> : <span className="seed-chip hidden-seed">Seed ẩn</span>}
            <MemberIdentity memberId={row.memberId} name={row.displayNameSnapshot} avatarVersion={row.avatarUpdatedAt} secondary={showForm ? `${playerPositionsLabel(row.desiredPositionsSnapshot)} · ${playerStrengthLabel(row.playerStrengthSnapshot)} · ${formScore(row.formScoreSnapshot)} phong độ` : null} compact />
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
