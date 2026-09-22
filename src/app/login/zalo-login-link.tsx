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

const HANDOFF_STORAGE_KEY = "fcfund_zalo_handoff_v1";

function isIosStandalone() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as NavigatorWithStandalone).standalone === true;
  const ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  return standalone && ios;
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

export function ZaloLoginLink({ pwaHandoff }: { pwaHandoff: Handoff | null }) {
  const [message, setMessage] = useState("");

  useEffect(() => {
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
  }, []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isIosStandalone()) return;

    event.preventDefault();

    if (!pwaHandoff) {
      setMessage("Không thể chuẩn bị phiên đăng nhập Zalo. Hãy tải lại ứng dụng và thử lại.");
      return;
    }

    if (Date.parse(pwaHandoff.expiresAt) <= Date.now()) {
      setMessage("Phiên đăng nhập đã hết hạn. Đang tải lại để tạo phiên mới…");
      window.setTimeout(() => window.location.reload(), 500);
      return;
    }

    window.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(pwaHandoff));
    setMessage("Đang mở Safari để xác thực Zalo…");
    window.location.assign(toSafariScheme(pwaHandoff.authorizationUrl));
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
    </>
  );
}
