import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getVietQrBankApps } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const platform = new URL(request.url).searchParams.get("platform");
  if (platform !== "android" && platform !== "ios") {
    return NextResponse.json(
      { ok: false, error: "Thiết bị này chưa hỗ trợ mở ứng dụng ngân hàng trực tiếp." },
      { status: 400 },
    );
  }

  try {
    const apps = await getVietQrBankApps(platform);
    return NextResponse.json(
      { ok: true, apps },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (error) {
    console.error("[bank-apps] VietQR app list failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      platform,
    });
    return NextResponse.json(
      { ok: false, error: "Chưa tải được danh sách ứng dụng ngân hàng. Vui lòng thử lại." },
      { status: 502 },
    );
  }
}
