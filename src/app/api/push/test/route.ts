import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, pushSubscriptions, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

type TestPushInput = {
  body?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const input = await request.json().catch(() => null) as TestPushInput | null;
  const body = input?.body?.trim() ?? "";
  if (!body || body.length > 500) {
    return NextResponse.json(
      { ok: false, error: "Nội dung thông báo phải từ 1 đến 500 ký tự." },
      { status: 400 },
    );
  }

  const rows = await db.select({ userId: users.id })
    .from(users)
    .innerJoin(members, eq(users.memberId, members.id))
    .innerJoin(pushSubscriptions, and(
      eq(pushSubscriptions.userId, users.id),
      eq(pushSubscriptions.enabled, true),
    ))
    .where(and(
      eq(users.clubId, user.clubId),
      eq(users.isActive, true),
      eq(members.status, "ACTIVE"),
    ));

  const recipientIds = [...new Set(rows.map((row) => row.userId))];
  if (!recipientIds.length) {
    return NextResponse.json({
      ok: true,
      recipientCount: 0,
      message: "Không có thành viên nào đang có thiết bị đăng ký Push.",
    });
  }

  await notifyUsers({
    clubId: user.clubId,
    userIds: recipientIds,
    type: "TEST_NOTIFICATION",
    title: "Thông báo từ FCFUND",
    body,
    url: "/dashboard",
    entityType: "push_test",
    dedupeKey: `TEST_NOTIFICATION:BROADCAST:${user.id}:${Date.now()}`,
  });

  return NextResponse.json({
    ok: true,
    recipientCount: recipientIds.length,
  });
}
