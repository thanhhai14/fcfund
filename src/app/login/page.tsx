import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { zaloLinkRequests } from "@/db/schema";
import { requireAnonymous } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { APP_NAME } from "@/lib/constants";
import { isZaloLoginEnabled } from "@/lib/zalo-auth";
import { createZaloAuthHandoff } from "@/lib/zalo-handoff";
import { readZaloPendingSession } from "@/lib/zalo-linking";
import { ZaloLoginLink } from "./zalo-login-link";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage() {
  await requireAnonymous();

  const pendingSession = await readZaloPendingSession();
  if (pendingSession) {
    const [pendingRequest] = await db
      .select({ status: zaloLinkRequests.status })
      .from(zaloLinkRequests)
      .where(and(
        eq(zaloLinkRequests.id, pendingSession.requestId),
        eq(zaloLinkRequests.providerUserId, pendingSession.providerUserId),
      ))
      .limit(1);

    if (pendingRequest?.status === "PENDING" || pendingRequest?.status === "APPROVED") {
      redirect("/zalo/pending");
    }
  }

  let pwaHandoff: {
    handoffId: string;
    verifier: string;
    authorizationUrl: string;
    expiresAt: string;
  } | null = null;

  if (isZaloLoginEnabled()) {
    try {
      const handoff = await createZaloAuthHandoff();
      pwaHandoff = {
        handoffId: handoff.id,
        verifier: handoff.clientSecret,
        authorizationUrl: handoff.authorizationUrl,
        expiresAt: handoff.expiresAt.toISOString(),
      };
    } catch (error) {
      console.error(
        "Prepare Zalo PWA handoff failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="visual-content">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-club-logo" src="/trai-lang-logo.jpg" alt="Logo Trại Làng FC" />
          <span className="visual-kicker">TRẠI LÀNG FC · SINCE 2018</span>
          <h1>Quỹ đội bóng,<br />rõ từng khoản.</h1>
          <p>Theo dõi đóng quỹ, công nợ và mọi khoản thu chi trên một nền tảng dành riêng cho đội của bạn.</p>
        </div>
        <div className="pitch-lines" />
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/trai-lang-logo.jpg" alt="Logo Trại Làng FC" />
            <div><strong>{APP_NAME}</strong><small>Quỹ Trại Làng FC</small></div>
          </div>
          <div className="login-heading">
            <span>Chào mừng trở lại</span>
            <h2>Đăng nhập tài khoản</h2>
            <p>Sử dụng số điện thoại đã được Admin cấp.</p>
          </div>
          <LoginForm />
          {isZaloLoginEnabled() && (
            <div className="zalo-login-poc">
              <div className="zalo-login-divider"><span>hoặc</span></div>
              <ZaloLoginLink pwaHandoff={pwaHandoff} />
              <p>Dùng Zalo đã liên kết hoặc xác minh thành viên trong lần đăng nhập đầu tiên.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
