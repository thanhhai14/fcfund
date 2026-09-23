import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clubs, debtReminders, members } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { currentMemberBalances } from "@/lib/current-member-balance";
import { todayInTimezone } from "@/lib/format";
import {
  buildDebtTransferContent,
  buildVietQrPaymentUrl,
  detectBankAppPlatform,
  getVietQrBankApps,
} from "@/lib/vietqr";

export const dynamic = "force-dynamic";

function reminderUrl(request: Request, id: string, payment?: string) {
  const url = new URL(`/notifications/${id}`, request.url);
  if (payment) url.searchParams.set("payment", payment);
  return url;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", `/notifications/${id}`);
    return NextResponse.redirect(login, 302);
  }

  if (!/^[0-9a-f-]{36}$/i.test(id) || !user.memberId) {
    return NextResponse.redirect(reminderUrl(request, id, "invalid"), 302);
  }

  const requestUrl = new URL(request.url);
  const appId = requestUrl.searchParams.get("app")?.trim().toLowerCase() ?? "";
  const wantsJson = requestUrl.searchParams.get("format") === "json";
  const fail = (code: string, status = 400) => wantsJson
    ? NextResponse.json({ ok: false, error: code }, { status })
    : NextResponse.redirect(reminderUrl(request, id, code), 302);

  if (!appId) {
    return fail("bank-app");
  }

  const [record] = await db
    .select({
      memberId: debtReminders.memberId,
      recipientUserId: debtReminders.recipientUserId,
      clubName: clubs.name,
      timezone: clubs.timezone,
      bankCode: clubs.bankCode,
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

  if (!record) {
    return fail("invalid", 404);
  }

  if (!record.bankCode || !record.bankAccountNumber || !record.bankAccountHolder) {
    return fail("not-configured", 409);
  }

  const platform = detectBankAppPlatform(request.headers.get("user-agent") ?? "");
  if (!platform) {
    return fail("unsupported-device");
  }

  try {
    const apps = await getVietQrBankApps(platform);
    if (!apps.some((app) => app.appId === appId)) {
      return fail("bank-app");
    }

    const currentBalance = (await currentMemberBalances(user.clubId, record.timezone))
      .get(record.memberId) ?? 0;
    const amount = Math.max(0, -currentBalance);
    if (amount <= 0) {
      return fail("settled", 409);
    }

    const paymentDate = todayInTimezone(record.timezone);
    const transferContent = buildDebtTransferContent({
      clubName: record.clubName,
      memberName: record.memberName,
      paymentDate,
    });
    const returnUrl = reminderUrl(request, id).toString();

    const paymentUrl = buildVietQrPaymentUrl({
      appId,
      bankCode: record.bankCode,
      bankAccountNumber: record.bankAccountNumber,
      amount,
      transferContent,
      bankAccountHolder: record.bankAccountHolder,
      returnUrl,
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, paymentUrl });
    }
    return NextResponse.redirect(paymentUrl, 302);
  } catch (error) {
    console.error("[debt-payment] Failed to prepare bank deeplink", {
      reminderId: id,
      appId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return fail("failed", 502);
  }
}
