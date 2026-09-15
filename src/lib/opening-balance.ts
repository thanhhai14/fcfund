import { getBalanceReportMonth } from "./balance-report";

export type PriorPeriodCharge = {
  memberId: string;
  chargeTypeId: string;
  chargeDate: string;
  totalAmount: number;
  reportNextMonthSnapshot: boolean;
};

export type PriorPeriodPayment = { memberId: string | null; amount: number };
export type PriorPeriodType = { id: string; name: string };

export type OpeningBalance = {
  // Positive means credit; negative means outstanding debt before the period.
  amount: number;
  periods: Array<{
    month: string;
    amount: number;
    types: Array<{ name: string; amount: number; sourceMonth: string }>;
  }>;
};

/**
 * Payments have no charge allocation. Older report months are offset first only
 * to explain a negative opening balance; this does not identify which charge was paid.
 */
export function calculateOpeningBalances(
  fromMonth: string,
  charges: PriorPeriodCharge[],
  payments: PriorPeriodPayment[],
  types: PriorPeriodType[],
) {
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const byMember = new Map<string, Map<string, Map<string, { name: string; amount: number; sourceMonth: string }>>>();
  for (const charge of charges) {
    const reportMonth = getBalanceReportMonth(charge.chargeDate, charge.reportNextMonthSnapshot);
    if (reportMonth >= fromMonth) continue;
    const sourceMonth = charge.chargeDate.slice(0, 7);
    const months = byMember.get(charge.memberId) ?? new Map();
    const monthTypes = months.get(reportMonth) ?? new Map();
    const key = `${sourceMonth}|${charge.chargeTypeId}`;
    const current = monthTypes.get(key);
    monthTypes.set(key, {
      name: typeNames.get(charge.chargeTypeId) ?? "Loại thu không còn tồn tại",
      sourceMonth,
      amount: (current?.amount ?? 0) + charge.totalAmount,
    });
    months.set(reportMonth, monthTypes);
    byMember.set(charge.memberId, months);
  }

  const paidByMember = new Map<string, number>();
  for (const payment of payments) {
    if (payment.memberId) paidByMember.set(payment.memberId, (paidByMember.get(payment.memberId) ?? 0) + payment.amount);
  }

  const result = new Map<string, OpeningBalance>();
  const memberIds = new Set([...byMember.keys(), ...paidByMember.keys()]);
  for (const memberId of memberIds) {
    const months = byMember.get(memberId) ?? new Map();
    const totalCharged = [...months.values()].reduce((sum, monthTypes) =>
      sum + [...monthTypes.values()].reduce((monthSum, type) => monthSum + type.amount, 0), 0);
    const amount = (paidByMember.get(memberId) ?? 0) - totalCharged;
    if (amount === 0) continue;

    let remainingPayment = paidByMember.get(memberId) ?? 0;
    const periods = amount < 0 ? [...months.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([month, monthTypes]) => {
      const typesInMonth = [...monthTypes.values()].sort((left, right) =>
        left.sourceMonth.localeCompare(right.sourceMonth) || left.name.localeCompare(right.name, "vi"));
      const monthTotal = typesInMonth.reduce((sum, type) => sum + type.amount, 0);
      const outstanding = Math.max(0, monthTotal - remainingPayment);
      remainingPayment = Math.max(0, remainingPayment - monthTotal);
      return outstanding > 0 ? [{ month, amount: outstanding, types: typesInMonth }] : [];
    }) : [];
    result.set(memberId, { amount, periods });
  }
  return result;
}
