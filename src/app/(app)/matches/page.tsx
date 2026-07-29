import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
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

export const metadata = { title: "Trận đấu" };

type MatrixMember = { id: string; fullName: string };
type MatrixChargeType = {
  id: string;
  name: string;
  defaultAmount: number;
  iconName: string;
  color: string | null;
};

function MatchFields({
  memberRows,
  occurrenceTypes,
  playedOn,
  note = "",
  participantIds = new Set<string>(),
  chargeSelections = new Set<string>(),
}: {
  memberRows: MatrixMember[];
  occurrenceTypes: MatrixChargeType[];
  playedOn: string;
  note?: string;
  participantIds?: Set<string>;
  chargeSelections?: Set<string>;
}) {
  const columns = `minmax(150px, 1fr) repeat(${1 + occurrenceTypes.length}, 82px)`;
  return (
    <>
      <div className="form-row">
        <label>Ngày thi đấu<input name="playedOn" type="date" defaultValue={playedOn} required /></label>
        <label>Ghi chú<input name="note" defaultValue={note} placeholder="Sân, khung giờ..." /></label>
      </div>
      <div>
        <span className="field-label">Người tham gia và khoản thu</span>
        <div className="participant-matrix">
          <div className="matrix-head" style={{ gridTemplateColumns: columns }}>
            <span>Thành viên</span>
            <span>Tham gia</span>
            {occurrenceTypes.map((type) => (
              <span key={type.id}>
                <Icon name={type.iconName} />
                <small>{type.name}</small>
                <small>{formatMoney(type.defaultAmount)}</small>
              </span>
            ))}
          </div>
          {memberRows.map((member) => (
            <div className="matrix-row" style={{ gridTemplateColumns: columns }} key={member.id}>
              <strong>{member.fullName}</strong>
              <label className="box-check" title="Đánh dấu tham gia">
                <input
                  type="checkbox"
                  name="participants"
                  value={member.id}
                  defaultChecked={participantIds.has(member.id)}
                />
                <span>✓</span>
              </label>
              {occurrenceTypes.map((type) => {
                const value = `${member.id}|${type.id}`;
                return (
                  <label className="box-check" title={`${type.name} · ${member.fullName}`} key={type.id}>
                    <input
                      type="checkbox"
                      name="matchCharges"
                      value={value}
                      defaultChecked={chargeSelections.has(value)}
                    />
                    <span>✓</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default async function MatchesPage() {
  const user = await requireUser();
  if (!(await can(PERMISSIONS.MATCHES_VIEW))) redirect("/dashboard");
  const canManage = await can(PERMISSIONS.MATCHES_MANAGE);

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
  const matchDetailMap = new Map<string, Map<string, {
    name: string;
    charges: Array<{
      typeId: string;
      name: string;
      iconName: string;
      color: string | null;
      quantity: number;
      amount: number;
    }>;
  }>>();
  participants.forEach((row) => {
    const name = row.memberName ?? row.guestName ?? "Khách";
    participantMap.set(row.matchId, [...(participantMap.get(row.matchId) ?? []), name]);
    const details = matchDetailMap.get(row.matchId) ?? new Map();
    details.set(row.memberId ?? `guest-${details.size}`, { name, charges: [] });
    matchDetailMap.set(row.matchId, details);
    if (row.memberId) {
      const set = participantIdMap.get(row.matchId) ?? new Set<string>();
      set.add(row.memberId);
      participantIdMap.set(row.matchId, set);
    }
  });
  const chargeMap = new Map<string, number>();
  const chargeSelectionMap = new Map<string, Set<string>>();
  charges.forEach((row) => {
    if (!row.matchId) return;
    chargeMap.set(row.matchId, (chargeMap.get(row.matchId) ?? 0) + row.amount);
    const set = chargeSelectionMap.get(row.matchId) ?? new Set<string>();
    set.add(`${row.memberId}|${row.chargeTypeId}`);
    chargeSelectionMap.set(row.matchId, set);
    const details = matchDetailMap.get(row.matchId) ?? new Map();
    const detail = details.get(row.memberId) ?? { name: row.memberName, charges: [] };
    detail.charges.push({
      typeId: row.chargeTypeId,
      name: row.typeName,
      iconName: row.iconName,
      color: row.color,
      quantity: row.quantity,
      amount: row.amount,
    });
    details.set(row.memberId, detail);
    matchDetailMap.set(row.matchId, details);
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
            <MutationForm action={createMatchAction} className="form-stack">
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
                    <Disclosure label={<><Icon name="eye" /> Xem</>} className="match-view-disclosure">
                      <div className="match-view-heading">
                        <span className="eyebrow">Chi tiết trận</span>
                        <h3>{formatDate(match.playedOn)} · {names.length} người</h3>
                      </div>
                      <div className="match-member-list">
                        {[...(matchDetailMap.get(match.id)?.entries() ?? [])].map(([key, detail]) => (
                          <div key={key}>
                            <span className="member-mini-avatar">{detail.name.slice(0, 2).toUpperCase()}</span>
                            <span>
                              <strong>{detail.name}</strong>
                              <small>{detail.charges.length ? `${detail.charges.length} loại khoản thu` : "Chỉ tham gia"}</small>
                            </span>
                            <span className="match-charge-tags">
                              {detail.charges.map((charge) => (
                                <span
                                  key={charge.typeId}
                                  style={{ color: charge.color ?? undefined }}
                                  title={`${charge.quantity} lần · ${formatMoney(charge.amount)}`}
                                >
                                  <Icon name={charge.iconName} />
                                  {charge.name}
                                  {charge.quantity > 1 && ` ×${charge.quantity}`}
                                </span>
                              ))}
                              {!detail.charges.length && <em>Không phát sinh</em>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Disclosure>
                    {canManage && <>
                    <Disclosure label={<><Icon name="edit" /> Sửa</>} className="match-edit-disclosure match-popover">
                      <MutationForm action={updateMatchAction} className="form-stack">
                        <input type="hidden" name="id" value={match.id} />
                        <MatchFields
                          memberRows={memberRows}
                          occurrenceTypes={occurrenceTypes}
                          playedOn={match.playedOn}
                          note={match.note ?? ""}
                          participantIds={participantIdMap.get(match.id)}
                          chargeSelections={chargeSelectionMap.get(match.id)}
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
