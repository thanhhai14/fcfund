import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MatchDetailView, type MatchParticipantView, type MatchTeamView } from "@/components/match-detail-view";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import {
  chargeTypes,
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
import { recordMatchResultAction } from "./actions";

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
  }).from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .where(eq(matchParticipants.matchId, id));

  const chargeRows = await db.select({
    id: memberCharges.id,
    memberId: memberCharges.memberId,
    name: chargeTypes.name,
    iconName: chargeTypes.iconName,
    color: chargeTypes.color,
    quantity: memberCharges.quantity,
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
    participantId: matchTeamMembers.participantId,
    teamId: matchTeamMembers.teamId,
  }).from(matchTeamMembers).where(eq(matchTeamMembers.versionId, confirmedVersion.id)) : [];
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
  const participantTeam = new Map(teamMemberRows.flatMap((row) => row.participantId ? [[row.participantId, row.teamId]] : []));
  const placements = getPlacements(confirmedVersion?.metrics);
  const selectedPenaltyTypeId = getMetricString(confirmedVersion?.metrics, "resultChargeTypeId")
    ?? penaltyTypes[0]?.id;
  const hasRecordedResult = teamRows.length > 0 && teamRows.every((team) => placements[team.name]);

  const participants: MatchParticipantView[] = participantRows.map((row) => {
    const team = teamById.get(participantTeam.get(row.id) ?? "");
    return {
      id: row.id,
      name: row.memberName ?? row.guestName ?? "Khách",
      seedTier: canViewSeed ? row.seedTier : null,
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
  }));
  const totalAmount = chargeRows.reduce((sum, charge) => sum + charge.amount, 0);
  const resultContent = canManageTeams && confirmedVersion && teamRows.length > 0 ? (
    <section className="panel match-result-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">{hasRecordedResult ? "Kết quả đã ghi nhận" : "Sau khi trận kết thúc"}</span><h2>Nhập kết quả trận</h2></div>
        {hasRecordedResult && <span className="validation-badge valid"><Icon name="check" /> Đã có kết quả</span>}
      </div>
      <p className="panel-note">Xếp mỗi đội một hạng khác nhau. Hạng 1 thắng và không bị phạt; các hạng sau tự nhận số lần phạt bằng hạng trừ 1.</p>
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
              <label key={team.id} style={{ borderLeftColor: team.color ?? undefined }}>
                <span><Icon name="people-group" /><b>{team.name}</b><small>{team.memberCount} người</small></span>
                <select name={`place:${team.id}`} defaultValue={placements[team.name] ?? ""} required>
                  <option value="" disabled>Chọn hạng</option>
                  {teamRows.map((_, index) => <option key={index + 1} value={index + 1}>Hạng {index + 1}{index === 0 ? " · Thắng" : ` · Phạt ${index} lần`}</option>)}
                </select>
              </label>
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
      {hasRecordedResult ? <div className="match-result-summary-grid">{teams.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((team) => <article key={team.id} style={{ borderTopColor: team.color ?? undefined }}><small>Hạng {team.place}</small><strong>{team.name}</strong><span>{team.place === 1 ? "Thắng" : `Phạt ${(team.place ?? 1) - 1} lần`}</span></article>)}</div> : <p className="match-result-empty">Kết quả sẽ xuất hiện tại đây sau khi quản trị viên nhập thứ hạng trận đấu.</p>}
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

      <MatchDetailView participants={participants} teams={teams} canViewSeed={canViewSeed} canViewTeams={canViewTeams} resultContent={resultContent} />

      {canManageMatches && <p className="match-detail-edit-note">Muốn đổi người tham gia hoặc khoản thu? Quay lại danh sách trận và chọn <strong>Sửa</strong>.</p>}
    </>
  );
}
