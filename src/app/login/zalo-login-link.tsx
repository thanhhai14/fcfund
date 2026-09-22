"use client";

import type { MouseEvent } from "react";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export function ZaloLoginLink({ externalTestUrl }: { externalTestUrl: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;

    if (!displayModeStandalone && !iosStandalone) return;

    event.preventDefault();
    window.open(externalTestUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <a
      className="zalo-login-button"
      href="/api/auth/zalo/start"
      onClick={handleClick}
    >
      Đăng nhập bằng Zalo
    </a>
  );
}
