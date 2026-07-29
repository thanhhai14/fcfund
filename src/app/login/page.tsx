import type { Metadata } from "next";
import { requireAnonymous } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage() {
  await requireAnonymous();
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
            <div><strong>FCFUND</strong><small>Quỹ Trại Làng FC</small></div>
          </div>
          <div className="login-heading">
            <span>Chào mừng trở lại</span>
            <h2>Đăng nhập tài khoản</h2>
            <p>Sử dụng số điện thoại đã được Admin cấp.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
