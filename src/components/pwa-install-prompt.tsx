"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/lib/constants";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function isIosDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobileDevice() {
  return isIosDevice()
    || /Android|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.matchMedia("(max-width: 820px)").matches;
}

export function PwaInstallPrompt() {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    if (isStandalone() || /Zalo/i.test(navigator.userAgent) || !isMobileDevice()) return;

    const gateTimer = window.setTimeout(() => {
      setMode(isIosDevice() ? "ios" : "android");
    }, 0);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPrompt.current = event as InstallPromptEvent;
      setCanPrompt(true);
      setMode("android");
    }

    function handleInstalled() {
      deferredPrompt.current = null;
      setCanPrompt(false);
      setMode("hidden");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.clearTimeout(gateTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installAndroid() {
    const prompt = deferredPrompt.current;
    if (!prompt) return;

    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt.current = null;
    setCanPrompt(false);
  }

  function dismiss() {
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <div className="pwa-install-gate" role="dialog" aria-modal="true" aria-label={`Cài đặt ${APP_NAME}`}>
      <section className="pwa-install-gate-card">
        <button
          className="pwa-install-close"
          type="button"
          onClick={dismiss}
          aria-label="Đóng thông báo cài ứng dụng"
        >
          ×
        </button>
        <div className="pwa-install-brand">
          <img src="/icon-192.png" alt="" width="64" height="64" />
          <div>
            <span className="eyebrow">Gợi ý cài đặt</span>
            <strong>Cài {APP_NAME} trên điện thoại</strong>
            <p>Cài PWA để mở nhanh như ứng dụng, dùng toàn màn hình và có trải nghiệm ổn định hơn.</p>
          </div>
        </div>

        {mode === "android" ? (
          <>
            <button
              className="button primary wide"
              type="button"
              onClick={installAndroid}
              disabled={!canPrompt}
            >
              {canPrompt ? "Cài ứng dụng" : "Đang chuẩn bị cài đặt…"}
            </button>
            {!canPrompt && (
              <div className="pwa-install-manual">
                <strong>Nếu nút cài chưa xuất hiện</strong>
                <p>Mở trang bằng Chrome, nhấn <b>⋮</b> → <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào màn hình chính</b>.</p>
              </div>
            )}
            <small className="pwa-install-note">
              Sau khi cài, hãy mở {APP_NAME} từ biểu tượng trên màn hình chính.
            </small>
          </>
        ) : (
          <>
            <div className="pwa-install-ios-help">
              <strong>Thêm {APP_NAME} vào Màn hình chính</strong>
              <ol>
                <li>Mở trang này bằng <b>Safari</b>.</li>
                <li>Nhấn nút <b>Chia sẻ</b>.</li>
                <li>Chọn <b>Thêm vào Màn hình chính</b>.</li>
                <li>Nhấn <b>Thêm</b>, sau đó mở {APP_NAME} từ icon vừa tạo.</li>
              </ol>
            </div>
            <small className="pwa-install-note">
              iPhone/iPad không cho website tự bật hộp cài ứng dụng, nên bước này cần thực hiện thủ công một lần.
            </small>
          </>
        )}
      </section>
    </div>
  );
}
