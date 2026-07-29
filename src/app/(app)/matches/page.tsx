import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chargeTypes, matches, matchParticipants, memberCharges, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { createMatchAction } from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Trận đấu" };

export default async function MatchesPage() {
  const user = await requireUser();
  if (!(await can(PERMISSIONS.MATCHES_VIEW))) redirect("/dashboard");
  const canManage = await can(PERMISSIONS.MATCHES_MANAGE);

  const matchRows = await db.select().from(matches)
    .where(and(eq(matches.clubId, user.clubId), isNull(matches.deletedAt)))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));
  const ids = matchRows.map((row) => row.id);
  const participants = ids.length ? await db
    .select({ matchId: matchParticipants.matchId, memberName: members.fullName, guestName: matchParticipants.guestName })
    .from(matchParticipants)
    .leftJoin(members, eq(matchParticipants.memberId, members.id))
    .where(inArray(matchParticipants.matchId, ids)) : [];
  const charges = ids.length ? await db
    .select({ matchId: memberCharges.matchId, amount: memberCharges.totalAmount })
    .from(memberCharges)
    .where(and(inArray(memberCharges.matchId, ids), isNull(memberCharges.deletedAt))) : [];
  const participantMap = new Map<string, string[]>();
  participants.forEach((row) => participantMap.set(row.matchId, [...(participantMap.get(row.matchId) ?? []), row.memberName ?? row.guestName ?? "Khách"]));
  const chargeMap = new Map<string, number>();
  charges.forEach((row) => row.matchId && chargeMap.set(row.matchId, (chargeMap.get(row.matchId) ?? 0) + row.amount));

  const memberRows = canManage ? await db.select().from(members)
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE"))).orderBy(members.fullName) : [];
  const occurrenceTypes = canManage ? await db.select().from(chargeTypes)
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
            <MutationForm action={createMatchAction} className="form-stack">
              <div className="form-row"><label>Ngày thi đấu<input name="playedOn" type="date" defaultValue={todayInTimezone()} required /></label><label>Ghi chú<input name="note" placeholder="Sân, khung giờ..." /></label></div>
              <div>
                <span className="field-label">Người tham gia và khoản thu</span>
                <div className="participant-matrix">
                  <div className="matrix-head" style={{ gridTemplateColumns: `minmax(150px, 1fr) repeat(${1 + occurrenceTypes.length}, 82px)` }}><span>Thành viên</span><span>Tham gia</span>{occurrenceTypes.map((type) => <span key={type.id}>{type.name}<small>{formatMoney(type.defaultAmount)}</small></span>)}</div>
                  {memberRows.map((member) => <div className="matrix-row" style={{ gridTemplateColumns: `minmax(150px, 1fr) repeat(${1 + occurrenceTypes.length}, 82px)` }} key={member.id}>
                    <strong>{member.fullName}</strong>
                    <label className="box-check"><input type="checkbox" name="participants" value={member.id} /><span>✓</span></label>
                    {occurrenceTypes.map((type) => <label className="box-check" key={type.id}><input type="checkbox" name="matchCharges" value={`${member.id}|${type.id}`} /><span>✓</span></label>)}
                  </div>)}
                </div>
              </div>
              <div className="form-actions"><SubmitButton>Tạo trận và phát sinh</SubmitButton></div>
            </MutationForm>
          </Disclosure>
        ) : undefined}
      />

      <section className="match-grid">
        {matchRows.map((match) => {
          const names = participantMap.get(match.id) ?? [];
          return <article className="match-card" key={match.id}>
            <div className="match-date"><strong>{new Date(`${match.playedOn}T00:00:00`).getDate()}</strong><span>Tháng {new Date(`${match.playedOn}T00:00:00`).getMonth() + 1}</span></div>
            <div className="match-info"><span className="category-pill"><Icon name="futbol" /> Trận giao hữu</span><h2>{match.note || `Trận ngày ${formatDate(match.playedOn)}`}</h2><p>{names.length} người tham gia{names.length ? ` · ${names.slice(0, 4).join(", ")}${names.length > 4 ? "..." : ""}` : ""}</p></div>
            <div className="match-charge"><small>Khoản thu phát sinh</small><strong>{formatMoney(chargeMap.get(match.id) ?? 0)}</strong></div>
          </article>;
        })}
        {!matchRows.length && <div className="panel empty-state"><span><Icon name="futbol" /></span><h3>Chưa có trận nào</h3><p>Tạo trận đầu tiên để ghi người tham gia và khoản thu lẻ.</p></div>}
      </section>
    </>
  );
}
