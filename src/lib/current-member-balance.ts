import "server-only";

import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { fundTransactions, memberCharges } from "@/db/schema";
import { getBalanceReportMonth } from "./balance-report";
import { todayInTimezone } from "./format";

export async function currentMemberBalances(clubId: string) {
  const today = todayInTimezone();
  const month = today.slice(0, 7);
  const [charges, payments] = await Promise.all([
    db.select({ memberId: memberCharges.memberId, chargeDate: memberCharges.chargeDate, amount: memberCharges.totalAmount, nextMonth: memberCharges.reportNextMonthSnapshot })
      .from(memberCharges).where(and(eq(memberCharges.clubId, clubId), isNull(memberCharges.deletedAt), lte(memberCharges.chargeDate, today))),
    db.select({ memberId: fundTransactions.memberId, amount: fundTransactions.amount })
      .from(fundTransactions).where(and(eq(fundTransactions.clubId, clubId), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt), lte(fundTransactions.transactionDate, today))),
  ]);
  const balances = new Map<string, number>();
  for (const row of charges) {
    if (getBalanceReportMonth(row.chargeDate, row.nextMonth) <= month) {
      balances.set(row.memberId, (balances.get(row.memberId) ?? 0) - row.amount);
    }
  }
  for (const row of payments) {
    if (row.memberId) balances.set(row.memberId, (balances.get(row.memberId) ?? 0) + row.amount);
  }
  return balances;
}
