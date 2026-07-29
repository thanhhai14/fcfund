import Link from "next/link";
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

export const metadata = { title: "Báo cáo" };

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const viewAll = await can(PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW);
  if (!viewAll && !user.memberId) redirect("/dashboard");

  const requestedMonth = (await searchParams).month;
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
  }).from(members).where(eq(members.clubId, user.clubId)).orderBy(members.fullName);
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

  const monthlyTypeIds = new Set(monthlyRows.map((row) => row.chargeTypeId));
  const monthlyTypes = typeRows.filter((type) => type.isActive || monthlyTypeIds.has(type.id));
  const monthlyCells = new Map<string, { quantity: number; total: number }>();
  const memberMonthTotals = new Map<string, number>();
  const typeMonthTotals = new Map<string, number>();
  monthlyRows.forEach((row) => {
    if (!visibleMemberIds.has(row.memberId)) return;
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

      <article className="panel monthly-report">
        <div className="monthly-report-heading">
          <div>
            <span className="eyebrow">Phát sinh theo tháng</span>
            <h2>{monthLabel}</h2>
            <p>{formatMoney(monthTotal)} tổng khoản phải thu trong tháng</p>
          </div>
          <div className="month-controls">
            <Link href={`/reports?month=${shiftMonth(month, -1)}`} aria-label="Tháng trước">‹</Link>
            <form action="/reports" method="get">
              <input type="month" name="month" defaultValue={month} aria-label="Chọn tháng báo cáo" />
              <button className="button secondary small">Xem</button>
            </form>
            <Link href={`/reports?month=${shiftMonth(month, 1)}`} aria-label="Tháng sau">›</Link>
          </div>
        </div>
        <div className="monthly-table-wrap">
          <table className="monthly-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                {monthlyTypes.map((type) => (
                  <th key={type.id}>
                    <span className="monthly-type-icon" style={{ color: type.color ?? undefined }}>
                      <Icon name={type.iconName} />
                    </span>
                    <strong>{type.name}</strong>
                    <small>{type.reportAsIcon ? "Theo số lần" : formatMoney(type.defaultAmount)}</small>
                  </th>
                ))}
                <th className="align-right">Tổng tháng</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={member.id}>
                  <td><strong>{member.name}</strong><small>{member.code}{member.status === "INACTIVE" ? " · Đã nghỉ" : ""}</small></td>
                  {monthlyTypes.map((type) => {
                    const cell = monthlyCells.get(`${member.id}|${type.id}`);
                    return (
                      <td key={type.id}>
                        {!cell ? <span className="monthly-empty">—</span> : type.reportAsIcon ? (
                          <span
                            className="icon-count"
                            style={{ color: type.color ?? undefined }}
                            title={`${cell.quantity} lần · ${formatMoney(cell.total)}`}
                          >
                            {Array.from({ length: cell.quantity }, (_, index) => (
                              <Icon name={type.iconName} key={index} className="report-charge-icon" />
                            ))}
                          </span>
                        ) : (
                          <span className="monthly-money">
                            <strong>{formatMoney(cell.total)}</strong>
                            {cell.quantity > 1 && <small>{cell.quantity} lần</small>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="align-right"><strong>{formatMoney(memberMonthTotals.get(member.id) ?? 0)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Tổng cộng</strong></td>
                {monthlyTypes.map((type) => <td key={type.id}><strong>{formatMoney(typeMonthTotals.get(type.id) ?? 0)}</strong></td>)}
                <td className="align-right"><strong>{formatMoney(monthTotal)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>

      <section className="report-hero">
        <div><small>Tổng công nợ</small><strong>{formatMoney(debt)}</strong><span>{balances.filter((row) => row.balance < 0).length} người còn nợ</span></div>
        <div><small>Tổng đóng dư</small><strong>{formatMoney(credit)}</strong><span>{balances.filter((row) => row.balance > 0).length} người có số dư</span></div>
        <div><small>Tỷ lệ hoàn thành</small><strong>{balances.length ? Math.round((balances.filter((row) => row.balance >= 0).length / balances.length) * 100) : 0}%</strong><span>thành viên không còn nợ</span></div>
      </section>
      <section className="report-columns">
        <article className="panel table-panel">
          <div className="panel-heading padded"><div><span className="eyebrow">Công nợ lũy kế</span><h2>Theo thành viên</h2></div></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Thành viên</th><th className="align-right">Phải đóng</th><th className="align-right">Đã nộp</th><th className="align-right">Số dư</th></tr></thead>
            <tbody>{balances.sort((a, b) => a.balance - b.balance).map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.code}</small></td><td className="align-right">{formatMoney(row.charged)}</td><td className="align-right">{formatMoney(row.paid)}</td><td className="align-right"><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></td></tr>)}</tbody>
          </table></div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Cơ cấu lũy kế</span><h2>Khoản phải thu theo loại</h2></div></div>
          <div className="type-report">
            {typeRows.map((row) => <div key={row.id}><span className="stat-icon green" style={{ color: row.color ?? undefined }}><Icon name={row.iconName} /></span><span><strong>{row.name}</strong><small>Tổng phát sinh</small></span><b>{formatMoney(Number(row.total))}</b></div>)}
          </div>
        </article>
      </section>
    </>
  );
}
