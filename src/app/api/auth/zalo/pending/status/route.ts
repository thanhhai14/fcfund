import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, zaloLinkRequests } from "@/db/schema";
import { createSession } from "@/lib/auth";
import {
  readZaloPendingToken,
  ZALO_PENDING_COOKIE,
} from "@/lib/zalo-linking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const pending = await readZaloPendingToken(request.cookies.get(ZALO_PENDING_COOKIE)?.value);
  if (!pending) {
    return NextResponse.json(
      { status: "ERROR", message: "Phiên chờ duyệt Zalo không còn hợp lệ." },
      { status: 401 },
    );
  }

  const [linkRequest] = await db
    .select()
    .from(zaloLinkRequests)
    .where(and(
      eq(zaloLinkRequests.id, pending.requestId),
      eq(zaloLinkRequests.providerUserId, pending.providerUserId),
    ))
    .limit(1);

  if (!linkRequest) {
    return NextResponse.json(
      { status: "ERROR", message: "Không tìm thấy yêu cầu liên kết Zalo." },
      { status: 404 },
    );
  }

  if (linkRequest.status === "PENDING") {
    return NextResponse.json({ status: "PENDING" });
  }

  if (linkRequest.status === "REJECTED") {
    return NextResponse.json({
      status: "REJECTED",
      message: linkRequest.rejectionReason || "Yêu cầu liên kết Zalo đã bị Chủ Tịch Fifa từ chối.",
    });
  }

  if (!linkRequest.approvedUserId) {
    return NextResponse.json(
      { status: "ERROR", message: "Yêu cầu đã duyệt nhưng chưa có tài khoản FCFUND." },
      { status: 409 },
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.id, linkRequest.approvedUserId),
      eq(users.clubId, linkRequest.clubId),
      eq(users.isActive, true),
    ))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { status: "ERROR", message: "Tài khoản FCFUND được duyệt không còn hoạt động." },
      { status: 409 },
    );
  }

  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await createSession({
    sub: user.id,
    clubId: user.clubId,
    memberId: user.memberId ?? undefined,
    role: user.role,
  });

  const response = NextResponse.json({ status: "APPROVED", redirect: "/dashboard" });
  response.cookies.delete(ZALO_PENDING_COOKIE);
  return response;
}
