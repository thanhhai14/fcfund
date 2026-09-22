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

function SafariGuideIcon() {
  return (
    <svg className="pwa-ios-guide-icon safari" viewBox="0 0 5120 5120" aria-hidden="true">
      <defs>
        <linearGradient id="pwa-safari-gradient" x2="0" y2="100%">
          <stop offset="0" stopColor="#19d7ff" />
          <stop offset="1" stopColor="#1e64f0" />
        </linearGradient>
      </defs>
      <g fill="#fff">
        <rect width="5120" height="5120" rx="1050" />
        <circle cx="2560" cy="2560" r="2240" fill="url(#pwa-safari-gradient)" />
        <path fill="red" d="M4090 1020 2370 2370l400 400z" />
        <path d="m1020 4090 1350-1720 400 400z" />
      </g>
      <path
        stroke="#fff"
        strokeWidth="30"
        d="M2560 540v330m0 3370v330m350-4000-57 325m-586 3318-57 327M3250 662l-113 310M1984 4138l-113 310m339-3878 57 325m586 3318 57 327M1870 662l113 310m1152 3166 113 310M1552 810l166 286m1685 2918 165 286M1265 1010l212 253m2166 2582 212 253M1015 1258l253 212m2582 2168 253 212M813 1548l286 165m2920 1685 286 165M665 1866l310 113m3166 1150 310 113M574 2202l326 58m3320 588 325 57M545 2555h330m3370 0h330M575 2905l325-57m3320-586 325-57M668 3245l310-113m3165-1152 310-113M815 3563l286-165m2920-1685 286-165M1016 3850l253-212m2580-2166 253-212M1262 4100l212-253m2166-2582 212-253M1552 4300l166-286m1685-2918 165-286M2384 548l16 180m320 3656 16 180M2038 610l47 174m950 3544 47 174M1708 730l76 163m1550 3326 77 163M1404 904l103 148m2106 3006 103 148M1135 1130l127 127m2596 2596 127 127M910 1400l148 103m3006 2107 146 100M734 1703l163 76m3326 1550 163 77M614 2033l174 47m3544 950 174 47M553 2380l180 16m3656 320 180 16m-4014 0 180-16m3656-320 180-16M614 3077l174-47m3544-950 174-47M734 3407l163-76m3326-1550 163-76M910 3710l148-103m3006-2107 146-100M1404 4206l103-148m2105-3006 104-148M1708 4380l77-163M3335 890l77-163M2038 4500l47-174m950-3544 47-174m-698 3952 16-180m320-3656 16-180"
      />
    </svg>
  );
}

function ShareGuideIcon() {
  return (
    <svg className="pwa-ios-guide-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 19V4m0 0-5 5m5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 11H8.8A2.8 2.8 0 0 0 6 13.8v10.4A2.8 2.8 0 0 0 8.8 27h14.4a2.8 2.8 0 0 0 2.8-2.8V13.8a2.8 2.8 0 0 0-2.8-2.8H21" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function MoreGuideIcon() {
  return (
    <svg className="pwa-ios-guide-icon neutral" viewBox="0 0 32 32" aria-hidden="true">
      <path d="m8 12 8 8 8-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddHomeGuideIcon() {
  return (
    <svg className="pwa-ios-guide-icon neutral" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5.5" y="5.5" width="21" height="21" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 10.5v11M10.5 16h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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
                <li><span className="pwa-ios-step-line">Mở trang này bằng <b>Safari</b>.<SafariGuideIcon /></span></li>
                <li><span className="pwa-ios-step-line">Nhấn nút <b>Chia sẻ</b>.<ShareGuideIcon /></span></li>
                <li><span className="pwa-ios-step-line">Nhấn nút <b>Xem thêm</b>.<MoreGuideIcon /></span></li>
                <li><span className="pwa-ios-step-line">Chọn <b>Thêm vào Màn hình chính</b>.<AddHomeGuideIcon /></span></li>
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
