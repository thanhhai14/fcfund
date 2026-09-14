export function getBalanceReportMonth(chargeDate: string, reportNextMonth: boolean) {
  const sourceMonth = chargeDate.slice(0, 7);
  if (!reportNextMonth) return sourceMonth;

  const date = new Date(`${sourceMonth}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

export function isBalanceReportMonthInRange(month: string, fromMonth: string, toMonth: string) {
  return month >= fromMonth && month <= toMonth;
}

export function balanceCellColumnId(reportMonth: string, typeId: string, sourceMonth: string) {
  return `cell:${reportMonth}:${sourceMonth}:${typeId}`;
}

export function balanceSourceMonthLabel(month: string) {
  return `Tháng ${Number(month.slice(5, 7))}`;
}

export function compareBalanceTypes(reportMonth: string, left: { name: string; calculation: "MONTHLY" | "OCCURRENCE"; reportNextMonth: boolean; sourceMonth: string }, right: { name: string; calculation: "MONTHLY" | "OCCURRENCE"; reportNextMonth: boolean; sourceMonth: string }) {
  const leftIsCurrentMonthly = left.calculation === "MONTHLY" && left.sourceMonth === reportMonth;
  const rightIsCurrentMonthly = right.calculation === "MONTHLY" && right.sourceMonth === reportMonth;
  if (leftIsCurrentMonthly !== rightIsCurrentMonthly) return leftIsCurrentMonthly ? 1 : -1;
  return left.sourceMonth.localeCompare(right.sourceMonth) || left.name.localeCompare(right.name, "vi");
}
