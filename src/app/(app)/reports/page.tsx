import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chargeTypes, fundTransactions, memberCharges, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { BalanceCollection, MonthlyReportCollection } from "@/components/report-collections";
import { ReportTabs, type ReportTab } from "@/components/report-tabs";

export const metadata = { title: "Báo cáo" };

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const viewAll = await can(PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW);
  if (!viewAll && !user.memberId) redirect("/dashboard");

  const params = await searchParams;
  const requestedMonth = params.month;
  const initialTab: ReportTab = ["monthly", "balances", "structure"].includes(params.tab ?? "")
    ? params.tab as ReportTab
    : "monthly";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth ?? "")
    ? requestedMonth!
    : todayInTimezone().slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonthStart = `${shiftMonth(month, 1)}-01`;
  const monthLabel = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart}T00:00:00Z`));

  const memberRows = await db.select({
    id: members.id,
    code: members.code,
    name: members.fullName,
    status: members.status,
  }).from(members).where(and(
    eq(members.clubId, user.clubId),
    eq(members.status, "ACTIVE"),
  )).orderBy(members.fullName);
  const visibleMembers = memberRows.filter((member) => viewAll || member.id === user.memberId);
  const visibleMemberIds = new Set(visibleMembers.map((member) => member.id));

  const chargeRows = await db.select({
    memberId: memberCharges.memberId,
    total: sql<string>`SUM(${memberCharges.totalAmount})`,
  }).from(memberCharges)
    .where(and(eq(memberCharges.clubId, user.clubId), isNull(memberCharges.deletedAt)))
    .groupBy(memberCharges.memberId);
  const paymentRows = await db.select({
    memberId: fundTransactions.memberId,
    total: sql<string>`SUM(${fundTransactions.amount})`,
  }).from(fundTransactions)
    .where(and(eq(fundTransactions.clubId, user.clubId), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt)))
    .groupBy(fundTransactions.memberId);
  const typeRows = await db.select({
    id: chargeTypes.id,
    name: chargeTypes.name,
    iconName: chargeTypes.iconName,
    color: chargeTypes.color,
    defaultAmount: chargeTypes.defaultAmount,
    reportAsIcon: chargeTypes.reportAsIcon,
    isActive: chargeTypes.isActive,
    total: sql<string>`COALESCE(SUM(${memberCharges.totalAmount}), 0)`,
  }).from(chargeTypes)
    .leftJoin(memberCharges, and(eq(chargeTypes.id, memberCharges.chargeTypeId), isNull(memberCharges.deletedAt)))
    .where(eq(chargeTypes.clubId, user.clubId))
    .groupBy(chargeTypes.id)
    .orderBy(chargeTypes.name);

  const monthlyRows = await db.select({
    memberId: memberCharges.memberId,
    chargeTypeId: memberCharges.chargeTypeId,
    quantity: memberCharges.quantity,
    totalAmount: memberCharges.totalAmount,
  }).from(memberCharges).where(and(
    eq(memberCharges.clubId, user.clubId),
    gte(memberCharges.chargeDate, monthStart),
    lt(memberCharges.chargeDate, nextMonthStart),
    isNull(memberCharges.deletedAt),
  ));

  const visibleMonthlyRows = monthlyRows.filter((row) => visibleMemberIds.has(row.memberId));
  const monthlyTypeIds = new Set(visibleMonthlyRows.map((row) => row.chargeTypeId));
  const monthlyTypes = typeRows.filter((type) => type.isActive || monthlyTypeIds.has(type.id));
  const monthlyCells = new Map<string, { quantity: number; total: number }>();
  const memberMonthTotals = new Map<string, number>();
  const typeMonthTotals = new Map<string, number>();
  visibleMonthlyRows.forEach((row) => {
    const key = `${row.memberId}|${row.chargeTypeId}`;
    const current = monthlyCells.get(key) ?? { quantity: 0, total: 0 };
    monthlyCells.set(key, {
      quantity: current.quantity + row.quantity,
      total: current.total + row.totalAmount,
    });
    memberMonthTotals.set(row.memberId, (memberMonthTotals.get(row.memberId) ?? 0) + row.totalAmount);
    typeMonthTotals.set(row.chargeTypeId, (typeMonthTotals.get(row.chargeTypeId) ?? 0) + row.totalAmount);
  });
  const monthTotal = [...memberMonthTotals.values()].reduce((sum, value) => sum + value, 0);

  const charges = new Map(chargeRows.map((row) => [row.memberId, Number(row.total)]));
  const payments = new Map(paymentRows.map((row) => [row.memberId, Number(row.total)]));
  const balances = visibleMembers
    .map((member) => ({
      ...member,
      charged: charges.get(member.id) ?? 0,
      paid: payments.get(member.id) ?? 0,
      balance: (payments.get(member.id) ?? 0) - (charges.get(member.id) ?? 0),
    }));
  const debt = balances.reduce((sum, row) => sum + Math.max(-row.balance, 0), 0);
  const credit = balances.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);

  return (
    <>
      <PageHeader eyebrow="Phân tích" title="Báo cáo quỹ" description="Theo dõi phát sinh tháng và công nợ thành viên" />
      <section className="report-hero">
        <div><small>Tổng công nợ</small><strong>{formatMoney(debt)}</strong><span>{balances.filter((row) => row.balance < 0).length} người còn nợ</span></div>
        <div><small>Tổng đóng dư</small><strong>{formatMoney(credit)}</strong><span>{balances.filter((row) => row.balance > 0).length} người có số dư</span></div>
        <div><small>Tỷ lệ hoàn thành</small><strong>{balances.length ? Math.round((balances.filter((row) => row.balance >= 0).length / balances.length) * 100) : 0}%</strong><span>thành viên không còn nợ</span></div>
      </section>
      <ReportTabs
        initialTab={initialTab}
        monthly={<MonthlyReportCollection
          month={month}
          monthLabel={monthLabel}
          previousMonth={shiftMonth(month, -1)}
          nextMonth={shiftMonth(month, 1)}
          total={monthTotal}
          types={monthlyTypes.map((type) => ({
            id: type.id, name: type.name, iconName: type.iconName, color: type.color,
            defaultAmount: type.defaultAmount, reportAsIcon: type.reportAsIcon,
            total: typeMonthTotals.get(type.id) ?? 0,
          }))}
          members={visibleMembers.map((member) => ({
            ...member,
            total: memberMonthTotals.get(member.id) ?? 0,
            cells: monthlyTypes.flatMap((type) => {
              const cell = monthlyCells.get(`${member.id}|${type.id}`);
              return cell ? [{ typeId: type.id, ...cell }] : [];
            }),
          }))}
        />}
        balances={<BalanceCollection rows={balances} />}
        structure={<article className="panel report-structure-panel">
          <div className="panel-heading"><div><span className="eyebrow">Cơ cấu lũy kế</span><h2>Khoản phải thu theo loại</h2></div></div>
          <div className="type-report">
            {typeRows.map((row) => <div key={row.id}><span className="stat-icon green" style={{ color: row.color ?? undefined }}><Icon name={row.iconName} /></span><span><strong>{row.name}</strong><small>Tổng phát sinh</small></span><b>{formatMoney(Number(row.total))}</b></div>)}
          </div>
        </article>}
      />
    </>
  );
}
