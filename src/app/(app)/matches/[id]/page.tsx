import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MatchDetailView, type MatchParticipantView, type MatchTeamView } from "@/components/match-detail-view";
import { CopyPublicLinkButton } from "@/components/copy-public-link-button";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import {
  chargeTypes,
  avatars,
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberCharges,
  members,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { managePublicLineupAction, recordMatchResultAction } from "./actions";

export const metadata = { title: "Chi tiết trận đấu" };

function getPlacements(metrics: unknown): Record<string, number> {
  if (typeof metrics === "string") {
    try {
      return getPlacements(JSON.parse(metrics));
    } catch {
      return {};
    }
  }
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return {};
  const placements = (metrics as Record<string, unknown>).placements;
  if (!placements || typeof placements !== "object" || Array.isArray(placements)) return {};

  return Object.fromEntries(Object.entries(placements).flatMap(([name, place]) =>
    typeof place === "number" && Number.isFinite(place) ? [[name, place]] : [],
  ));
}

function getMetricNumberRecord(metrics: unknown, key: string): Record<string, number> {
  if (typeof metrics === "string") {
    try {
      return getMetricNumberRecord(JSON.parse(metrics), key);
    } catch {
      return {};
    }
  }
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return {};
  const record = (metrics as Record<string, unknown>)[key];
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).flatMap(([name, value]) =>
    typeof value === "number" && Number.isFinite(value) ? [[name, value]] : [],
  ));
}

function getMetricString(metrics: unknown, key: string) {
  if (typeof metrics === "string") {
    try {
      return getMetricString(JSON.parse(metrics), key);
    } catch {
      return null;
    }
  }
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const value = (metrics as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!(await can(PERMISSIONS.MATCHES_VIEW))) redirect("/dashboard");
  const canManageMatches = await can(PERMISSIONS.MATCHES_MANAGE);
  const canViewTeams = await can(PERMISSIONS.MATCH_TEAMS_VIEW);
  const canManageTeams = await can(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const canViewSeed = await can(PERMISSIONS.MATCH_SEED_VIEW) || await can(PERMISSIONS.MATCH_SEED_MANAGE);
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
    avatarUpdatedAt: avatars.updatedAt,
  }).from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .leftJoin(avatars, eq(matchParticipants.memberId, avatars.memberId))
    .where(eq(matchParticipants.matchId, id));

  const chargeRows = await db.select({
    id: memberCharges.id,
    memberId: memberCharges.memberId,
    chargeTypeId: memberCharges.chargeTypeId,
    isLossPenalty: memberCharges.isLossPenaltySnapshot,
    name: chargeTypes.name,
    iconName: chargeTypes.iconName,
    color: chargeTypes.color,
    reportAsIcon: chargeTypes.reportAsIcon,
    quantity: memberCharges.quantity,
    unitAmount: memberCharges.unitAmount,
    amount: memberCharges.totalAmount,
  }).from(memberCharges)
    .innerJoin(chargeTypes, eq(memberCharges.chargeTypeId, chargeTypes.id))
    .where(and(
      eq(memberCharges.clubId, user.clubId),
      eq(memberCharges.matchId, id),
      isNull(memberCharges.deletedAt),
    ));

  const [confirmedVersion] = canViewTeams ? await db.select().from(matchTeamVersions).where(and(
    eq(matchTeamVersions.matchId, id),
    eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1) : [];

  const teamRows = confirmedVersion ? await db.select().from(matchTeams)
    .where(eq(matchTeams.versionId, confirmedVersion.id))
    .orderBy(matchTeams.teamIndex) : [];
  const teamMemberRows = confirmedVersion ? await db.select({
    id: matchTeamMembers.id,
    participantId: matchTeamMembers.participantId,
    memberId: matchTeamMembers.memberId,
    teamId: matchTeamMembers.teamId,
    assignedAsGoalkeeper: matchTeamMembers.assignedAsGoalkeeper,
  }).from(matchTeamMembers).where(eq(matchTeamMembers.versionId, confirmedVersion.id)) : [];
  const assignedMemberIds = new Set(teamMemberRows.flatMap((row) => row.memberId ? [row.memberId] : []));
  const replacementMemberRows = canManageTeams && confirmedVersion ? await db.select({
    id: members.id,
    name: members.fullName,
    code: members.code,
    phone: members.phone,
    avatarUpdatedAt: avatars.updatedAt,
  }).from(members)
    .leftJoin(avatars, eq(members.id, avatars.memberId))
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE")))
    .orderBy(asc(members.fullName)) : [];
  const penaltyTypes = canManageTeams && confirmedVersion ? await db.select({
    id: chargeTypes.id,
    name: chargeTypes.name,
    iconName: chargeTypes.iconName,
    defaultAmount: chargeTypes.defaultAmount,
  }).from(chargeTypes).where(and(
    eq(chargeTypes.clubId, user.clubId),
    eq(chargeTypes.calculation, "OCCURRENCE"),
    eq(chargeTypes.isLossPenalty, true),
    eq(chargeTypes.isActive, true),
  )).orderBy(chargeTypes.name) : [];

  const chargesByMember = new Map<string, typeof chargeRows>();
  for (const charge of chargeRows) {
    const current = chargesByMember.get(charge.memberId) ?? [];
    current.push(charge);
    chargesByMember.set(charge.memberId, current);
  }
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const participantTeam = new Map(teamMemberRows.flatMap((row) => row.participantId ? [[row.participantId, row]] : []));
  const placements = getPlacements(confirmedVersion?.metrics);
  const storedPenaltyQuantities = getMetricNumberRecord(confirmedVersion?.metrics, "penaltyQuantities");
  const selectedPenaltyTypeId = getMetricString(confirmedVersion?.metrics, "resultChargeTypeId")
    ?? penaltyTypes[0]?.id;
  const memberIdsByTeam = new Map(teamRows.map((team) => [team.id, new Set(teamMemberRows.flatMap((row) => row.teamId === team.id && row.memberId ? [row.memberId] : []))]));
  const penaltyQuantityByTeam = new Map(teamRows.map((team) => {
    const stored = storedPenaltyQuantities[team.name];
    if (Number.isInteger(stored) && stored >= 0) return [team.id, stored] as const;
    const memberIds = memberIdsByTeam.get(team.id) ?? new Set<string>();
    const existing = chargeRows
      .filter((charge) => memberIds.has(charge.memberId)
        && charge.isLossPenalty
        && (!selectedPenaltyTypeId || charge.chargeTypeId === selectedPenaltyTypeId))
      .map((charge) => charge.quantity);
    const unique = [...new Set(existing)];
    const place = placements[team.name];
    return [team.id, unique.length === 1 ? unique[0] : place ? Math.max(0, place - 1) : 0] as const;
  }));
  const hasRecordedResult = teamRows.length > 0 && teamRows.every((team) => placements[team.name]);
  const selectedPenaltyType = penaltyTypes.find((type) => type.id === selectedPenaltyTypeId) ?? penaltyTypes[0];
  const historicalPenaltyUnitAmount = chargeRows.find((charge) => charge.chargeTypeId === selectedPenaltyTypeId && charge.isLossPenalty)?.unitAmount ?? 0;

  const participants: MatchParticipantView[] = participantRows.map((row) => {
    const teamMembership = participantTeam.get(row.id);
    const team = teamById.get(teamMembership?.teamId ?? "");
    return {
      id: row.id,
      teamMemberId: teamMembership?.id ?? null,
      memberId: row.memberId,
      name: row.memberName ?? row.guestName ?? "Khách",
      avatarVersion: row.avatarUpdatedAt?.getTime() ?? null,
      seedTier: canViewSeed ? row.seedTier : null,
      assignedAsGoalkeeper: teamMembership?.assignedAsGoalkeeper ?? false,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      teamIndex: team?.teamIndex ?? null,
      teamColor: team?.color ?? null,
      teamPlace: team ? placements[team.name] ?? null : null,
      charges: row.memberId ? (chargesByMember.get(row.memberId) ?? []).map((charge) => ({
        id: charge.id,
        name: charge.name,
        iconName: charge.iconName,
        color: charge.color,
        reportAsIcon: charge.reportAsIcon,
        quantity: charge.quantity,
        amount: charge.amount,
      })) : [],
    };
  });
  const teams: MatchTeamView[] = teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    index: team.teamIndex,
    color: team.color,
    place: placements[team.name] ?? null,
    goalkeeperCount: team.goalkeeperCount,
  }));
  const totalAmount = chargeRows.reduce((sum, charge) => sum + charge.amount, 0);
  const resultContent = canManageTeams && confirmedVersion && teamRows.length > 0 ? (
    <section className="panel match-result-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">{hasRecordedResult ? "Kết quả đã ghi nhận" : "Sau khi trận kết thúc"}</span><h2>Nhập kết quả trận</h2></div>
        {hasRecordedResult && <span className="validation-badge valid"><Icon name="check" /> Đã có kết quả</span>}
      </div>
      <p className="panel-note">Chọn thứ hạng và nhập số lần phạt riêng cho từng đội. Thứ hạng dùng tính kết quả và phong độ; số lần phạt chỉ dùng tạo khoản phải thu.</p>
      {penaltyTypes.length ? (
        <MutationForm action={recordMatchResultAction} className="match-result-form">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="versionId" value={confirmedVersion.id} />
          <label className="result-charge-type">Loại thu phạt
            <select name="chargeTypeId" defaultValue={selectedPenaltyTypeId} required>
              {penaltyTypes.map((type) => <option key={type.id} value={type.id}>{type.name} · {formatMoney(type.defaultAmount)}/lần</option>)}
            </select>
          </label>
          <div className="match-result-teams">
            {teamRows.map((team) => (
              <div className="match-result-team" key={team.id} style={{ borderLeftColor: team.color ?? undefined }}>
                <span><Icon name="people-group" /><b>{team.name}</b><small>{team.memberCount} người</small></span>
                <div className="match-result-team-inputs">
                  <label>Thứ hạng<select name={`place:${team.id}`} defaultValue={placements[team.name] ?? ""} required>
                    <option value="" disabled>Chọn hạng</option>
                    {teamRows.map((_, index) => <option key={index + 1} value={index + 1}>Hạng {index + 1}</option>)}
                  </select></label>
                  <label>Số lần phạt<input name={`penaltyQuantity:${team.id}`} type="number" min="0" max="99" step="1" defaultValue={penaltyQuantityByTeam.get(team.id) ?? 0} required /></label>
                </div>
              </div>
            ))}
          </div>
          <div className="match-result-footer"><span>Ghi lại kết quả sẽ thay thế khoản phạt được sinh từ kết quả trước.</span><SubmitButton>{hasRecordedResult ? "Cập nhật kết quả" : "Xác nhận kết quả"}</SubmitButton></div>
        </MutationForm>
      ) : (
        <p className="team-warning"><Icon name="triangle-exclamation" /> Chưa có loại thu theo lần nào được đánh dấu là khoản phạt. Hãy cấu hình trong Cài đặt trước.</p>
      )}
    </section>
  ) : (
    <section className="match-result-readonly">
      <div className="panel-heading"><div><span className="eyebrow">Kết quả trận đấu</span><h2>{hasRecordedResult ? "Thứ hạng các đội" : "Chưa ghi nhận kết quả"}</h2></div></div>
      {hasRecordedResult ? <div className="match-result-summary-grid">{teams.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((team) => <article key={team.id} style={{ borderTopColor: team.color ?? undefined }}><small>Hạng {team.place}</small><strong>{team.name}</strong><span>{team.place === 1 ? "Thắng" : "Thua"} · Phạt {penaltyQuantityByTeam.get(team.id) ?? 0} lần</span></article>)}</div> : <p className="match-result-empty">Kết quả sẽ xuất hiện tại đây sau khi quản trị viên nhập thứ hạng trận đấu.</p>}
    </section>
  );

  return (
    <>
      <PageHeader
        eyebrow="Chi tiết trận đấu"
        title={`Trận ngày ${formatDate(match.playedOn)}`}
        description={match.note || "Danh sách người tham gia, đội hình và khoản thu phát sinh"}
        action={
          <div className="match-detail-actions">
            <Link href="/matches" className="button secondary">← Danh sách trận</Link>
            {canViewTeams && <Link href={`/matches/${match.id}/teams`} className="button">{canManageTeams ? "Tạo / chỉnh đội" : "Xem đội hình"}</Link>}
          </div>
        }
      />

      <section className="match-detail-summary">
        <article><small>Người tham gia</small><strong>{participants.length}</strong><span>thành viên</span></article>
        <article><small>Số đội</small><strong>{teams.length || "—"}</strong><span>{teams.length ? `phiên bản ${confirmedVersion?.version}` : "chưa xác nhận"}</span></article>
        <article><small>Khoản thu</small><strong>{formatMoney(totalAmount)}</strong><span>{chargeRows.reduce((sum, charge) => sum + charge.quantity, 0)} lần phát sinh</span></article>
        <article><small>Trạng thái</small><strong className="match-status-label">{confirmedVersion ? "Đã xác nhận" : "Chưa xác nhận"}</strong><span>đội hình trận đấu</span></article>
      </section>

      {canManageTeams && (
        <section className="panel public-lineup-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Chia sẻ đội hình</span><h2>Trang xem công khai</h2></div>
            <span className={`validation-badge ${match.publicLineupEnabled ? "valid" : "warning"}`}>{match.publicLineupEnabled ? "Đang công khai" : "Đang tắt"}</span>
          </div>
          <p className="panel-note">Chỉ công khai ngày thi đấu, tên đội, avatar, tên và số áo trong đội hình cuối đã xác nhận.</p>
          <div className="public-lineup-actions">
            {match.publicLineupEnabled && match.publicLineupToken && <>
              <Link href={`/lineup/${match.publicLineupToken}`} target="_blank" className="button">Xem trang công khai</Link>
              <CopyPublicLinkButton path={`/lineup/${match.publicLineupToken}`} />
            </>}
            <MutationForm action={managePublicLineupAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="mode" value={match.publicLineupEnabled ? "disable" : "publish"} />
              <SubmitButton variant={match.publicLineupEnabled ? "danger" : "primary"}>{match.publicLineupEnabled ? "Tắt công khai" : "Công khai đội hình"}</SubmitButton>
            </MutationForm>
            {match.publicLineupEnabled && <MutationForm action={managePublicLineupAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="mode" value="rotate" />
              <SubmitButton variant="secondary">Tạo lại liên kết</SubmitButton>
            </MutationForm>}
          </div>
        </section>
      )}

      <MatchDetailView
        participants={participants}
        teams={teams}
        canViewSeed={canViewSeed}
        canViewTeams={canViewTeams}
        canManageTeams={canManageTeams}
        matchId={match.id}
        confirmedVersionId={confirmedVersion?.id ?? null}
        replacementMembers={replacementMemberRows.filter((member) => !assignedMemberIds.has(member.id)).map((member) => ({
          id: member.id,
          name: member.name,
          code: member.code,
          phone: member.phone,
          avatarVersion: member.avatarUpdatedAt,
        }))}
        penaltyQuantityByTeam={Object.fromEntries(penaltyQuantityByTeam)}
        penaltyUnitAmount={selectedPenaltyType?.defaultAmount ?? historicalPenaltyUnitAmount}
        resultContent={resultContent}
      />

      {canManageMatches && <p className="match-detail-edit-note">Muốn đổi người tham gia hoặc khoản thu? Quay lại danh sách trận và chọn <strong>Sửa</strong>.</p>}
    </>
  );
}
