import type { Metadata } from "next";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { avatars, chargeTypes, clubs, fundTransactions, memberCharges, members } from "@/db/schema";
import { APP_NAME } from "@/lib/constants";
import { todayInTimezone } from "@/lib/format";
import { PublicReportCollection, type PublicReportGroup, type PublicReportRow } from "@/components/public-report-collection";

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

function validMonth(value?: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? value! : null;
}

export default async function PublicReportPage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string; fromMonth?: string; toMonth?: string }> }) {
  const params = await searchParams;
  if (params.tab && params.tab !== "balances") notFound();

  const currentMonth = todayInTimezone().slice(0, 7);
  const period = params.period === "all" ? "all" : "range";
  const requestedFrom = validMonth(params.fromMonth) ?? shiftMonth(currentMonth, -1);
  const requestedTo = validMonth(params.toMonth) ?? currentMonth;
  const fromMonth = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
  const toMonth = requestedFrom <= requestedTo ? requestedTo : requestedFrom;
  const rangeStart = `${fromMonth}-01`;
  const rangeEnd = `${shiftMonth(toMonth, 1)}-01`;

  const [club] = await db.select({ id: clubs.id, name: clubs.name, logoUrl: clubs.logoUrl, updatedAt: clubs.updatedAt }).from(clubs).limit(1);
  if (!club) notFound();

  const chargeDateFilters = period === "range" ? [gte(memberCharges.chargeDate, rangeStart), lt(memberCharges.chargeDate, rangeEnd)] : [];
  const paymentDateFilters = period === "range" ? [gte(fundTransactions.transactionDate, rangeStart), lt(fundTransactions.transactionDate, rangeEnd)] : [];
  const [memberRows, chargeRows, paymentRows, typeRows] = await Promise.all([
    db.select({ id: members.id, name: members.fullName, avatarUpdatedAt: avatars.updatedAt })
      .from(members)
      .leftJoin(avatars, eq(members.id, avatars.memberId))
      .where(and(eq(members.clubId, club.id), eq(members.status, "ACTIVE")))
      .orderBy(members.fullName),
    db.select({ memberId: memberCharges.memberId, chargeTypeId: memberCharges.chargeTypeId, chargeDate: memberCharges.chargeDate, quantity: memberCharges.quantity, totalAmount: memberCharges.totalAmount })
      .from(memberCharges)
      .where(and(eq(memberCharges.clubId, club.id), isNull(memberCharges.deletedAt), ...chargeDateFilters)),
    db.select({ memberId: fundTransactions.memberId, amount: fundTransactions.amount })
      .from(fundTransactions)
      .where(and(eq(fundTransactions.clubId, club.id), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt), ...paymentDateFilters)),
    db.select({ id: chargeTypes.id, name: chargeTypes.name, iconName: chargeTypes.iconName, color: chargeTypes.color })
      .from(chargeTypes)
      .where(eq(chargeTypes.clubId, club.id)),
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
  const groups: PublicReportGroup[] = [...monthTypeIds.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, typeIds]) => ({
    month,
    label: monthLabel(month),
    types: [...typeIds].map((typeId) => typesById.get(typeId)).filter((type): type is PublicReportGroup["types"][number] => Boolean(type)).sort((left, right) => left.name.localeCompare(right.name, "vi")),
  }));
  const paidByMember = new Map<string, number>();
  paymentRows.forEach((payment) => {
    if (payment.memberId) paidByMember.set(payment.memberId, (paidByMember.get(payment.memberId) ?? 0) + payment.amount);
  });
  const rows: PublicReportRow[] = memberRows.map((member) => {
    const memberCells = [...cells.values()].filter((cell) => cell.memberId === member.id);
    const charged = memberCells.reduce((sum, cell) => sum + cell.total, 0);
    const paid = paidByMember.get(member.id) ?? 0;
    return {
      id: member.id,
      name: member.name,
      avatarVersion: member.avatarUpdatedAt?.getTime() ?? null,
      charged,
      paid,
      balance: paid - charged,
      cells: memberCells,
    };
  }).sort((left, right) => left.balance - right.balance || left.name.localeCompare(right.name, "vi"));

  return <PublicReportCollection
    clubName={club.name}
    logoUrl={club.logoUrl ? `/api/public-report/logo?v=${club.updatedAt.getTime()}` : null}
    rows={rows}
    groups={groups}
    period={period}
    fromMonth={fromMonth}
    toMonth={toMonth}
    fromLabel={monthLabel(fromMonth)}
    toLabel={monthLabel(toMonth)}
    appName={APP_NAME}
  />;
}
