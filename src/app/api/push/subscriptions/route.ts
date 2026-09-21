import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

type SubscriptionInput = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  platform?: string | null;
  userAgent?: string | null;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as SubscriptionInput | null;
  const endpoint = body?.endpoint?.trim();
  const p256dh = body?.keys?.p256dh?.trim();
  const auth = body?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "Invalid subscription" }, { status: 400 });
  }

  const [existing] = await db.select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  if (existing && existing.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Subscription belongs to another user" }, { status: 409 });
  }

  const now = new Date();
  await db.insert(pushSubscriptions).values({
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    expirationTime: typeof body?.expirationTime === "number" ? body.expirationTime : null,
    platform: body?.platform?.slice(0, 40) || null,
    userAgent: body?.userAgent?.slice(0, 1000) || request.headers.get("user-agent")?.slice(0, 1000) || null,
    enabled: true,
    lastSeenAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: {
      p256dh,
      auth,
      expirationTime: typeof body?.expirationTime === "number" ? body.expirationTime : null,
      platform: body?.platform?.slice(0, 40) || null,
      userAgent: body?.userAgent?.slice(0, 1000) || request.headers.get("user-agent")?.slice(0, 1000) || null,
      enabled: true,
      lastSeenAt: now,
      failureCount: 0,
      updatedAt: now,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: string } | null;
  const endpoint = body?.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ ok: false, error: "Invalid endpoint" }, { status: 400 });

  await db.update(pushSubscriptions)
    .set({ enabled: false, updatedAt: new Date() })
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));

  return NextResponse.json({ ok: true });
}
