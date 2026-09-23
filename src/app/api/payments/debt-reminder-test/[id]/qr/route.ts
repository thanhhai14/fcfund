import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clubs, members, notificationEvents, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { todayInTimezone } from "@/lib/format";
import { buildDebtTransferContent, buildVietQrQuickLink } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

const TEST_AMOUNT = 1_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [record] = await db
    .select({
      clubName: clubs.name,
      timezone: clubs.timezone,
      bankBin: clubs.bankBin,
      bankAccountNumber: clubs.bankAccountNumber,
      bankAccountHolder: clubs.bankAccountHolder,
      memberName: members.fullName,
      userDisplayName: users.displayName,
    })
    .from(notificationEvents)
    .innerJoin(users, eq(notificationEvents.userId, users.id))
    .innerJoin(clubs, eq(notificationEvents.clubId, clubs.id))
    .leftJoin(members, eq(users.memberId, members.id))
    .where(and(
      eq(notificationEvents.id, id),
      eq(notificationEvents.clubId, user.clubId),
      eq(notificationEvents.userId, user.id),
      eq(notificationEvents.type, "DEBT_REMINDER_TEST"),
    ))
    .limit(1);

  if (!record?.bankBin || !record.bankAccountNumber || !record.bankAccountHolder) {
    return new NextResponse("Payment configuration unavailable", { status: 409 });
  }

  const transferContent = buildDebtTransferContent({
    clubName: record.clubName,
    memberName: record.memberName ?? record.userDisplayName,
    paymentDate: todayInTimezone(record.timezone),
  });

  const qrUrl = buildVietQrQuickLink({
    bankBin: record.bankBin,
    bankAccountNumber: record.bankAccountNumber,
    amount: TEST_AMOUNT,
    transferContent,
    bankAccountHolder: record.bankAccountHolder,
  });

  return NextResponse.redirect(qrUrl, 302);
}
