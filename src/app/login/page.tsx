import type { Metadata } from "next";
import { requireAnonymous } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { APP_NAME } from "@/lib/constants";
import {
  buildZaloAuthorizationUrl,
  createZaloCodeChallenge,
  createZaloCodeVerifier,
  createZaloOAuthState,
  getZaloConfig,
} from "@/lib/zalo-auth";
import { ZaloLoginLink } from "./zalo-login-link";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage() {
  await requireAnonymous();

  let externalZaloTestUrl = "";
  if (process.env.ZALO_LOGIN_ENABLED === "true") {
    const config = getZaloConfig();
    const verifier = createZaloCodeVerifier();
    externalZaloTestUrl = buildZaloAuthorizationUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state: createZaloOAuthState(),
      codeChallenge: createZaloCodeChallenge(verifier),
    }).toString();
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
          {process.env.ZALO_LOGIN_ENABLED === "true" && (
            <div className="zalo-login-poc">
              <div className="zalo-login-divider"><span>hoặc</span></div>
              <ZaloLoginLink externalTestUrl={externalZaloTestUrl} />
              <p>Dùng Zalo đã liên kết hoặc xác minh thành viên trong lần đăng nhập đầu tiên.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
