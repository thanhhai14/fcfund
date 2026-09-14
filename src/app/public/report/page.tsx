import type { Metadata } from "next";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { db } from "@/db";
import { chargeTypes, clubs, fundTransactions, memberCharges, members } from "@/db/schema";
import { APP_NAME } from "@/lib/constants";
import { formatMoney, initials, todayInTimezone } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Công nợ lũy kế công khai",
  description: "Báo cáo các khoản phát sinh, tiền đã đóng và số dư còn lại của đội bóng.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    title: "Công nợ lũy kế công khai",
    description: "Báo cáo các khoản phát sinh, tiền đã đóng và số dư còn lại của đội bóng.",
  },
};

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

type PublicType = { id: string; name: string; iconName: string; color: string | null };
type PublicGroup = { month: string; label: string; types: PublicType[] };
type PublicRow = { id: string; name: string; charged: number; paid: number; balance: number; cells: Array<{ memberId: string; month: string; typeId: string; quantity: number; total: number }> };

function PublicBalanceCell({ type, quantity, total }: { type: PublicType; quantity: number; total: number }) {
  return <span className="public-report-cell-value"><strong>{formatMoney(total)}</strong><small style={{ color: type.color ?? undefined }}> (<Icon name={type.iconName} /> × {quantity})</small></span>;
}

export default async function PublicReportPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  if (params.tab && params.tab !== "balances") notFound();

  const currentMonth = todayInTimezone().slice(0, 7);
  const fromMonth = shiftMonth(currentMonth, -1);
  const rangeStart = `${fromMonth}-01`;
  const rangeEnd = `${shiftMonth(currentMonth, 1)}-01`;
  const [club] = await db.select({ id: clubs.id, name: clubs.name }).from(clubs).limit(1);
  if (!club) notFound();

  const [memberRows, chargeRows, paymentRows, typeRows] = await Promise.all([
    db.select({ id: members.id, name: members.fullName }).from(members).where(and(eq(members.clubId, club.id), eq(members.status, "ACTIVE"))).orderBy(members.fullName),
    db.select({ memberId: memberCharges.memberId, chargeTypeId: memberCharges.chargeTypeId, chargeDate: memberCharges.chargeDate, quantity: memberCharges.quantity, totalAmount: memberCharges.totalAmount }).from(memberCharges).where(and(eq(memberCharges.clubId, club.id), isNull(memberCharges.deletedAt), gte(memberCharges.chargeDate, rangeStart), lt(memberCharges.chargeDate, rangeEnd))),
    db.select({ memberId: fundTransactions.memberId, amount: fundTransactions.amount }).from(fundTransactions).where(and(eq(fundTransactions.clubId, club.id), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt), gte(fundTransactions.transactionDate, rangeStart), lt(fundTransactions.transactionDate, rangeEnd))),
    db.select({ id: chargeTypes.id, name: chargeTypes.name, iconName: chargeTypes.iconName, color: chargeTypes.color }).from(chargeTypes).where(eq(chargeTypes.clubId, club.id)),
  ]);

  const typesById = new Map(typeRows.map((type) => [type.id, type]));
  const cells = new Map<string, { memberId: string; month: string; typeId: string; quantity: number; total: number }>();
  const monthTypeIds = new Map<string, Set<string>>();
  chargeRows.forEach((charge) => {
    const month = charge.chargeDate.slice(0, 7);
    const key = `${charge.memberId}|${month}|${charge.chargeTypeId}`;
    const current = cells.get(key) ?? { memberId: charge.memberId, month, typeId: charge.chargeTypeId, quantity: 0, total: 0 };
    cells.set(key, { ...current, quantity: current.quantity + charge.quantity, total: current.total + charge.totalAmount });
    const typeIds = monthTypeIds.get(month) ?? new Set<string>();
    typeIds.add(charge.chargeTypeId);
    monthTypeIds.set(month, typeIds);
  });
  const groups: PublicGroup[] = [...monthTypeIds.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, typeIds]) => ({
    month,
    label: monthLabel(month),
    types: [...typeIds].map((typeId) => typesById.get(typeId)).filter((type): type is PublicType => Boolean(type)).sort((left, right) => left.name.localeCompare(right.name, "vi")),
  }));
  const paidByMember = new Map<string, number>();
  paymentRows.forEach((payment) => {
    if (payment.memberId) paidByMember.set(payment.memberId, (paidByMember.get(payment.memberId) ?? 0) + payment.amount);
  });
  const rows: PublicRow[] = memberRows.map((member) => {
    const memberCells = [...cells.values()].filter((cell) => cell.memberId === member.id);
    const charged = memberCells.reduce((sum, cell) => sum + cell.total, 0);
    const paid = paidByMember.get(member.id) ?? 0;
    return { id: member.id, name: member.name, charged, paid, balance: paid - charged, cells: memberCells };
  }).sort((left, right) => left.balance - right.balance || left.name.localeCompare(right.name, "vi"));
  const totalCharged = rows.reduce((sum, row) => sum + row.charged, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = totalPaid - totalCharged;

  return <main className="public-report-page">
    <header className="public-report-hero">
      <div className="public-report-brand"><span>{initials(club.name)}</span><div><small>BÁO CÁO CÔNG KHAI</small><h1>{club.name}</h1><p>{APP_NAME} · Công nợ lũy kế</p></div></div>
      <div className="public-report-period"><small>KỲ BÁO CÁO</small><strong>{monthLabel(fromMonth)} → {monthLabel(currentMonth)}</strong><span>Cập nhật theo dữ liệu hiện tại</span></div>
    </header>
    <section className="public-report-summary"><div><small>THÀNH VIÊN</small><strong>{rows.length}</strong></div><div><small>TỔNG PHÁT SINH</small><strong>{formatMoney(totalCharged)}</strong></div><div><small>ĐÃ ĐÓNG</small><strong>{formatMoney(totalPaid)}</strong></div><div><small>CÒN LẠI</small><strong className={totalBalance < 0 ? "money-out" : "money-in"}>{totalBalance > 0 ? "+" : ""}{formatMoney(totalBalance)}</strong></div></section>
    <p className="public-report-note"><Icon name="info" /> Đã đóng là tổng tiền thực nộp trong kỳ; các khoản phát sinh được nhóm theo từng tháng.</p>
    <section className="public-report-members" aria-label="Công nợ từng thành viên">
      {rows.map((row, index) => <article className="public-report-member" key={row.id}>
        <header><span className="public-report-rank">#{index + 1}</span><span className="public-report-avatar">{initials(row.name)}</span><strong>{row.name}</strong><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></header>
        <div className="public-report-months">{groups.map((group) => {
          const groupCells = group.types.map((type) => ({ type, cell: row.cells.find((cell) => cell.month === group.month && cell.typeId === type.id) })).filter((item): item is { type: PublicType; cell: PublicRow["cells"][number] } => Boolean(item.cell));
          return groupCells.length ? <section key={group.month}><h2>{group.label}</h2>{groupCells.map(({ type, cell }) => <p key={type.id}><span>{type.name}</span><PublicBalanceCell type={type} quantity={cell.quantity} total={cell.total} /></p>)}</section> : null;
        })}</div>
        <footer><span><small>Tổng</small><b>{formatMoney(row.charged)}</b></span><span><small>Đã đóng</small><b>{formatMoney(row.paid)}</b></span><span><small>Còn lại</small><b className={row.balance < 0 ? "money-out" : "money-in"}>{row.balance > 0 ? "+" : ""}{formatMoney(row.balance)}</b></span></footer>
      </article>)}
      {!rows.length && <p className="public-report-empty">Chưa có thành viên hoạt động.</p>}
    </section>
    <footer className="public-report-footer"><strong>{club.name}</strong><span>Báo cáo công khai · Không yêu cầu đăng nhập</span></footer>
  </main>;
}
