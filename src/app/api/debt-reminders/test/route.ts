import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { notificationEvents, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dispatchEvent } from "@/lib/push-notifications";

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ ok: false, error: "Bạn cần đăng nhập." }, { status: 401 });
  if (actor.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Chỉ Admin được gửi nhắc nợ thử." }, { status: 403 });

  const input = await request.json().catch(() => null) as { userId?: string } | null;
  const recipientId = input?.userId ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(recipientId)) return NextResponse.json({ ok: false, error: "Hãy chọn một tài khoản nhận thông báo thử." }, { status: 400 });

  const [recipient] = await db.select({ id: users.id, name: users.displayName }).from(users)
    .where(and(eq(users.id, recipientId), eq(users.clubId, actor.clubId), eq(users.isActive, true))).limit(1);
  if (!recipient) return NextResponse.json({ ok: false, error: "Tài khoản nhận không tồn tại hoặc đã ngừng hoạt động." }, { status: 404 });

  const eventId = crypto.randomUUID();
  const [event] = await db.insert(notificationEvents).values({
    id: eventId,
    clubId: actor.clubId,
    userId: recipient.id,
    type: "DEBT_REMINDER_TEST",
    title: "[Mô phỏng] Nhắc đóng quỹ",
    body: "Đây là thông báo thử. Mở ứng dụng để xem màn hình nhắc nợ mẫu.",
    url: `/n/demo/${eventId}`,
    entityType: "debt_reminder_test",
    dedupeKey: `DEBT_REMINDER_TEST:${eventId}`,
  }).returning();

  try {
    await dispatchEvent(event);
  } catch {
    await db.update(notificationEvents).set({ status: "FAILED", updatedAt: new Date() }).where(eq(notificationEvents.id, event.id));
  }
  const [saved] = await db.select({ status: notificationEvents.status }).from(notificationEvents).where(eq(notificationEvents.id, event.id)).limit(1);
  return NextResponse.json({ ok: true, recipientName: recipient.name, pushStatus: saved?.status ?? "FAILED" });
}
