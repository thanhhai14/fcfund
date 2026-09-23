import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clubs, members, notificationEvents, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { todayInTimezone } from "@/lib/format";
import {
  buildDebtTransferContent,
  buildVietQrPaymentUrl,
  detectBankAppPlatform,
  getVietQrBankApps,
} from "@/lib/vietqr";

export const dynamic = "force-dynamic";

const TEST_AMOUNT = 1_000;

function demoUrl(request: Request, id: string, payment?: string) {
  const url = new URL(`/notifications/demo/${id}`, request.url);
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
    login.searchParams.set("returnTo", `/notifications/demo/${id}`);
    return NextResponse.redirect(login, 302);
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.redirect(demoUrl(request, id, "invalid"), 302);
  }

  const requestUrl = new URL(request.url);
  const appId = requestUrl.searchParams.get("app")?.trim().toLowerCase() ?? "";
  const wantsJson = requestUrl.searchParams.get("format") === "json";
  const fail = (code: string, status = 400) => wantsJson
    ? NextResponse.json({ ok: false, error: code }, { status })
    : NextResponse.redirect(demoUrl(request, id, code), 302);

  if (!appId) {
    return fail("bank-app");
  }

  const [record] = await db
    .select({
      eventId: notificationEvents.id,
      clubName: clubs.name,
      timezone: clubs.timezone,
      bankCode: clubs.bankCode,
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

    const paymentDate = todayInTimezone(record.timezone);
    const transferContent = buildDebtTransferContent({
      clubName: record.clubName,
      memberName: record.memberName ?? record.userDisplayName,
      paymentDate,
    });

    const paymentUrl = buildVietQrPaymentUrl({
      appId,
      bankCode: record.bankCode,
      bankAccountNumber: record.bankAccountNumber,
      amount: TEST_AMOUNT,
      transferContent,
      bankAccountHolder: record.bankAccountHolder,
      returnUrl: demoUrl(request, id).toString(),
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, paymentUrl });
    }
    return NextResponse.redirect(paymentUrl, 302);
  } catch (error) {
    console.error("[debt-payment-test] Failed to prepare bank deeplink", {
      eventId: id,
      appId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return fail("failed", 502);
  }
}
