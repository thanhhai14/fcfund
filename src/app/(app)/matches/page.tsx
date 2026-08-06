import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { chargeTypes, matches, matchParticipants, memberCharges, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { createMatchAction, deleteMatchAction, updateMatchAction } from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { MatchFields } from "@/components/match-fields";

export const metadata = { title: "Trận đấu" };

export default async function MatchesPage() {
  const user = await requireUser();
  if (!(await can(PERMISSIONS.MATCHES_VIEW))) redirect("/dashboard");
  const canManage = await can(PERMISSIONS.MATCHES_MANAGE);
  const canViewTeams = await can(PERMISSIONS.MATCH_TEAMS_VIEW);

  const matchRows = await db.select().from(matches)
    .where(and(eq(matches.clubId, user.clubId), isNull(matches.deletedAt)))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));
  const ids = matchRows.map((row) => row.id);
  const participants = ids.length ? await db
    .select({
      matchId: matchParticipants.matchId,
      memberId: matchParticipants.memberId,
      memberName: members.fullName,
      guestName: matchParticipants.guestName,
    })
    .from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .where(inArray(matchParticipants.matchId, ids)) : [];
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

  const participantMap = new Map<string, string[]>();
  const participantIdMap = new Map<string, Set<string>>();
  participants.forEach((row) => {
    const name = row.memberName ?? row.guestName ?? "Khách";
    participantMap.set(row.matchId, [...(participantMap.get(row.matchId) ?? []), name]);
    if (row.memberId) {
      const set = participantIdMap.get(row.matchId) ?? new Set<string>();
      set.add(row.memberId);
      participantIdMap.set(row.matchId, set);
    }
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

  const memberRows = canManage ? await db.select({ id: members.id, fullName: members.fullName }).from(members)
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE"))).orderBy(members.fullName) : [];
  const occurrenceTypes = canManage ? await db.select({
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
        action={canManage ? (
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
        ) : undefined}
      />

      <section className="match-grid">
        {matchRows.map((match) => {
          const names = participantMap.get(match.id) ?? [];
          return (
            <article className="match-card" key={match.id}>
              <div className="match-date">
                <strong>{new Date(`${match.playedOn}T00:00:00`).getDate()}</strong>
                <span>Tháng {new Date(`${match.playedOn}T00:00:00`).getMonth() + 1}</span>
              </div>
              <div className="match-info">
                <span className="category-pill"><Icon name="futbol" /> Trận giao hữu</span>
                <h2>{match.note || `Trận ngày ${formatDate(match.playedOn)}`}</h2>
                <p>{names.length} người tham gia{names.length ? ` · ${names.slice(0, 4).join(", ")}${names.length > 4 ? "..." : ""}` : ""}</p>
              </div>
              <div className="match-card-side">
                <div className="match-charge">
                  <small>Khoản thu phát sinh</small>
                  <strong>{formatMoney(chargeMap.get(match.id) ?? 0)}</strong>
                </div>
                <div className="match-actions">
                    {canViewTeams && <Link href={`/matches/${match.id}/teams`} className="match-team-link"><Icon name="people-group" /> {canManage ? "Tạo đội" : "Xem đội"}</Link>}
                    <Link href={`/matches/${match.id}`} className="match-view-link"><Icon name="eye" /> Xem</Link>
                    {canManage && <>
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
                        />
                        <div className="form-actions"><SubmitButton>Lưu trận và cập nhật khoản thu</SubmitButton></div>
                      </MutationForm>
                    </Disclosure>
                    <form action={deleteMatchAction}>
                      <input type="hidden" name="id" value={match.id} />
                      <ConfirmSubmitButton message="Xóa trận này và toàn bộ khoản thu phát sinh từ trận?">
                        <Icon name="trash" /> Xóa
                      </ConfirmSubmitButton>
                    </form>
                    </>}
                  </div>
              </div>
            </article>
          );
        })}
        {!matchRows.length && <div className="panel empty-state"><span><Icon name="futbol" /></span><h3>Chưa có trận nào</h3><p>Tạo trận đầu tiên để ghi người tham gia và khoản thu lẻ.</p></div>}
      </section>
    </>
  );
}
