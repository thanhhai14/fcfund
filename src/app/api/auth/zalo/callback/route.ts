import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  exchangeZaloCode,
  fetchZaloProfile,
  getZaloConfig,
  isZaloLoginEnabled,
  ZALO_OAUTH_STATE_COOKIE,
  ZALO_OAUTH_VERIFIER_COOKIE,
} from "@/lib/zalo-auth";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function htmlResponse(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #17212b; padding: 24px; box-sizing: border-box; }
    main { width: min(520px, 100%); background: #fff; border: 1px solid #dde2e7; border-radius: 16px; padding: 28px; box-sizing: border-box; box-shadow: 0 16px 42px rgba(22, 35, 50, .08); }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { line-height: 1.55; }
    .ok { color: #08783e; font-weight: 700; }
    .error { color: #b42318; font-weight: 700; }
    .profile { display: flex; gap: 16px; align-items: center; margin: 22px 0; padding: 16px; background: #f8fafc; border-radius: 12px; }
    .profile img { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; background: #e8edf2; }
    dl { margin: 0; display: grid; grid-template-columns: 92px 1fr; gap: 8px 12px; min-width: 0; }
    dt { color: #687584; }
    dd { margin: 0; font-weight: 650; overflow-wrap: anywhere; }
    a { display: inline-flex; margin-top: 10px; padding: 10px 16px; border-radius: 9px; text-decoration: none; background: #06385f; color: #fff; font-weight: 700; }
    small { display: block; color: #687584; margin-top: 18px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'",
      },
    },
  );
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete(ZALO_OAUTH_STATE_COOKIE);
  response.cookies.delete(ZALO_OAUTH_VERIFIER_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!isZaloLoginEnabled()) {
    return htmlResponse(
      "Zalo Login đang tắt",
      '<h1>Zalo Login đang tắt</h1><p class="error">Tính năng chưa được bật trên môi trường này.</p><a href="/login">Quay lại đăng nhập</a>',
      404,
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const returnedState = request.nextUrl.searchParams.get("state")?.trim() ?? "";
  const expectedState = request.cookies.get(ZALO_OAUTH_STATE_COOKIE)?.value ?? "";
  const verifier = request.cookies.get(ZALO_OAUTH_VERIFIER_COOKIE)?.value ?? "";

  if (!code) {
    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth chưa hoàn tất",
      '<h1>Chưa nhận được mã xác thực Zalo</h1><p class="error">Bạn có thể đã hủy đăng nhập hoặc Zalo không trả authorization code.</p><a href="/login">Quay lại đăng nhập</a>',
      400,
    ));
  }

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth không hợp lệ",
      '<h1>Phiên Zalo OAuth không hợp lệ</h1><p class="error">State không khớp hoặc phiên đăng nhập đã hết hạn. Hãy bắt đầu lại từ trang đăng nhập.</p><a href="/login">Thử lại</a>',
      400,
    ));
  }

  if (!verifier) {
    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth hết hạn",
      '<h1>Phiên Zalo OAuth đã hết hạn</h1><p class="error">Không còn PKCE verifier trên thiết bị này. Hãy bắt đầu lại.</p><a href="/login">Thử lại</a>',
      400,
    ));
  }

  try {
    const config = getZaloConfig();
    const accessToken = await exchangeZaloCode({
      code,
      codeVerifier: verifier,
      appId: config.appId,
      appSecret: config.appSecret,
    });

    const profile = await fetchZaloProfile(accessToken);
    const avatar = profile.pictureUrl
      ? `<img src="${escapeHtml(profile.pictureUrl)}" alt="">`
      : "";

    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth PoC thành công",
      `<p class="ok">✓ OAuth Zalo hoạt động thành công</p>
<h1>Đã nhận được Zalo profile</h1>
<p>PoC chỉ xác minh OAuth. FCFUND chưa lưu profile này và chưa liên kết với tài khoản nội bộ.</p>
<div class="profile">
  ${avatar}
  <dl>
    <dt>Zalo ID</dt><dd>${escapeHtml(profile.id)}</dd>
    <dt>Tên</dt><dd>${escapeHtml(profile.name)}</dd>
  </dl>
</div>
<a href="/login">Quay lại đăng nhập</a>
<small>Access token và refresh token không được lưu vào cơ sở dữ liệu trong PoC này.</small>`,
    ));
  } catch (error) {
    console.error("Zalo OAuth PoC callback failed", error instanceof Error ? error.message : "Unknown error");
    const message = error instanceof Error ? error.message : "Không xác định được lỗi Zalo OAuth.";

    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth thất bại",
      `<h1>Không hoàn tất được Zalo OAuth</h1><p class="error">${escapeHtml(message)}</p><p>Kiểm tra App ID, Secret Key, callback URL và trạng thái ứng dụng trên Zalo Developer.</p><a href="/login">Thử lại</a>`,
      502,
    ));
  }
}
