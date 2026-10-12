import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, chargeTypes, memberChargeAssignments, memberCharges } from "@/db/schema";
import { getBalanceReportMonth } from "@/lib/balance-report";
import type { NotificationChargeItem } from "@/lib/notification-presentation";
import { notifyUsers, userRecipientsForMembers } from "@/lib/push-notifications";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AutomaticMatchCharge = {
  id: string;
  matchId: string;
  memberId: string;
  chargeTypeId: string;
  name: string;
  chargeDate: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  isLossPenalty: boolean;
  reportNextMonth: boolean;
  iconName: string;
  color: string | null;
  reportAsIcon: boolean;
};

export async function createAutomaticMatchCharges(
  tx: Tx,
  input: { clubId: string; matchId: string; playedOn: string; memberIds: string[]; actorId: string },
): Promise<AutomaticMatchCharge[]> {
  const memberIds = [...new Set(input.memberIds)];
  if (!memberIds.length) return [];

  const assignments = await tx.select({
    assignmentId: memberChargeAssignments.id,
    memberId: memberChargeAssignments.memberId,
    customAmount: memberChargeAssignments.customAmount,
    chargeTypeId: chargeTypes.id,
    name: chargeTypes.name,
    defaultAmount: chargeTypes.defaultAmount,
    isLossPenalty: chargeTypes.isLossPenalty,
    reportNextMonth: chargeTypes.reportNextMonth,
    iconName: chargeTypes.iconName,
    color: chargeTypes.color,
    reportAsIcon: chargeTypes.reportAsIcon,
  }).from(memberChargeAssignments)
    .innerJoin(chargeTypes, eq(memberChargeAssignments.chargeTypeId, chargeTypes.id))
    .where(and(
      inArray(memberChargeAssignments.memberId, memberIds),
      eq(chargeTypes.clubId, input.clubId),
      eq(chargeTypes.calculation, "OCCURRENCE"),
      eq(chargeTypes.isActive, true),
      eq(memberChargeAssignments.isActive, true),
      eq(memberChargeAssignments.autoOnMatch, true),
      lte(memberChargeAssignments.validFrom, input.playedOn),
      or(isNull(memberChargeAssignments.validUntil), gte(memberChargeAssignments.validUntil, input.playedOn)),
    ))
    .orderBy(desc(memberChargeAssignments.validFrom), desc(memberChargeAssignments.createdAt));

  if (!assignments.length) return [];

  // If an administrator has overlapping assignments for the same member/type,
  // use the most recently effective one and still create only one match charge.
  const assignmentByPair = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    const key = `${assignment.memberId}|${assignment.chargeTypeId}`;
    if (!assignmentByPair.has(key)) assignmentByPair.set(key, assignment);
  }

  const activeCharges = await tx.select({ memberId: memberCharges.memberId, chargeTypeId: memberCharges.chargeTypeId })
    .from(memberCharges)
    .where(and(
      eq(memberCharges.matchId, input.matchId),
      inArray(memberCharges.memberId, memberIds),
      isNull(memberCharges.deletedAt),
    ));
  const alreadyCharged = new Set(activeCharges.map((charge) => `${charge.memberId}|${charge.chargeTypeId}`));
  const eligible = [...assignmentByPair.values()].filter((assignment) =>
    !alreadyCharged.has(`${assignment.memberId}|${assignment.chargeTypeId}`));
  if (!eligible.length) return [];

  const inserted = await tx.insert(memberCharges).values(eligible.map((assignment) => {
    const unitAmount = assignment.customAmount ?? assignment.defaultAmount;
    return {
      clubId: input.clubId,
      memberId: assignment.memberId,
      chargeTypeId: assignment.chargeTypeId,
      assignmentId: assignment.assignmentId,
      matchId: input.matchId,
      source: "MATCH" as const,
      chargeDate: input.playedOn,
      quantity: 1,
      unitAmount,
      totalAmount: unitAmount,
      isLossPenaltySnapshot: assignment.isLossPenalty,
      reportNextMonthSnapshot: assignment.reportNextMonth,
      note: `Tự động phát sinh khi ghi nhận kết quả trận ${input.playedOn}`,
      createdBy: input.actorId,
    };
  })).onConflictDoNothing().returning();

  if (!inserted.length) return [];
  const assignmentMap = new Map(eligible.map((assignment) => [
    `${assignment.memberId}|${assignment.chargeTypeId}`,
    assignment,
  ]));
  await tx.insert(activityLogs).values(inserted.map((charge) => ({
    clubId: input.clubId,
    entityType: "member_charge",
    entityId: charge.id,
    action: "CREATE" as const,
    actorId: input.actorId,
    afterData: charge,
    message: "Tự động tạo khoản thu theo trận khi ghi nhận kết quả",
  })));

  return inserted.flatMap((charge) => {
    const assignment = assignmentMap.get(`${charge.memberId}|${charge.chargeTypeId}`);
    return assignment ? [{
      id: charge.id,
      matchId: input.matchId,
      memberId: charge.memberId,
      chargeTypeId: charge.chargeTypeId,
      name: assignment.name,
      chargeDate: charge.chargeDate,
      quantity: charge.quantity,
      unitAmount: charge.unitAmount,
      totalAmount: charge.totalAmount,
      isLossPenalty: assignment.isLossPenalty,
      reportNextMonth: assignment.reportNextMonth,
      iconName: assignment.iconName,
      color: assignment.color,
      reportAsIcon: assignment.reportAsIcon,
    }] : [];
  });
}

export async function softDeleteAutomaticMatchCharges(
  tx: Tx,
  input: { clubId: string; matchId: string; memberId: string; actorId: string },
) {
  const now = new Date();
  const deleted = await tx.update(memberCharges).set({
    deletedAt: now,
    deletedBy: input.actorId,
    updatedAt: now,
  }).where(and(
    eq(memberCharges.clubId, input.clubId),
    eq(memberCharges.matchId, input.matchId),
    eq(memberCharges.memberId, input.memberId),
    eq(memberCharges.source, "MATCH"),
    isNotNull(memberCharges.assignmentId),
    isNull(memberCharges.deletedAt),
  )).returning();

  if (deleted.length) {
    await tx.insert(activityLogs).values(deleted.map((charge) => ({
      clubId: input.clubId,
      entityType: "member_charge",
      entityId: charge.id,
      action: "DELETE" as const,
      actorId: input.actorId,
      beforeData: charge,
      afterData: { ...charge, deletedAt: now, deletedBy: input.actorId },
      message: "Xóa mềm khoản thu tự động theo trận do thành viên bỏ tham gia",
    })));
  }
  return deleted;
}

export async function notifyAutomaticMatchCharges(
  clubId: string,
  matchId: string,
  charges: AutomaticMatchCharge[],
) {
  if (!charges.length) return;
  const recipients = await userRecipientsForMembers(clubId, charges.map((charge) => charge.memberId));
  const reportMonthByChargeId = new Map(charges.map((charge) => [
    charge.id,
    getBalanceReportMonth(charge.chargeDate, charge.reportNextMonth),
  ]));
  const rowsByReportMonth = new Map<string, AutomaticMatchCharge[]>();
  for (const charge of charges) {
    const reportMonth = reportMonthByChargeId.get(charge.id)!;
    rowsByReportMonth.set(reportMonth, [...(rowsByReportMonth.get(reportMonth) ?? []), charge]);
  }

  for (const [reportMonth, rows] of rowsByReportMonth) {
    const rowsByMember = new Map<string, AutomaticMatchCharge[]>();
    for (const charge of rows) rowsByMember.set(charge.memberId, [...(rowsByMember.get(charge.memberId) ?? []), charge]);
    const recipientContentByUserId = Object.fromEntries(recipients.flatMap(({ userId, memberId }) => {
      const memberCharges = memberId ? rowsByMember.get(memberId) : undefined;
      if (!memberCharges?.length) return [];
      const chargeItems: NotificationChargeItem[] = memberCharges.map((charge) => ({
        name: charge.name,
        quantity: charge.quantity,
        iconName: charge.iconName,
        color: charge.color,
        reportAsIcon: charge.reportAsIcon,
      }));
      const summary = chargeItems.map((item) => `“${item.name}”${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ");
      return [[userId, {
        body: chargeItems.length === 1 ? `Bạn có khoản thu ${summary} mới.` : `Bạn có các khoản thu mới: ${summary}.`,
        presentationData: { version: 1 as const, kind: "charge_created" as const, chargeItems },
      }] as const];
    }));
    const userIds = Object.keys(recipientContentByUserId);
    if (!userIds.length) continue;
    await notifyUsers({
      clubId,
      userIds,
      type: "MEMBER_CHARGE_CREATED",
      title: "Khoản thu mới",
      body: "Bạn có khoản thu Trận lẻ mới.",
      url: `/reports?tab=monthly&month=${reportMonth}`,
      entityType: "match",
      entityId: matchId,
      dedupeKey: `MEMBER_CHARGE_CREATED:AUTO_MATCH:${rows.map((charge) => charge.id).sort().join(":")}`,
      recipientContentByUserId,
    });
  }
}
