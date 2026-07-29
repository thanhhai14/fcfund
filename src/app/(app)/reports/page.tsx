import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chargeTypes, fundTransactions, memberCharges, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Báo cáo" };

export default async function ReportsPage() {
  const user = await requireUser();
  const viewAll = await can(PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW);
  if (!viewAll && !user.memberId) redirect("/dashboard");

  const memberRows = await db.select({ id: members.id, code: members.code, name: members.fullName, status: members.status })
    .from(members).where(eq(members.clubId, user.clubId)).orderBy(members.fullName);
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
    name: chargeTypes.name,
    iconName: chargeTypes.iconName,
    total: sql<string>`COALESCE(SUM(${memberCharges.totalAmount}), 0)`,
  }).from(chargeTypes)
    .leftJoin(memberCharges, and(eq(chargeTypes.id, memberCharges.chargeTypeId), isNull(memberCharges.deletedAt)))
    .where(eq(chargeTypes.clubId, user.clubId))
    .groupBy(chargeTypes.id);

  const charges = new Map(chargeRows.map((row) => [row.memberId, Number(row.total)]));
  const payments = new Map(paymentRows.map((row) => [row.memberId, Number(row.total)]));
  const balances = memberRows
    .map((member) => ({ ...member, charged: charges.get(member.id) ?? 0, paid: payments.get(member.id) ?? 0, balance: (payments.get(member.id) ?? 0) - (charges.get(member.id) ?? 0) }))
    .filter((member) => viewAll || member.id === user.memberId);
  const debt = balances.reduce((sum, row) => sum + Math.max(-row.balance, 0), 0);
  const credit = balances.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);

  return (
    <>
      <PageHeader eyebrow="Phân tích" title="Báo cáo quỹ" description="Tách biệt số tiền quỹ và công nợ thành viên" />
      <section className="report-hero">
        <div><small>Tổng công nợ</small><strong>{formatMoney(debt)}</strong><span>{balances.filter((row) => row.balance < 0).length} người còn nợ</span></div>
        <div><small>Tổng đóng dư</small><strong>{formatMoney(credit)}</strong><span>{balances.filter((row) => row.balance > 0).length} người có số dư</span></div>
        <div><small>Tỷ lệ hoàn thành</small><strong>{balances.length ? Math.round((balances.filter((row) => row.balance >= 0).length / balances.length) * 100) : 0}%</strong><span>thành viên không còn nợ</span></div>
      </section>
      <section className="report-columns">
        <article className="panel table-panel">
          <div className="panel-heading padded"><div><span className="eyebrow">Công nợ</span><h2>Theo thành viên</h2></div></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Thành viên</th><th className="align-right">Phải đóng</th><th className="align-right">Đã nộp</th><th className="align-right">Số dư</th></tr></thead>
            <tbody>{balances.sort((a, b) => a.balance - b.balance).map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.code}</small></td><td className="align-right">{formatMoney(row.charged)}</td><td className="align-right">{formatMoney(row.paid)}</td><td className="align-right"><strong className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</strong></td></tr>)}</tbody>
          </table></div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Cơ cấu</span><h2>Khoản phải thu theo loại</h2></div></div>
          <div className="type-report">
            {typeRows.map((row) => <div key={row.name}><span className="stat-icon green"><Icon name={row.iconName} /></span><span><strong>{row.name}</strong><small>Tổng phát sinh</small></span><b>{formatMoney(Number(row.total))}</b></div>)}
          </div>
        </article>
      </section>
    </>
  );
}
