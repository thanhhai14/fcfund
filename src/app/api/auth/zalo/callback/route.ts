import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authIdentities, users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import {
  exchangeZaloCode,
  fetchZaloProfile,
  getZaloConfig,
  isZaloLoginEnabled,
  ZaloTokenExchangeError,
  ZALO_ANDROID_READY_COOKIE,
  ZALO_ANDROID_READY_MAX_AGE,
  ZALO_OAUTH_STATE_COOKIE,
  ZALO_OAUTH_VERIFIER_COOKIE,
} from "@/lib/zalo-auth";
import {
  findPendingZaloAuthHandoffByState,
  markZaloHandoffApprovalPending,
  markZaloHandoffFailed,
  markZaloHandoffLinkRequired,
  markZaloHandoffReady,
} from "@/lib/zalo-handoff";
import {
  createOrReuseZaloLinkRequest,
  createZaloLinkContextToken,
  createZaloPendingToken,
  findBestZaloCandidate,
  findLinkedZaloUser,
  findPendingZaloRequest,
  notifyZaloLinkRequestAdmins,
  resolveZaloClubId,
  ZALO_LINK_CONTEXT_COOKIE,
  ZALO_PENDING_COOKIE,
  zaloLinkCookieOptions,
  zaloPendingCookieOptions,
} from "@/lib/zalo-linking";

export const dynamic = "force-dynamic";

const ZALO_14019_RETRY_COOKIE = "zalo_14019_retry";
const ZALO_14019_RETRY_MAX_AGE = 2 * 60;

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
</head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:680px;margin:auto">
  ${body}
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

function handoffCompleteResponse(request: NextRequest, message: string) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (/Android/i.test(userAgent)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return htmlResponse(
    "Đã xác thực Zalo",
    `<h1>Đã xác thực Zalo</h1><p>${escapeHtml(message)}</p><p>Bạn có thể quay lại ứng dụng Trại Làng FC. Ứng dụng sẽ tự tiếp tục.</p>`,
  );
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete(ZALO_OAUTH_STATE_COOKIE);
  response.cookies.delete(ZALO_OAUTH_VERIFIER_COOKIE);
  return response;
}

function redirectWithPendingCookie(request: NextRequest, token: string) {
  const response = NextResponse.redirect(new URL("/zalo/pending", request.url));
  response.cookies.set(ZALO_PENDING_COOKIE, token, zaloPendingCookieOptions());
  response.cookies.delete(ZALO_LINK_CONTEXT_COOKIE);
  response.cookies.delete(ZALO_14019_RETRY_COOKIE);
  markAndroidZaloReady(response, request);
  return clearOAuthCookies(response);
}

function clearZalo14019RetryCookie(response: NextResponse) {
  response.cookies.delete(ZALO_14019_RETRY_COOKIE);
  return response;
}

function isAndroidRequest(request: NextRequest) {
  return /Android/i.test(request.headers.get("user-agent") ?? "");
}

function markAndroidZaloReady(response: NextResponse, request: NextRequest) {
  if (!isAndroidRequest(request)) return response;

  response.cookies.set(ZALO_ANDROID_READY_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ZALO_ANDROID_READY_MAX_AGE,
  });
  return response;
}

function clearAndroidZaloReady(response: NextResponse) {
  response.cookies.delete(ZALO_ANDROID_READY_COOKIE);
  return response;
}

function recoverAndroidZalo14019(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?zaloRetry=14019", request.url));
  response.cookies.set(ZALO_14019_RETRY_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ZALO_14019_RETRY_MAX_AGE,
  });
  clearAndroidZaloReady(response);
  return clearOAuthCookies(response);
}

export async function GET(request: NextRequest) {
  if (!isZaloLoginEnabled()) {
    return htmlResponse(
      "Zalo Login đang tắt",
      '<h1>Zalo Login đang tắt</h1><p>Tính năng chưa được bật trên môi trường này.</p><a href="/login">Quay lại đăng nhập</a>',
      404,
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const returnedState = request.nextUrl.searchParams.get("state")?.trim() ?? "";
  const expectedState = request.cookies.get(ZALO_OAUTH_STATE_COOKIE)?.value ?? "";
  const cookieVerifier = request.cookies.get(ZALO_OAUTH_VERIFIER_COOKIE)?.value ?? "";

  const handoff = returnedState
    ? await findPendingZaloAuthHandoffByState(returnedState)
    : null;
  const verifier = handoff?.pkceVerifier ?? cookieVerifier;

  if (!code) {
    if (handoff) {
      await markZaloHandoffFailed(handoff.id, "Không nhận được mã xác thực từ Zalo.");
    }
    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth chưa hoàn tất",
      '<h1>Chưa nhận được mã xác thực Zalo</h1><p>Bạn có thể đã hủy đăng nhập.</p><a href="/login">Quay lại đăng nhập</a>',
      400,
    ));
  }

  if (!handoff && (!returnedState || !expectedState || returnedState !== expectedState)) {
    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth không hợp lệ",
      '<h1>Phiên Zalo OAuth không hợp lệ</h1><p>State không khớp hoặc phiên đã hết hạn.</p><a href="/login">Thử lại</a>',
      400,
    ));
  }

  if (!verifier) {
    if (handoff) {
      await markZaloHandoffFailed(handoff.id, "PKCE verifier của phiên Zalo không còn hợp lệ.");
    }
    return clearOAuthCookies(htmlResponse(
      "Zalo OAuth hết hạn",
      '<h1>Phiên Zalo OAuth đã hết hạn</h1><p>Không còn PKCE verifier trên thiết bị này.</p><a href="/login">Thử lại</a>',
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

    const linked = await findLinkedZaloUser(profile.id);
    if (linked) {
      if (!linked.isActive) {
        if (handoff) {
          await markZaloHandoffFailed(handoff.id, "Tài khoản FCFUND đã bị khóa.");
        }
        return clearOAuthCookies(htmlResponse(
          "Tài khoản FCFUND bị khóa",
          '<h1>Tài khoản FCFUND đã bị khóa</h1><p>Vui lòng liên hệ Chủ Tịch Fifa.</p><a href="/login">Quay lại</a>',
          403,
        ));
      }

      const now = new Date();
      await Promise.all([
        db.update(authIdentities)
          .set({
            displayName: profile.name,
            avatarUrl: profile.pictureUrl,
            lastLoginAt: now,
            updatedAt: now,
          })
          .where(eq(authIdentities.id, linked.identityId)),
        db.update(users).set({ lastLoginAt: now }).where(eq(users.id, linked.userId)),
      ]);

      if (handoff) {
        await markZaloHandoffReady(handoff.id, linked.userId, profile);
        return clearOAuthCookies(handoffCompleteResponse(request, "Tài khoản FCFUND đã được nhận diện thành công."));
      }

      await createSession({
        sub: linked.userId,
        clubId: linked.clubId,
        memberId: linked.memberId ?? undefined,
        role: linked.role,
      });

      const response = NextResponse.redirect(new URL("/dashboard", request.url));
      response.cookies.delete(ZALO_LINK_CONTEXT_COOKIE);
      response.cookies.delete(ZALO_PENDING_COOKIE);
      clearZalo14019RetryCookie(response);
      markAndroidZaloReady(response, request);
      return clearOAuthCookies(response);
    }

    const pending = await findPendingZaloRequest(profile.id);
    if (pending) {
      if (handoff) {
        await markZaloHandoffApprovalPending({
          id: handoff.id,
          profile,
          clubId: pending.clubId,
          linkRequestId: pending.id,
        });
        return clearOAuthCookies(handoffCompleteResponse(
          request,
          "Yêu cầu liên kết của bạn đang chờ Chủ Tịch Fifa duyệt.",
        ));
      }

      const pendingToken = await createZaloPendingToken({
        requestId: pending.id,
        providerUserId: profile.id,
      });
      return redirectWithPendingCookie(request, pendingToken);
    }

    const clubId = await resolveZaloClubId();
    const candidate = await findBestZaloCandidate(clubId, profile.name);

    if (candidate) {
      if (handoff) {
        await markZaloHandoffLinkRequired({
          id: handoff.id,
          profile,
          clubId,
          candidateUserId: candidate.userId,
        });
        return clearOAuthCookies(handoffCompleteResponse(
          request,
          "Đã tìm thấy thành viên phù hợp. Quay lại ứng dụng để xác nhận tài khoản.",
        ));
      }

      const token = await createZaloLinkContextToken({
        providerUserId: profile.id,
        displayName: profile.name,
        pictureUrl: profile.pictureUrl,
        clubId,
        candidateUserId: candidate.userId,
      });
      const response = NextResponse.redirect(new URL("/zalo/link", request.url));
      response.cookies.set(ZALO_LINK_CONTEXT_COOKIE, token, zaloLinkCookieOptions());
      response.cookies.delete(ZALO_PENDING_COOKIE);
      clearZalo14019RetryCookie(response);
      markAndroidZaloReady(response, request);
      return clearOAuthCookies(response);
    }

    const { request: linkRequest, created } = await createOrReuseZaloLinkRequest(clubId, profile);
    if (created) {
      try {
        await notifyZaloLinkRequestAdmins({
          clubId,
          requestId: linkRequest.id,
          displayName: profile.name,
        });
      } catch {
        // Push failures must not block the Zalo approval request.
      }
    }

    if (handoff) {
      await markZaloHandoffApprovalPending({
        id: handoff.id,
        profile,
        clubId,
        linkRequestId: linkRequest.id,
      });
      return clearOAuthCookies(handoffCompleteResponse(
        request,
        "Đã gửi yêu cầu liên kết. Quay lại ứng dụng để theo dõi trạng thái duyệt.",
      ));
    }

    const pendingToken = await createZaloPendingToken({
      requestId: linkRequest.id,
      providerUserId: profile.id,
    });
    return redirectWithPendingCookie(request, pendingToken);
  } catch (error) {
    if (error instanceof ZaloTokenExchangeError) {
      console.error("Zalo token exchange failed", {
        code: error.code,
        errorName: error.errorName,
        httpStatus: error.httpStatus,
        android: isAndroidRequest(request),
      });

      const isAndroid = isAndroidRequest(request);
      const alreadyRetried = request.cookies.get(ZALO_14019_RETRY_COOKIE)?.value === "1";
      if (!handoff && isAndroid && String(error.code) === "-14019" && !alreadyRetried) {
        return recoverAndroidZalo14019(request);
      }
    }

    const message = error instanceof Error ? error.message : "Không xác định được lỗi Zalo OAuth.";
    console.error("Zalo OAuth callback failed", message);

    if (handoff) {
      try {
        await markZaloHandoffFailed(handoff.id, message);
      } catch {
        // Preserve the original OAuth failure response.
      }
    }

    const failureResponse = htmlResponse(
      "Zalo OAuth thất bại",
      `<h1>Không hoàn tất được Zalo OAuth</h1><p>${escapeHtml(message)}</p><a href="/login">Thử lại</a>`,
      502,
    );
    if (!handoff && error instanceof ZaloTokenExchangeError && isAndroidRequest(request)) {
      clearAndroidZaloReady(failureResponse);
    }
    return clearOAuthCookies(failureResponse);
  }
}
