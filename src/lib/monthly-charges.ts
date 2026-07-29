import "server-only";

import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  chargeTypes,
  memberChargeAssignments,
  memberCharges,
  monthlyJobRuns,
} from "@/db/schema";
import { monthStart, todayInTimezone } from "./format";

export async function generateMonthlyCharges(options?: {
  force?: boolean;
  timezone?: string;
}) {
  const timezone = options?.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayInTimezone(timezone);
  if (!options?.force && !today.endsWith("-01")) {
    return { skipped: true, reason: "not-first-day", created: 0 };
  }

  const period = monthStart(today);
  const [existingRun] = await db
    .select()
    .from(monthlyJobRuns)
    .where(eq(monthlyJobRuns.periodMonth, period))
    .limit(1);

  if (existingRun?.status === "COMPLETED") {
    return { skipped: true, reason: "already-completed", created: existingRun.createdCount };
  }

  if (existingRun) {
    await db
      .update(monthlyJobRuns)
      .set({ status: "RUNNING", startedAt: new Date(), finishedAt: null, errorMessage: null })
      .where(eq(monthlyJobRuns.id, existingRun.id));
  } else {
    await db.insert(monthlyJobRuns).values({ periodMonth: period });
  }

  try {
    const assignments = await db
      .select({
        id: memberChargeAssignments.id,
        memberId: memberChargeAssignments.memberId,
        chargeTypeId: memberChargeAssignments.chargeTypeId,
        customAmount: memberChargeAssignments.customAmount,
        defaultAmount: chargeTypes.defaultAmount,
        clubId: chargeTypes.clubId,
      })
      .from(memberChargeAssignments)
      .innerJoin(chargeTypes, eq(memberChargeAssignments.chargeTypeId, chargeTypes.id))
      .where(
        and(
          eq(memberChargeAssignments.isActive, true),
          eq(chargeTypes.isActive, true),
          eq(chargeTypes.calculation, "MONTHLY"),
          lte(memberChargeAssignments.validFrom, period),
          or(
            isNull(memberChargeAssignments.validUntil),
            gte(memberChargeAssignments.validUntil, period),
          ),
        ),
      );

    let created = 0;
    for (const assignment of assignments) {
      const amount = assignment.customAmount ?? assignment.defaultAmount;
      const inserted = await db
        .insert(memberCharges)
        .values({
          clubId: assignment.clubId,
          memberId: assignment.memberId,
          chargeTypeId: assignment.chargeTypeId,
          assignmentId: assignment.id,
          source: "AUTO_MONTHLY",
          chargeDate: period,
          periodMonth: period,
          quantity: 1,
          unitAmount: amount,
          totalAmount: amount,
          note: `Khoản thu tự động tháng ${period.slice(5, 7)}/${period.slice(0, 4)}`,
        })
        .onConflictDoNothing()
        .returning({ id: memberCharges.id });
      created += inserted.length;
    }

    await db
      .update(monthlyJobRuns)
      .set({ status: "COMPLETED", finishedAt: new Date(), createdCount: created })
      .where(eq(monthlyJobRuns.periodMonth, period));

    return { skipped: false, created, period };
  } catch (error) {
    await db
      .update(monthlyJobRuns)
      .set({
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(monthlyJobRuns.periodMonth, period));
    throw error;
  }
}
