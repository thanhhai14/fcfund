import { NextResponse } from "next/server";
import {
  buildZaloAuthorizationUrl,
  createZaloCodeChallenge,
  createZaloCodeVerifier,
  createZaloOAuthState,
  getZaloConfig,
  isZaloLoginEnabled,
  ZALO_OAUTH_COOKIE_MAX_AGE,
  ZALO_OAUTH_STATE_COOKIE,
  ZALO_OAUTH_VERIFIER_COOKIE,
} from "@/lib/zalo-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isZaloLoginEnabled()) {
    return new NextResponse("Zalo Login đang tắt.", { status: 404 });
  }

  let config;
  try {
    config = getZaloConfig();
  } catch (error) {
    console.error("Zalo OAuth config error", error);
    return new NextResponse("Zalo Login chưa được cấu hình đầy đủ.", { status: 503 });
  }

  const state = createZaloOAuthState();
  const verifier = createZaloCodeVerifier();
  const challenge = createZaloCodeChallenge(verifier);

  const response = NextResponse.redirect(buildZaloAuthorizationUrl({
    appId: config.appId,
    redirectUri: config.redirectUri,
    state,
    codeChallenge: challenge,
  }));

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/zalo",
    maxAge: ZALO_OAUTH_COOKIE_MAX_AGE,
  };

  response.cookies.set(ZALO_OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(ZALO_OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);

  return response;
}
