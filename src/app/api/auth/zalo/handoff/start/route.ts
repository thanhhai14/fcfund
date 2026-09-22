import { NextResponse } from "next/server";
import { isZaloLoginEnabled } from "@/lib/zalo-auth";
import { createZaloAuthHandoff } from "@/lib/zalo-handoff";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isZaloLoginEnabled()) {
    return NextResponse.json(
      { error: "Zalo Login đang tắt." },
      { status: 404 },
    );
  }

  try {
    const handoff = await createZaloAuthHandoff();
    return NextResponse.json(
      {
        handoffId: handoff.id,
        verifier: handoff.clientSecret,
        authorizationUrl: handoff.authorizationUrl,
        expiresAt: handoff.expiresAt.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error(
      "Create Zalo handoff failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Không thể khởi tạo đăng nhập Zalo." },
      { status: 500 },
    );
  }
}
