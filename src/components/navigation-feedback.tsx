"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const COMPLETE_DELAY = 180;
const FAILSAFE_DELAY = 12_000;

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const previousRouteKey = useRef(routeKey);
  const activeRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (finishRef.current) clearTimeout(finishRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    intervalRef.current = null;
    finishRef.current = null;
    failsafeRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    clearTimers();
    setProgress(100);
    finishRef.current = setTimeout(() => {
      activeRef.current = false;
      setActive(false);
      setProgress(0);
      document.documentElement.removeAttribute("data-navigation-pending");
    }, COMPLETE_DELAY);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    activeRef.current = true;
    setActive(true);
    setProgress((current) => Math.max(current, 12));
    document.documentElement.setAttribute("data-navigation-pending", "true");

    intervalRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 88) return 88;
        const step = Math.max(2, Math.round((88 - current) * 0.16));
        return Math.min(88, current + step);
      });
    }, 240);

    failsafeRef.current = setTimeout(stop, FAILSAFE_DELAY);
  }, [clearTimers, stop]);

  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      stop();
    }
  }, [routeKey, stop]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const current = new URL(window.location.href);
      const sameDocument = destination.pathname === current.pathname
        && destination.search === current.search;
      if (sameDocument) return;

      start();
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if ((form.getAttribute("method") ?? "get").toLowerCase() !== "get") return;

      const destination = new URL(form.action || window.location.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      start();
    }

    function handlePopState() {
      start();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
      document.documentElement.removeAttribute("data-navigation-pending");
    };
  }, [clearTimers, start]);

  return (
    <div
      className={`navigation-progress ${active ? "active" : ""}`}
      aria-hidden="true"
    >
      <span style={{ transform: `scaleX(${progress / 100})` }} />
    </div>
  );
}
