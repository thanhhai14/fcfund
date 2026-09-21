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

const DISMISS_KEY = "fcfund:pwa-install-dismissed-at";
const DISMISS_DAYS = 7;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

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

function wasDismissedRecently() {
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const value = Number(raw);
  return Number.isFinite(value) && Date.now() - value < DISMISS_MS;
}

export function PwaInstallPrompt() {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || !isMobileDevice() || wasDismissedRecently()) return;

    const ios = isIosDevice();
    const iosTimer = ios
      ? window.setTimeout(() => setMode("ios"), 900)
      : null;

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPrompt.current = event as InstallPromptEvent;
      setMode("android");
    }

    function handleInstalled() {
      deferredPrompt.current = null;
      setMode("hidden");
      setShowIosHelp(false);
      window.localStorage.removeItem(DISMISS_KEY);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      if (iosTimer !== null) window.clearTimeout(iosTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    deferredPrompt.current = null;
    setShowIosHelp(false);
    setMode("hidden");
  }

  async function installAndroid() {
    const prompt = deferredPrompt.current;
    if (!prompt) return;

    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt.current = null;

    if (choice.outcome === "accepted") {
      setMode("hidden");
      window.localStorage.removeItem(DISMISS_KEY);
    } else {
      dismiss();
    }
  }

  if (mode === "hidden") return null;

  return (
    <aside className="pwa-install-card" role="dialog" aria-label={`Cài đặt ${APP_NAME}`}>
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="Đóng gợi ý cài ứng dụng">×</button>
      <div className="pwa-install-brand">
        <img src="/icon-192.png" alt="" width="48" height="48" />
        <div>
          <strong>Cài {APP_NAME}</strong>
          <span>Mở nhanh như ứng dụng và dùng toàn màn hình.</span>
        </div>
      </div>

      {mode === "android" ? (
        <div className="pwa-install-actions">
          <button className="button primary small" type="button" onClick={installAndroid}>Cài ứng dụng</button>
          <button className="button secondary small" type="button" onClick={dismiss}>Để sau</button>
        </div>
      ) : (
        <>
          <div className="pwa-install-actions">
            <button className="button primary small" type="button" onClick={() => setShowIosHelp((value) => !value)}>
              Cách cài trên iPhone
            </button>
            <button className="button secondary small" type="button" onClick={dismiss}>Để sau</button>
          </div>
          {showIosHelp && (
            <div className="pwa-install-ios-help">
              <strong>Thêm vào Màn hình chính</strong>
              <ol>
                <li>Nhấn nút <b>Chia sẻ</b> của trình duyệt.</li>
                <li>Chọn <b>Thêm vào Màn hình chính</b>.</li>
                <li>Nhấn <b>Thêm</b> để cài {APP_NAME}.</li>
              </ol>
              <small>Nếu không thấy tùy chọn này trong trình duyệt đang mở, hãy mở liên kết bằng Safari rồi thực hiện lại.</small>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
