import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import {
  markZaloHandoffConsumed,
  readZaloAuthHandoffForClient,
} from "@/lib/zalo-handoff";
import {
  createZaloLinkContextToken,
  createZaloPendingToken,
  ZALO_LINK_CONTEXT_COOKIE,
  ZALO_PENDING_COOKIE,
  zaloLinkCookieOptions,
  zaloPendingCookieOptions,
} from "@/lib/zalo-linking";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  handoffId: z.string().uuid(),
  verifier: z.string().min(32).max(128),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "ERROR", message: "Phiên Zalo handoff không hợp lệ." },
      { status: 400 },
    );
  }

  const handoff = await readZaloAuthHandoffForClient(
    parsed.data.handoffId,
    parsed.data.verifier,
  );

  if (!handoff) {
    return NextResponse.json(
      { status: "ERROR", message: "Không tìm thấy phiên Zalo handoff." },
      { status: 401 },
    );
  }

  if (handoff.status === "PENDING") {
    return NextResponse.json(
      { status: "PENDING" },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (handoff.status === "LINK_REQUIRED") {
    if (
      !handoff.providerUserId
      || !handoff.displayName
      || !handoff.clubId
      || !handoff.candidateUserId
    ) {
      return NextResponse.json(
        { status: "ERROR", message: "Phiên xác nhận thành viên chưa đầy đủ dữ liệu." },
        { status: 409 },
      );
    }

    const token = await createZaloLinkContextToken({
      providerUserId: handoff.providerUserId,
      displayName: handoff.displayName,
      pictureUrl: handoff.avatarUrl,
      clubId: handoff.clubId,
      candidateUserId: handoff.candidateUserId,
    });

    const response = NextResponse.json({
      status: "LINK_REQUIRED",
      redirect: "/zalo/link",
    });
    response.cookies.set(ZALO_LINK_CONTEXT_COOKIE, token, zaloLinkCookieOptions());
    response.cookies.delete(ZALO_PENDING_COOKIE);
    return response;
  }

  if (handoff.status === "APPROVAL_PENDING") {
    if (!handoff.linkRequestId || !handoff.providerUserId) {
      return NextResponse.json(
        { status: "ERROR", message: "Phiên chờ duyệt Zalo chưa đầy đủ dữ liệu." },
        { status: 409 },
      );
    }

    const token = await createZaloPendingToken({
      requestId: handoff.linkRequestId,
      providerUserId: handoff.providerUserId,
    });

    const response = NextResponse.json({
      status: "APPROVAL_PENDING",
      redirect: "/zalo/pending",
    });
    response.cookies.set(ZALO_PENDING_COOKIE, token, zaloPendingCookieOptions());
    response.cookies.delete(ZALO_LINK_CONTEXT_COOKIE);
    return response;
  }

  if (handoff.status === "READY") {
    if (!handoff.userId) {
      return NextResponse.json(
        { status: "ERROR", message: "Phiên Zalo đã xác thực nhưng chưa có user." },
        { status: 409 },
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.id, handoff.userId),
        eq(users.isActive, true),
      ))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { status: "FAILED", message: "Tài khoản FCFUND không còn hoạt động." },
        { status: 409 },
      );
    }

    const now = new Date();
    await db
      .update(users)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, user.id));

    await createSession({
      sub: user.id,
      clubId: user.clubId,
      memberId: user.memberId ?? undefined,
      role: user.role,
    });
    await markZaloHandoffConsumed(handoff.id);

    const response = NextResponse.json({
      status: "APPROVED",
      redirect: "/dashboard",
    });
    response.cookies.delete(ZALO_LINK_CONTEXT_COOKIE);
    response.cookies.delete(ZALO_PENDING_COOKIE);
    return response;
  }

  if (handoff.status === "CONSUMED") {
    return NextResponse.json({
      status: "CONSUMED",
      redirect: "/dashboard",
    });
  }

  return NextResponse.json(
    {
      status: "FAILED",
      message: handoff.failureMessage || "Đăng nhập Zalo không hoàn tất.",
    },
    { status: 409 },
  );
}
