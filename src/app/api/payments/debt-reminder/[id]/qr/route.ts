import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clubs, debtReminders, members } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { currentMemberBalances } from "@/lib/current-member-balance";
import { todayInTimezone } from "@/lib/format";
import { buildDebtTransferContent, buildVietQrQuickLink } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user || !user.memberId || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [record] = await db
    .select({
      memberId: debtReminders.memberId,
      clubName: clubs.name,
      timezone: clubs.timezone,
      bankBin: clubs.bankBin,
      bankAccountNumber: clubs.bankAccountNumber,
      bankAccountHolder: clubs.bankAccountHolder,
      memberName: members.fullName,
    })
    .from(debtReminders)
    .innerJoin(clubs, eq(debtReminders.clubId, clubs.id))
    .innerJoin(members, eq(debtReminders.memberId, members.id))
    .where(and(
      eq(debtReminders.id, id),
      eq(debtReminders.clubId, user.clubId),
      eq(debtReminders.recipientUserId, user.id),
      eq(debtReminders.memberId, user.memberId),
    ))
    .limit(1);

  if (!record?.bankBin || !record.bankAccountNumber || !record.bankAccountHolder) {
    return new NextResponse("Payment configuration unavailable", { status: 409 });
  }

  const currentBalance = (await currentMemberBalances(user.clubId, record.timezone))
    .get(record.memberId) ?? 0;
  const amount = Math.max(0, -currentBalance);

  if (amount <= 0) {
    return new NextResponse("No outstanding debt", { status: 409 });
  }

  const transferContent = buildDebtTransferContent({
    clubName: record.clubName,
    memberName: record.memberName,
    paymentDate: todayInTimezone(record.timezone),
  });

  const qrUrl = buildVietQrQuickLink({
    bankBin: record.bankBin,
    bankAccountNumber: record.bankAccountNumber,
    amount,
    transferContent,
    bankAccountHolder: record.bankAccountHolder,
  });

  return NextResponse.redirect(qrUrl, 302);
}
