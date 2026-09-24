import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { notificationEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let eventId = "";
  try {
    const body = await request.json() as { eventId?: unknown };
    eventId = typeof body.eventId === "string" ? body.eventId : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const now = new Date();
  await db.update(notificationEvents)
    .set({ readAt: now, updatedAt: now })
    .where(and(
      eq(notificationEvents.id, eventId),
      eq(notificationEvents.userId, user.id),
      eq(notificationEvents.clubId, user.clubId),
      isNull(notificationEvents.readAt),
    ));

  return NextResponse.json({ ok: true });
}
