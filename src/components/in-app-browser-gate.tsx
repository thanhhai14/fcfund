"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { APP_NAME } from "@/lib/constants";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type Platform = "ios" | "android" | "other";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isZaloInAppBrowser() {
  return /Zalo/i.test(navigator.userAgent);
}

async function copyCurrentUrl() {
  const value = window.location.href;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy-failed");
}

export function InAppBrowserGate() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (isStandalone() || !isZaloInAppBrowser()) return;

    const gateTimer = window.setTimeout(() => {
      setPlatform(detectPlatform());
    }, 0);

    return () => window.clearTimeout(gateTimer);
  }, []);

  function openChrome() {
    const url = new URL(window.location.href);
    const scheme = url.protocol.replace(":", "") || "https";
    const target = `${url.host}${url.pathname}${url.search}`;
    const fallback = encodeURIComponent(url.href);
    window.location.href =
      `intent://${target}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }

  async function copyLink() {
    try {
      await copyCurrentUrl();
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  if (!platform) return null;

  const browserName = platform === "ios"
    ? "Safari"
    : platform === "android"
      ? "Chrome"
      : "trình duyệt ngoài";

  return (
    <div
      className="in-app-browser-gate"
      role="dialog"
      aria-modal="true"
      aria-label={`Mở ${APP_NAME} bằng ${browserName}`}
    >
      <section className="in-app-browser-card">
        <div className="in-app-browser-brand">
          <img src="/icon-192.png" alt="" width="60" height="60" />
          <div>
            <span className="eyebrow">Đang mở trong Zalo</span>
            <h2>Mở {APP_NAME} bằng {browserName}</h2>
          </div>
        </div>

        <p className="in-app-browser-description">
          Trình duyệt tích hợp của Zalo có thể làm một số chức năng hoạt động không ổn định.
          Hãy mở trang bằng {browserName} để đăng nhập, cài ứng dụng và nhận thông báo đầy đủ.
        </p>

        {platform === "ios" && (
          <div className="in-app-browser-help">
            <strong>Trên iPhone/iPad</strong>
            <ol>
              <li>Tại màn hình này, nhấn nút <b>⋯</b> phía trên bên phải.</li>
              <li>Chọn <b>Mở bằng Safari</b> hoặc <b>Mở trong trình duyệt</b>.</li>
              <li>Nếu không thấy tùy chọn, hãy sao chép liên kết rồi dán vào Safari.</li>
            </ol>
          </div>
        )}

        {platform === "android" && (
          <div className="in-app-browser-help">
            <strong>Trên Android</strong>
            <p>
              Nhấn <b>Mở bằng Chrome</b>. Nếu Zalo chặn thao tác, dùng menu <b>⋮</b> của Zalo
              và chọn mở bằng trình duyệt ngoài.
            </p>
          </div>
        )}

        {platform === "other" && (
          <div className="in-app-browser-help">
            <strong>Mở bằng trình duyệt ngoài</strong>
            <p>Sao chép liên kết bên dưới rồi mở bằng trình duyệt mặc định trên thiết bị.</p>
          </div>
        )}

        <div className="in-app-browser-actions">
          {platform === "android" && (
            <button className="button primary wide" type="button" onClick={openChrome}>
              Mở bằng Chrome
            </button>
          )}
          <button
            className={`button ${platform === "android" ? "secondary" : "primary"} wide`}
            type="button"
            onClick={copyLink}
          >
            {copyState === "copied"
              ? "Đã sao chép liên kết"
              : copyState === "failed"
                ? "Không thể sao chép · Thử lại"
                : "Sao chép liên kết"}
          </button>
        </div>

        <small className="in-app-browser-note">
          Vì lý do tương thích, {APP_NAME} không tiếp tục chạy trong trình duyệt tích hợp của Zalo.
        </small>
      </section>
    </div>
  );
}
