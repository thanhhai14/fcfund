import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const baseDedupeKey = `TEST_NOTIFICATION:${user.id}:${Date.now()}`;
  await notifyUsers({
    clubId: user.clubId,
    userIds: [user.id],
    type: "TEST_NOTIFICATION",
    title: "Thông báo thử FCFUND",
    body: "Nếu bạn thấy thông báo này, Web Push đang hoạt động bình thường trên thiết bị.",
    url: "/settings",
    entityType: "push_test",
    dedupeKey: baseDedupeKey,
  });

  const [event] = await db.select({ status: notificationEvents.status })
    .from(notificationEvents)
    .where(eq(notificationEvents.dedupeKey, `${baseDedupeKey}:${user.id}`))
    .limit(1);

  return NextResponse.json({
    ok: true,
    status: event?.status ?? "SKIPPED",
  });
}
