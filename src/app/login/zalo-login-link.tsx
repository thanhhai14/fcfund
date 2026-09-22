"use client";

import type { MouseEvent } from "react";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function toSafariScheme(url: string) {
  if (url.startsWith("https://")) return `x-safari-${url}`;
  if (url.startsWith("http://")) return `x-safari-${url}`;
  return url;
}

export function ZaloLoginLink({ externalTestUrl }: { externalTestUrl: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;

    if (!displayModeStandalone && !iosStandalone) return;

    event.preventDefault();
    window.location.assign(toSafariScheme(externalTestUrl));
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
