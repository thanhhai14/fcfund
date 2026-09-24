import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { activityLogs, avatars, chargeTypes, matches, matchParticipants, matchRsvps, matchTeamVersions, memberCharges, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { createMatchAction, deleteMatchAction, updateMatchAction } from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import {
  canCancelMatch,
  canEditMatchRoster,
  deriveMatchLifecycle,
  getMatchResultChargeTypeId,
  isMatchRsvpClosed,
} from "@/lib/match-lifecycle";
import { formatDate, formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { MatchFields } from "@/components/match-fields";
import { MemberIdentity } from "@/components/member-identity";
import { MatchRsvpDisclosure } from "@/components/match-rsvp-disclosure";
import { hideMatchAction, remindMatchRsvpAction, restoreHiddenMatchAction, setMyMatchRsvpAction } from "./actions";

export const metadata = { title: "Trận đấu" };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ rsvp?: string; hidden?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  if (!(await can(PERMISSIONS.MATCHES_VIEW))) redirect("/dashboard");
  const canManageMatches = await can(PERMISSIONS.MATCHES_MANAGE);
  const isAdmin = user.role === "ADMIN";
  const showHidden = isAdmin && params.hidden === "1";
  const canManageTeams = await can(PERMISSIONS.MATCH_TEAMS_MANAGE);
  const canViewTeams = await can(PERMISSIONS.MATCH_TEAMS_VIEW);
  const canAccessTeams = canViewTeams || canManageTeams;

  const matchRows = await db.select().from(matches)
    .where(and(
      eq(matches.clubId, user.clubId),
      showHidden ? isNotNull(matches.hiddenAt) : isNull(matches.hiddenAt),
    ))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));
  const ids = matchRows.map((row) => row.id);
  const teamVersions = ids.length ? await db.select({
    id: matchTeamVersions.id,
    matchId: matchTeamVersions.matchId,
    status: matchTeamVersions.status,
    randomKey: matchTeamVersions.randomKey,
    initialDrawSnapshot: matchTeamVersions.initialDrawSnapshot,
    metrics: matchTeamVersions.metrics,
  }).from(matchTeamVersions).where(inArray(matchTeamVersions.matchId, ids)) : [];
  const versionsByMatch = new Map<string, typeof teamVersions>();
  for (const version of teamVersions) {
    versionsByMatch.set(version.matchId, [...(versionsByMatch.get(version.matchId) ?? []), version]);
  }
  const lifecycleByMatch = new Map(matchRows.map((match) => [
    match.id,
    deriveMatchLifecycle({
      deletedAt: match.deletedAt,
      versions: versionsByMatch.get(match.id) ?? [],
    }),
  ]));
  const participants = ids.length ? await db
    .select({
      matchId: matchParticipants.matchId,
      memberId: matchParticipants.memberId,
      memberName: members.fullName,
      guestName: matchParticipants.guestName,
      goalkeeperAvailable: matchParticipants.goalkeeperAvailable,
      avatarUpdatedAt: avatars.updatedAt,
    })
    .from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .leftJoin(avatars, eq(matchParticipants.memberId, avatars.memberId))
    .where(inArray(matchParticipants.matchId, ids)) : [];
  const activeMembers = await db.select({
    id: members.id,
    name: members.fullName,
    avatarUpdatedAt: avatars.updatedAt,
  }).from(members)
    .leftJoin(avatars, eq(members.id, avatars.memberId))
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE")))
    .orderBy(members.fullName);
  const rsvpRows = ids.length ? await db.select({
    matchId: matchRsvps.matchId,
    memberId: matchRsvps.memberId,
    status: matchRsvps.status,
    goalkeeperAvailable: matchRsvps.goalkeeperAvailable,
  }).from(matchRsvps).where(inArray(matchRsvps.matchId, ids)) : [];
  const rsvpActivities = ids.length ? await db.select({
    id: activityLogs.id,
    matchId: activityLogs.entityId,
    message: activityLogs.message,
    createdAt: activityLogs.createdAt,
  }).from(activityLogs)
    .where(and(eq(activityLogs.entityType, "match_rsvp"), inArray(activityLogs.entityId, ids)))
    .orderBy(desc(activityLogs.createdAt)) : [];

  const charges = ids.length ? await db
    .select({
      matchId: memberCharges.matchId,
      memberId: memberCharges.memberId,
      memberName: members.fullName,
      chargeTypeId: memberCharges.chargeTypeId,
      typeName: chargeTypes.name,
      iconName: chargeTypes.iconName,
      color: chargeTypes.color,
      quantity: memberCharges.quantity,
      amount: memberCharges.totalAmount,
    })
    .from(memberCharges)
    .innerJoin(members, eq(memberCharges.memberId, members.id))
    .innerJoin(chargeTypes, eq(memberCharges.chargeTypeId, chargeTypes.id))
    .where(and(inArray(memberCharges.matchId, ids), isNull(memberCharges.deletedAt))) : [];

  const participantMap = new Map<string, Array<{ memberId: string | null; name: string; avatarUpdatedAt: Date | null }>>();
  const participantIdMap = new Map<string, Set<string>>();
  const participantGoalkeeperMap = new Map<string, boolean>();
  participants.forEach((row) => {
    const name = row.memberName ?? row.guestName ?? "Khách";
    participantMap.set(row.matchId, [...(participantMap.get(row.matchId) ?? []), { memberId: row.memberId, name, avatarUpdatedAt: row.avatarUpdatedAt }]);
    if (row.memberId) {
      const set = participantIdMap.get(row.matchId) ?? new Set<string>();
      set.add(row.memberId);
      participantIdMap.set(row.matchId, set);
      participantGoalkeeperMap.set(`${row.matchId}|${row.memberId}`, row.goalkeeperAvailable);
    }
  });
  const rsvpMap = new Map<string, { status: "GOING" | "NOT_GOING"; goalkeeperAvailable: boolean }>();
  rsvpRows.forEach((row) => {
    rsvpMap.set(`${row.matchId}|${row.memberId}`, {
      status: row.status,
      goalkeeperAvailable: row.goalkeeperAvailable,
    });
  });
  const rsvpActivityMap = new Map<string, Array<{ id: string; message: string; createdAt: Date }>>();
  rsvpActivities.forEach((row) => {
    if (!row.message) return;
    rsvpActivityMap.set(row.matchId, [...(rsvpActivityMap.get(row.matchId) ?? []), {
      id: row.id,
      message: row.message,
      createdAt: row.createdAt,
    }]);
  });
  const chargeMap = new Map<string, number>();
  const chargeQuantityMap = new Map<string, Map<string, number>>();
  charges.forEach((row) => {
    if (!row.matchId) return;
    chargeMap.set(row.matchId, (chargeMap.get(row.matchId) ?? 0) + row.amount);
    const quantities = chargeQuantityMap.get(row.matchId) ?? new Map<string, number>();
    const quantityKey = `${row.memberId}|${row.chargeTypeId}`;
    quantities.set(quantityKey, (quantities.get(quantityKey) ?? 0) + row.quantity);
    chargeQuantityMap.set(row.matchId, quantities);
  });

  const memberRows = canManageMatches ? activeMembers.map((member) => ({
    id: member.id,
    fullName: member.name,
    avatarUpdatedAt: member.avatarUpdatedAt,
  })) : [];
  const occurrenceTypes = canManageMatches ? await db.select({
    id: chargeTypes.id,
    name: chargeTypes.name,
    defaultAmount: chargeTypes.defaultAmount,
    iconName: chargeTypes.iconName,
    color: chargeTypes.color,
  }).from(chargeTypes)
    .where(and(eq(chargeTypes.clubId, user.clubId), eq(chargeTypes.calculation, "OCCURRENCE"), eq(chargeTypes.isActive, true)))
    .orderBy(chargeTypes.name) : [];

  return (
    <>
      <PageHeader
        eyebrow="Phát sinh theo trận"
        title="Trận đấu"
        description="Quản lý ngày, người tham gia và khoản thu lẻ"
        action={canManageMatches ? (
          <div className="form-actions">
            {isAdmin && (
              <Link className="button secondary" href={showHidden ? "/matches" : "/matches?hidden=1"}>
                <Icon name={showHidden ? "eye" : "ban"} /> {showHidden ? "Trận đang hiển thị" : "Trận đã ẩn"}
              </Link>
            )}
            {!showHidden && (
              <Disclosure label={<><Icon name="plus" /> Tạo trận</>} className="action-disclosure match-popover">
                <MutationForm action={createMatchAction} className="form-stack" closeDisclosureOnSuccess>
                  <MatchFields
                    memberRows={memberRows}
                    occurrenceTypes={occurrenceTypes}
                    playedOn={todayInTimezone()}
                  />
                  <div className="form-actions"><SubmitButton>Tạo trận và phát sinh</SubmitButton></div>
                </MutationForm>
              </Disclosure>
            )}
          </div>
        ) : undefined}
      />

      <section className="match-grid">
        {matchRows.map((match) => {
          const lifecycle = lifecycleByMatch.get(match.id)!;
          const participantPreviews = participantMap.get(match.id) ?? [];

          if (showHidden) {
            return (
              <article className="match-card" key={match.id}>
                <div className="match-date">
                  <Icon name="calendar" className="match-date-background" />
                  <strong>{new Date(`${match.playedOn}T00:00:00`).getDate()}</strong>
                  <span>Tháng {new Date(`${match.playedOn}T00:00:00`).getMonth() + 1}</span>
                </div>
                <div className="match-info">
                  <span className="category-pill"><Icon name="ban" /> Đã ẩn</span>
                  <h2>{match.note || `Trận ngày ${formatDate(match.playedOn)}`}</h2>
                  <p>{participantPreviews.length} người tham gia · Ẩn khỏi danh sách, Dashboard và đội hình công khai.</p>
                </div>
                <div className="match-card-side">
                  <div className="match-actions">
                    <MutationForm action={restoreHiddenMatchAction}>
                      <input type="hidden" name="matchId" value={match.id} />
                      <ConfirmSubmitButton message="Khôi phục trận này về giao diện? Khoản thu sẽ không thay đổi.">
                        <Icon name="eye" /> Khôi phục
                      </ConfirmSubmitButton>
                    </MutationForm>
                  </div>
                </div>
              </article>
            );
          }

          const isCancelled = lifecycle.lifecycle === "CANCELLED";
          const structuralEditLocked = !canEditMatchRoster(lifecycle, user.role === "ADMIN");
          const confirmedVersion = lifecycle.confirmedId
            ? (versionsByMatch.get(match.id) ?? []).find((version) => version.id === lifecycle.confirmedId)
            : undefined;
          const resultChargeTypeId = confirmedVersion
            ? getMatchResultChargeTypeId(confirmedVersion.metrics)
            : null;
          const teamLabel = lifecycle.lifecycle === "OPEN"
            ? (canManageTeams ? "Chia đội" : "Xem đội")
            : lifecycle.lifecycle === "TEAM_DRAFT"
              ? (canManageTeams ? "Tiếp tục chia đội" : "Xem đội")
              : lifecycle.lifecycle === "TEAM_CONFIRMED"
                ? (canManageTeams ? "Xem / chỉnh đội" : "Xem đội")
                : lifecycle.lifecycle === "RESULT_RECORDED"
                  ? "Xem đội hình"
                  : "Đã hủy";
          const participantIds = participantIdMap.get(match.id) ?? new Set<string>();
          const rsvpMembers = activeMembers.map((member) => {
            const rsvp = rsvpMap.get(`${match.id}|${member.id}`);
            const participantGoing = participantIds.has(member.id);
            return {
              id: member.id,
              name: member.name,
              avatarUpdatedAt: member.avatarUpdatedAt,
              status: participantGoing ? "GOING" as const : (rsvp?.status === "NOT_GOING" ? "NOT_GOING" as const : null),
              goalkeeperAvailable: participantGoing
                ? (participantGoalkeeperMap.get(`${match.id}|${member.id}`) ?? false)
                : false,
            };
          });
          const myRsvpMember = user.memberId ? rsvpMembers.find((member) => member.id === user.memberId) : null;
          const isRsvpClosed = isMatchRsvpClosed(lifecycle);
          return (
            <article className="match-card" key={match.id}>
              <div className="match-date">
                <Icon name="calendar" className="match-date-background" />
                <strong>{new Date(`${match.playedOn}T00:00:00`).getDate()}</strong>
                <span>Tháng {new Date(`${match.playedOn}T00:00:00`).getMonth() + 1}</span>
              </div>
              <div className="match-info">
                <span className="category-pill"><Icon name="futbol" /> {isCancelled ? "Đã hủy" : "Trận giao hữu"}</span>
                <h2>{match.note || `Trận ngày ${formatDate(match.playedOn)}`}</h2>
                <p>{participantPreviews.length} người tham gia · {rsvpMembers.filter((member) => member.status === "NOT_GOING").length} không đi · {rsvpMembers.filter((member) => member.status === null).length} chưa trả lời</p>
                {!!participantPreviews.length && <div className="match-participant-preview">
                  {participantPreviews.slice(0, 4).map((participant, index) => <MemberIdentity memberId={participant.memberId} name={participant.name} avatarVersion={participant.avatarUpdatedAt} compact key={participant.memberId ?? `${participant.name}-${index}`} />)}
                  {participantPreviews.length > 4 && <span className="match-participant-more">+{participantPreviews.length - 4}</span>}
                </div>}
              </div>
              <div className="match-card-side">
                <div className="match-charge">
                  <small>Khoản thu phát sinh</small>
                  <strong>{formatMoney(chargeMap.get(match.id) ?? 0)}</strong>
                </div>
                <div className="match-actions">
                    <MatchRsvpDisclosure
                      matchId={match.id}
                      disabled={isRsvpClosed}
                      canVote={Boolean(user.memberId)}
                      canRemind={["ORGANIZER", "TREASURER", "ADMIN"].includes(user.role)}
                      defaultOpen={params.rsvp === match.id}
                      myStatus={myRsvpMember?.status ?? null}
                      myGoalkeeperAvailable={myRsvpMember?.goalkeeperAvailable ?? false}
                      members={rsvpMembers}
                      activities={rsvpActivityMap.get(match.id) ?? []}
                      action={setMyMatchRsvpAction}
                      reminderAction={remindMatchRsvpAction}
                    />
                    {canAccessTeams && (isCancelled
                      ? <button type="button" className="match-team-link" disabled title="Trận đã hủy"><Icon name="people-group" /> {teamLabel}</button>
                      : <Link href={`/matches/${match.id}/teams`} className="match-team-link"><Icon name="people-group" /> {teamLabel}</Link>)}
                    <Link href={`/matches/${match.id}`} className="match-view-link"><Icon name="eye" /> Xem</Link>
                    {canManageMatches && <>
                    {isCancelled ? (
                      <button type="button" className="button secondary small" disabled title="Trận đã hủy"><Icon name="edit" /> Sửa</button>
                    ) : (
                      <Disclosure label={<><Icon name="edit" /> Sửa</>} className="match-edit-disclosure match-popover">
                        <MutationForm action={updateMatchAction} className="form-stack" closeDisclosureOnSuccess>
                          <input type="hidden" name="id" value={match.id} />
                          <MatchFields
                            memberRows={memberRows}
                            occurrenceTypes={occurrenceTypes}
                            playedOn={match.playedOn}
                            note={match.note ?? ""}
                            initialParticipantIds={[...(participantIdMap.get(match.id) ?? new Set<string>())]}
                            initialChargeQuantities={Object.fromEntries(chargeQuantityMap.get(match.id) ?? new Map<string, number>())}
                            lockParticipants={structuralEditLocked}
                            lockPlayedOn={structuralEditLocked}
                            lockedChargeTypeIds={resultChargeTypeId ? [resultChargeTypeId] : []}
                          />
                          <div className="form-actions">
                            {lifecycle.lifecycle === "TEAM_DRAFT" && lifecycle.hasDraftDraw && user.role === "ADMIN" ? (
                              <ConfirmSubmitButton
                                message="Đội hình nháp đã được bốc thăm. Nếu bạn thay đổi ngày hoặc người tham gia, toàn bộ bản nháp và kết quả bốc thăm hiện tại sẽ bị xóa. Tiếp tục lưu?"
                                className="button primary"
                              >
                                Lưu và xóa bản nháp
                              </ConfirmSubmitButton>
                            ) : (
                              <SubmitButton>Lưu trận và cập nhật khoản thu</SubmitButton>
                            )}
                          </div>
                        </MutationForm>
                      </Disclosure>
                    )}
                    {isCancelled ? (
                      <button type="button" className="button danger small" disabled><Icon name="trash" /> Đã hủy</button>
                    ) : canCancelMatch(lifecycle) ? (
                      <form action={deleteMatchAction}>
                        <input type="hidden" name="id" value={match.id} />
                        <ConfirmSubmitButton message="Hủy trận này và toàn bộ khoản thu/phạt phát sinh từ trận?">
                          <Icon name="trash" /> Hủy trận
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <button type="button" className="button danger small" disabled title="Hãy hủy kết quả trước khi hủy trận"><Icon name="trash" /> Hủy trận</button>
                    )}
                    {isAdmin && (
                      <MutationForm action={hideMatchAction}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <ConfirmSubmitButton
                          message="Ẩn hoàn toàn trận này khỏi giao diện? Các khoản thu hiện có sẽ được giữ nguyên."
                          className="button secondary small"
                        >
                          <Icon name="ban" /> Ẩn khỏi UI
                        </ConfirmSubmitButton>
                      </MutationForm>
                    )}
                    </>}
                  </div>
              </div>
            </article>
          );
        })}
        {!matchRows.length && <div className="panel empty-state"><span><Icon name={showHidden ? "ban" : "futbol"} /></span><h3>{showHidden ? "Không có trận đã ẩn" : "Chưa có trận nào"}</h3><p>{showHidden ? "Các trận Admin ẩn khỏi giao diện sẽ xuất hiện tại đây để có thể khôi phục." : "Tạo trận đầu tiên để ghi người tham gia và khoản thu lẻ."}</p></div>}
      </section>
    </>
  );
}
