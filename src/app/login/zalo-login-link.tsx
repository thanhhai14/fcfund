"use client";

import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type Handoff = {
  handoffId: string;
  verifier: string;
  authorizationUrl: string;
  expiresAt: string;
};

type HandoffStatus = {
  status: string;
  redirect?: string;
  message?: string;
};

type StandalonePlatform = "ios" | "android" | null;

const HANDOFF_STORAGE_KEY = "fcfund_zalo_handoff_v1";

function getStandalonePlatform(): StandalonePlatform {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as NavigatorWithStandalone).standalone === true;

  if (!standalone) return null;

  if (/Android/i.test(window.navigator.userAgent)) {
    return "android";
  }

  const ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

  return ios ? "ios" : null;
}

function toSafariScheme(url: string) {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    return `x-safari-${url}`;
  }
  return url;
}

function readStoredHandoff(): Handoff | null {
  try {
    const raw = window.localStorage.getItem(HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Handoff>;
    if (
      typeof value.handoffId !== "string"
      || typeof value.verifier !== "string"
      || typeof value.authorizationUrl !== "string"
      || typeof value.expiresAt !== "string"
    ) {
      window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
      return null;
    }
    if (Date.parse(value.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
      return null;
    }
    return value as Handoff;
  } catch {
    window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
    return null;
  }
}

export function ZaloLoginLink({
  pwaHandoff,
  androidRetry14019 = false,
}: {
  pwaHandoff: Handoff | null;
  androidRetry14019?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [showAndroidGuide, setShowAndroidGuide] = useState(androidRetry14019);
  const [showRetryNotice, setShowRetryNotice] = useState(androidRetry14019);

  useEffect(() => {
    const platform = getStandalonePlatform();

    if (platform === "android") {
      window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
      return;
    }

    if (platform !== "ios") return;

    let active = true;

    async function checkHandoff() {
      if (!active || document.visibilityState === "hidden") return;
      const handoff = readStoredHandoff();
      if (!handoff) return;

      try {
        const response = await fetch("/api/auth/zalo/handoff/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handoffId: handoff.handoffId,
            verifier: handoff.verifier,
          }),
          cache: "no-store",
        });
        const data = await response.json().catch(() => null) as HandoffStatus | null;
        if (!active || !data) return;

        if (data.status === "PENDING") {
          setMessage("Đang chờ bạn hoàn tất xác thực Zalo trong Safari…");
          return;
        }

        if (data.redirect) {
          window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
          window.location.assign(data.redirect);
          return;
        }

        if (data.status === "FAILED" || data.status === "ERROR") {
          window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
          setMessage(data.message || "Không thể hoàn tất đăng nhập Zalo.");
        }
      } catch {
        if (active) {
          setMessage("Chưa kết nối lại được máy chủ. Ứng dụng sẽ tự thử lại.");
        }
      }
    }

    const interval = window.setInterval(() => {
      void checkHandoff();
    }, 2000);
    const resume = () => {
      if (document.visibilityState === "visible") {
        void checkHandoff();
      }
    };

    void checkHandoff();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [androidRetry14019]);

  useEffect(() => {
    if (!showAndroidGuide) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAndroidGuide(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showAndroidGuide]);

  function validateHandoff(event: MouseEvent<HTMLElement>) {
    if (!pwaHandoff) {
      event.preventDefault();
      setShowAndroidGuide(false);
      setMessage("Không thể chuẩn bị phiên đăng nhập Zalo. Hãy tải lại ứng dụng và thử lại.");
      return false;
    }

    if (Date.parse(pwaHandoff.expiresAt) <= Date.now()) {
      event.preventDefault();
      setShowAndroidGuide(false);
      setMessage("Phiên đăng nhập đã hết hạn. Đang tải lại để tạo phiên mới…");
      window.setTimeout(() => window.location.reload(), 500);
      return false;
    }

    return true;
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const platform = getStandalonePlatform();
    if (!platform) return;

    if (platform === "android") {
      event.preventDefault();
      window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
      setMessage("");
      setShowAndroidGuide(true);
      return;
    }

    if (!validateHandoff(event)) return;

    event.preventDefault();
    window.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(pwaHandoff));
    setMessage("Đang mở Safari để xác thực Zalo…");
    window.location.assign(toSafariScheme(pwaHandoff!.authorizationUrl));
  }

  function handleAndroidContinue() {
    window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
    setShowRetryNotice(false);
    setShowAndroidGuide(false);
  }

  return (
    <>
      <a
        className="zalo-login-button"
        href="/api/auth/zalo/start"
        onClick={handleClick}
      >
        Đăng nhập bằng Zalo
      </a>

      {message && <p className="form-message" role="status">{message}</p>}

      {showAndroidGuide && (
        <div
          className="zalo-android-guide-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowAndroidGuide(false);
            }
          }}
        >
          <section
            className="zalo-android-guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zalo-android-guide-title"
            aria-describedby="zalo-android-guide-description"
          >
            <header className="zalo-android-guide-header">
              <span className="zalo-android-guide-logo">Zalo</span>
              <button
                type="button"
                className="zalo-android-guide-close"
                onClick={() => setShowAndroidGuide(false)}
                aria-label="Đóng hướng dẫn"
              >
                ×
              </button>
            </header>

            <div className="zalo-android-guide-intro">
              <span className="eyebrow">Android PWA</span>
              <h2 id="zalo-android-guide-title">
                {showRetryNotice ? "Xác thực lại Zalo một lần" : "Mở Zalo bằng Chrome"}
              </h2>
              <p id="zalo-android-guide-description">
                {showRetryNotice
                  ? "Zalo chưa hoàn tất bước cấp access token ở lần vừa rồi. Hãy mở lại Zalo bằng Chrome và xác thực thêm một lần."
                  : "Sau khi trang Zalo xuất hiện, làm 3 bước dưới đây để dùng nút đăng nhập bằng ứng dụng Zalo."}
              </p>
            </div>

            <div className="zalo-android-guide-steps">
              <article className="zalo-android-guide-step">
                <span className="zalo-android-step-number">1</span>
                <div className="zalo-android-step-copy">
                  <strong>Nhấn menu 3 chấm</strong>
                  <span>Ở góc trên bên phải của trang Zalo.</span>
                </div>
                <div className="zalo-android-browser-mock" aria-hidden="true">
                  <span className="zalo-android-browser-lock">●</span>
                  <span className="zalo-android-browser-address">id.zalo.me</span>
                  <b className="zalo-android-browser-menu">⋮</b>
                </div>
              </article>

              <article className="zalo-android-guide-step">
                <span className="zalo-android-step-number">2</span>
                <div className="zalo-android-step-copy">
                  <strong>Chọn “Mở bằng Chrome”</strong>
                  <span>Trang đăng nhập sẽ chuyển sang ứng dụng Chrome.</span>
                </div>
                <div className="zalo-android-menu-mock" aria-hidden="true">
                  <span>Chia sẻ…</span>
                  <span>Tìm trong trang</span>
                  <strong><i>◎</i> Mở bằng Chrome</strong>
                </div>
              </article>

              <article className="zalo-android-guide-step">
                <span className="zalo-android-step-number">3</span>
                <div className="zalo-android-step-copy">
                  <strong>Đăng nhập bằng ứng dụng Zalo</strong>
                  <span>Trong Chrome, bấm nút màu xanh của Zalo.</span>
                </div>
                <div className="zalo-android-zalo-mock" aria-hidden="true">
                  <span>ZALO</span>
                  <strong>Đăng nhập bằng ứng dụng Zalo</strong>
                </div>
              </article>
            </div>

            <div className="zalo-android-guide-actions">
              <a
                className="button primary zalo-android-guide-continue"
                href="/api/auth/zalo/start"
                onClick={handleAndroidContinue}
              >
                Đã hiểu – Mở Zalo
              </a>
              <button
                type="button"
                className="button secondary zalo-android-guide-cancel"
                onClick={() => setShowAndroidGuide(false)}
              >
                Hủy
              </button>
            </div>

            <p className="zalo-android-guide-note">
              Sau khi vào Chrome, FCFUND sẽ tự tiếp tục đăng nhập khi Zalo xác thực xong.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
