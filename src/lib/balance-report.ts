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
