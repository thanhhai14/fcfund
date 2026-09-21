import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, pushSubscriptions, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { notifyDevice } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

function describeDevice(platform: string | null, userAgent: string | null) {
  const ua = userAgent ?? "";
  let device = "Thiết bị";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "macOS";
  else if (/Linux/i.test(ua)) device = "Linux";
  else if (platform === "ios") device = "iOS";
  else if (platform === "android") device = "Android";

  let browser = "";
  if (/EdgiOS|EdgA|Edg\//i.test(ua)) browser = "Edge";
  else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox\//i.test(ua)) browser = "Firefox";
  else if (/SamsungBrowser\//i.test(ua)) browser = "Samsung Internet";
  else if (/Safari\//i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) browser = "Safari";

  return browser ? `${device} · ${browser}` : device;
}

function safeDevice(row: typeof pushSubscriptions.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform,
    deviceLabel: row.deviceLabel,
    defaultLabel: describeDevice(row.platform, row.userAgent),
    enabled: row.enabled,
    lastSeenAt: row.lastSeenAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    failureCount: row.failureCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findTarget(subscriptionId: string, clubId: string) {
  const [row] = await db.select({
    subscription: pushSubscriptions,
    ownerClubId: users.clubId,
  })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .where(and(
      eq(pushSubscriptions.id, subscriptionId),
      eq(users.clubId, clubId),
    ))
    .limit(1);

  return row?.subscription ?? null;
}

function canManage(user: { id: string; role: string }, ownerUserId: string) {
  return user.id === ownerUserId || user.role === "ADMIN";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const selfRows = await db.select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .orderBy(desc(pushSubscriptions.lastSeenAt), desc(pushSubscriptions.createdAt));

  if (user.role !== "ADMIN") {
    return NextResponse.json({
      ok: true,
      selfDevices: selfRows.map(safeDevice),
    });
  }

  const [accountRows, memberRows, deviceRows] = await Promise.all([
    db.select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      active: users.isActive,
      memberId: users.memberId,
      memberName: members.fullName,
      memberStatus: members.status,
    })
      .from(users)
      .leftJoin(members, eq(users.memberId, members.id))
      .where(eq(users.clubId, user.clubId))
      .orderBy(users.displayName),
    db.select({
      id: members.id,
      fullName: members.fullName,
      userId: users.id,
      userDisplayName: users.displayName,
      userRole: users.role,
      userActive: users.isActive,
    })
      .from(members)
      .leftJoin(users, eq(users.memberId, members.id))
      .where(and(
        eq(members.clubId, user.clubId),
        eq(members.status, "ACTIVE"),
      ))
      .orderBy(members.fullName),
    db.select({ subscription: pushSubscriptions })
      .from(pushSubscriptions)
      .innerJoin(users, eq(pushSubscriptions.userId, users.id))
      .where(eq(users.clubId, user.clubId))
      .orderBy(desc(pushSubscriptions.lastSeenAt), desc(pushSubscriptions.createdAt)),
  ]);

  return NextResponse.json({
    ok: true,
    selfDevices: selfRows.map(safeDevice),
    adminUsers: accountRows,
    adminMembers: memberRows,
    adminDevices: deviceRows.map((row) => safeDevice(row.subscription)),
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    id?: string;
    enabled?: boolean;
    deviceLabel?: string | null;
  } | null;
  const id = body?.id?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "Thiếu thiết bị." }, { status: 400 });

  const target = await findTarget(id, user.clubId);
  if (!target) return NextResponse.json({ ok: false, error: "Không tìm thấy thiết bị." }, { status: 404 });
  if (!canManage(user, target.userId)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const update: {
    enabled?: boolean;
    deviceLabel?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (typeof body?.enabled === "boolean") update.enabled = body.enabled;
  if (body && "deviceLabel" in body) {
    const label = body.deviceLabel?.trim() ?? "";
    if (label.length > 120) {
      return NextResponse.json({ ok: false, error: "Tên thiết bị tối đa 120 ký tự." }, { status: 400 });
    }
    update.deviceLabel = label || null;
  }

  if (!("enabled" in (body ?? {})) && !(body && "deviceLabel" in body)) {
    return NextResponse.json({ ok: false, error: "Không có thay đổi." }, { status: 400 });
  }

  await db.update(pushSubscriptions)
    .set(update)
    .where(eq(pushSubscriptions.id, target.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "Thiếu thiết bị." }, { status: 400 });

  const target = await findTarget(id, user.clubId);
  if (!target) return NextResponse.json({ ok: false, error: "Không tìm thấy thiết bị." }, { status: 404 });
  if (!canManage(user, target.userId)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    id?: string;
    action?: string;
    endpoint?: string;
  } | null;

  if (body?.action === "identify") {
    const endpoint = body.endpoint?.trim();
    if (!endpoint) {
      return NextResponse.json({ ok: true, deviceId: null });
    }

    const [current] = await db.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, user.id),
      ))
      .limit(1);

    return NextResponse.json({ ok: true, deviceId: current?.id ?? null });
  }

  const id = body?.id?.trim();
  if (!id || body?.action !== "test") {
    return NextResponse.json({ ok: false, error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const target = await findTarget(id, user.clubId);
  if (!target) return NextResponse.json({ ok: false, error: "Không tìm thấy thiết bị." }, { status: 404 });
  if (!canManage(user, target.userId)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!target.enabled) {
    return NextResponse.json({ ok: false, error: "Thiết bị đang bị tắt." }, { status: 409 });
  }

  const label = target.deviceLabel || describeDevice(target.platform, target.userAgent);
  const result = await notifyDevice({
    clubId: user.clubId,
    userId: target.userId,
    subscriptionId: target.id,
    title: "Kiểm tra thông báo",
    body: `${label} đang nhận Push bình thường.`,
    url: "/settings",
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.status === "SKIPPED"
        ? "Máy chủ chưa cấu hình Web Push."
        : "Không gửi được tới thiết bị này. Trạng thái đã được cập nhật.",
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: `Đã gửi thử tới ${label}.` });
}
