import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { avatars, chargeTypes, clubs, fundTransactions, memberCharges, members } from "@/db/schema";
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
  searchParams: Promise<{ month?: string; tab?: string; balancePeriod?: string; balanceMonth?: string; balanceFromMonth?: string; balanceToMonth?: string }>;
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
  const currentMonth = todayInTimezone().slice(0, 7);
  const validMonth = (value?: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? value! : null;
  const balancePeriod = params.balancePeriod === "all" ? "all" : "range";
  const legacyBalanceMonth = validMonth(params.balanceMonth);
  const requestedBalanceFrom = validMonth(params.balanceFromMonth) ?? legacyBalanceMonth ?? currentMonth;
  const requestedBalanceTo = validMonth(params.balanceToMonth) ?? legacyBalanceMonth ?? currentMonth;
  const balanceFromMonth = requestedBalanceFrom <= requestedBalanceTo ? requestedBalanceFrom : requestedBalanceTo;
  const balanceToMonth = requestedBalanceFrom <= requestedBalanceTo ? requestedBalanceTo : requestedBalanceFrom;
  const monthStart = `${month}-01`;
  const nextMonthStart = `${shiftMonth(month, 1)}-01`;
  const balanceRangeStart = `${balanceFromMonth}-01`;
  const balanceRangeEnd = `${shiftMonth(balanceToMonth, 1)}-01`;
  const monthLabel = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart}T00:00:00Z`));
  const balanceFromLabel = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${balanceFromMonth}-01T00:00:00Z`));
  const balanceToLabel = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${balanceToMonth}-01T00:00:00Z`));

  const [club] = await db.select({
    name: clubs.name,
    logoUrl: clubs.logoUrl,
    updatedAt: clubs.updatedAt,
  }).from(clubs).where(eq(clubs.id, user.clubId)).limit(1);

  const memberRows = await db.select({
    id: members.id,
    code: members.code,
    name: members.fullName,
    status: members.status,
    avatarUpdatedAt: avatars.updatedAt,
  }).from(members).leftJoin(avatars, eq(members.id, avatars.memberId)).where(and(
    eq(members.clubId, user.clubId),
    eq(members.status, "ACTIVE"),
  )).orderBy(members.fullName);
  const visibleMembers = memberRows.filter((member) => viewAll || member.id === user.memberId);
  const visibleMemberIds = new Set(visibleMembers.map((member) => member.id));

  const chargeRows = await db.select({
    memberId: memberCharges.memberId,
    chargeTypeId: memberCharges.chargeTypeId,
    chargeDate: memberCharges.chargeDate,
    quantity: memberCharges.quantity,
    totalAmount: memberCharges.totalAmount,
  }).from(memberCharges)
    .where(and(
      eq(memberCharges.clubId, user.clubId),
      isNull(memberCharges.deletedAt),
      balancePeriod === "range" ? gte(memberCharges.chargeDate, balanceRangeStart) : undefined,
      balancePeriod === "range" ? lt(memberCharges.chargeDate, balanceRangeEnd) : undefined,
    ));
  const paymentRows = await db.select({
    memberId: fundTransactions.memberId,
    amount: fundTransactions.amount,
  }).from(fundTransactions)
    .where(and(
      eq(fundTransactions.clubId, user.clubId),
      eq(fundTransactions.kind, "MEMBER_PAYMENT"),
      isNull(fundTransactions.deletedAt),
      balancePeriod === "range" ? gte(fundTransactions.transactionDate, balanceRangeStart) : undefined,
      balancePeriod === "range" ? lt(fundTransactions.transactionDate, balanceRangeEnd) : undefined,
    ));
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
  const monthlyPaymentRows = await db.select({
    memberId: fundTransactions.memberId,
    total: sql<string>`SUM(${fundTransactions.amount})`,
  }).from(fundTransactions).where(and(
    eq(fundTransactions.clubId, user.clubId),
    eq(fundTransactions.kind, "MEMBER_PAYMENT"),
    gte(fundTransactions.transactionDate, monthStart),
    lt(fundTransactions.transactionDate, nextMonthStart),
    isNull(fundTransactions.deletedAt),
  )).groupBy(fundTransactions.memberId);

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
  const memberMonthPayments = new Map(
    monthlyPaymentRows
      .filter((row) => row.memberId && visibleMemberIds.has(row.memberId))
      .map((row) => [row.memberId!, Number(row.total)]),
  );
  const monthPaidTotal = [...memberMonthPayments.values()].reduce((sum, value) => sum + value, 0);

  const balanceCells = new Map<string, { quantity: number; total: number }>();
  const balanceCharges = new Map<string, number>();
  const balancePayments = new Map<string, number>();
  const balanceMonthTypeIds = new Map<string, Set<string>>();
  chargeRows.filter((row) => visibleMemberIds.has(row.memberId)).forEach((row) => {
    const rowMonth = row.chargeDate.slice(0, 7);
    const key = `${row.memberId}|${rowMonth}|${row.chargeTypeId}`;
    const current = balanceCells.get(key) ?? { quantity: 0, total: 0 };
    balanceCells.set(key, { quantity: current.quantity + row.quantity, total: current.total + row.totalAmount });
    balanceCharges.set(row.memberId, (balanceCharges.get(row.memberId) ?? 0) + row.totalAmount);
    const monthTypeIds = balanceMonthTypeIds.get(rowMonth) ?? new Set<string>();
    monthTypeIds.add(row.chargeTypeId);
    balanceMonthTypeIds.set(rowMonth, monthTypeIds);
  });
  paymentRows.filter((row) => row.memberId && visibleMemberIds.has(row.memberId)).forEach((row) => {
    balancePayments.set(row.memberId!, (balancePayments.get(row.memberId!) ?? 0) + row.amount);
  });
  const balanceGroups = [...balanceMonthTypeIds.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupMonth, typeIds]) => ({
      month: groupMonth,
      label: new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${groupMonth}-01T00:00:00Z`)),
      types: typeRows.filter((type) => typeIds.has(type.id)).map((type) => ({
        id: type.id,
        name: type.name,
        iconName: type.iconName,
        color: type.color,
        defaultAmount: type.defaultAmount,
        reportAsIcon: type.reportAsIcon,
      })),
    }));
  const balances = visibleMembers
    .map((member) => ({
      ...member,
      charged: balanceCharges.get(member.id) ?? 0,
      paid: balancePayments.get(member.id) ?? 0,
      balance: (balancePayments.get(member.id) ?? 0) - (balanceCharges.get(member.id) ?? 0),
      cells: balanceGroups.flatMap((group) => group.types.flatMap((type) => {
        const cell = balanceCells.get(`${member.id}|${group.month}|${type.id}`);
        return cell ? [{ month: group.month, typeId: type.id, ...cell }] : [];
      })),
    }));
  const debt = balances.reduce((sum, row) => sum + Math.max(-row.balance, 0), 0);
  const credit = balances.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);

  return (
    <>
      <PageHeader eyebrow="Phân tích" title="Báo cáo quỹ" description="Theo dõi phát sinh tháng và công nợ thành viên" />
      <section className="report-hero">
        <div><small>Còn phải đóng trong kỳ</small><strong>{formatMoney(debt)}</strong><span>{balancePeriod === "all" ? "Toàn bộ thời gian" : `${balanceFromLabel} – ${balanceToLabel}`} · {balances.filter((row) => row.balance < 0).length} người còn thiếu</span></div>
        <div><small>Tổng đóng dư trong kỳ</small><strong>{formatMoney(credit)}</strong><span>{balances.filter((row) => row.balance > 0).length} người đóng dư</span></div>
        <div><small>Tỷ lệ hoàn thành</small><strong>{balances.length ? Math.round((balances.filter((row) => row.balance >= 0).length / balances.length) * 100) : 0}%</strong><span>thành viên không còn nợ</span></div>
      </section>
      <ReportTabs
        initialTab={initialTab}
        monthly={<MonthlyReportCollection
          clubName={club?.name ?? "Đội bóng"}
          logoUrl={club?.logoUrl ? `/api/club-assets/logo?v=${club.updatedAt.getTime()}` : null}
          month={month}
          monthLabel={monthLabel}
          previousMonth={shiftMonth(month, -1)}
          nextMonth={shiftMonth(month, 1)}
          total={monthTotal}
          paidTotal={monthPaidTotal}
          types={monthlyTypes.map((type) => ({
            id: type.id, name: type.name, iconName: type.iconName, color: type.color,
            defaultAmount: type.defaultAmount, reportAsIcon: type.reportAsIcon,
            total: typeMonthTotals.get(type.id) ?? 0,
          }))}
          members={visibleMembers.map((member) => ({
            ...member,
            avatarVersion: member.avatarUpdatedAt?.getTime() ?? null,
            total: memberMonthTotals.get(member.id) ?? 0,
            paid: memberMonthPayments.get(member.id) ?? 0,
            cells: monthlyTypes.flatMap((type) => {
              const cell = monthlyCells.get(`${member.id}|${type.id}`);
              return cell ? [{ typeId: type.id, ...cell }] : [];
            }),
          }))}
        />}
        balances={<BalanceCollection
          clubName={club?.name ?? "Đội bóng"}
          logoUrl={club?.logoUrl ? `/api/club-assets/logo?v=${club.updatedAt.getTime()}` : null}
          rows={balances.map((row) => ({ ...row, avatarVersion: row.avatarUpdatedAt?.getTime() ?? null }))}
          groups={balanceGroups}
          period={balancePeriod}
          fromMonth={balanceFromMonth}
          toMonth={balanceToMonth}
          fromLabel={balanceFromLabel}
          toLabel={balanceToLabel}
        />}
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
