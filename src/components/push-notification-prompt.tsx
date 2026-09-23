"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  enablePushNotifications,
  PUSH_STATE_CHANGED_EVENT,
  rememberPushEnabled,
  readPushClientState,
  wasPushEnabledBefore,
} from "@/lib/push-client";

const DENIED_AT_KEY = "fcfund_push_permission_denied_at";
const DENIED_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function deniedRecently() {
  try {
    const raw = window.localStorage.getItem(DENIED_AT_KEY);
    if (!raw) return false;
    const deniedAt = Number(raw);
    return Number.isFinite(deniedAt) && Date.now() - deniedAt < DENIED_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDeniedNow() {
  try {
    window.localStorage.setItem(DENIED_AT_KEY, String(Date.now()));
  } catch {
    // Storage failure should not block the permission flow.
  }
}

function clearDeniedMarker() {
  try {
    window.localStorage.removeItem(DENIED_AT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function PushNotificationPrompt({ publicKey }: { publicKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();
  const initialCheckPending = useRef(true);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    let timer: number | undefined;
    let permissionStatus: PermissionStatus | null = null;

    async function checkPermission(showInitialPrompt: boolean) {
      try {
        const state = await readPushClientState();
        if (cancelled || !state.supported || !state.standalone) return;

        const active = state.permission === "granted" && state.subscribed;
        const wasActive = wasPushEnabledBefore() || state.subscribed;
        if (active) {
          rememberPushEnabled();
          clearDeniedMarker();
          setBlocked(false);
          setOpen(false);
          return;
        }

        // Preserve the initial prompt flow. Reopen after later navigation or
        // resume only when this device had Push enabled before.
        if (!showInitialPrompt && !wasActive) return;
        if (state.permission === "denied") {
          if (!wasActive && deniedRecently()) return;
          setBlocked(true);
          setOpen(true);
          return;
        }

        setBlocked(false);
        setOpen(true);
      } catch {
        // Do not interrupt app usage if push state inspection fails.
      }
    }

    function scheduleCheck(delay = 150) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void checkPermission(false), delay);
    }

    function handleResume() {
      if (document.visibilityState === "visible") scheduleCheck(250);
    }

    function handlePermissionChange() {
      scheduleCheck(0);
    }

    const showInitialPrompt = initialCheckPending.current;
    timer = window.setTimeout(() => {
      initialCheckPending.current = false;
      void checkPermission(showInitialPrompt);
    }, 900);

    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    window.addEventListener(PUSH_STATE_CHANGED_EVENT, handlePermissionChange);
    document.addEventListener("visibilitychange", handleResume);

    if ("permissions" in navigator && navigator.permissions?.query) {
      void navigator.permissions.query({ name: "notifications" as PermissionName })
        .then((status) => {
          if (cancelled) return;
          permissionStatus = status;
          permissionStatus.addEventListener("change", handlePermissionChange);
        })
        .catch(() => {
          // Some browsers do not expose notification permission changes.
        });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener(PUSH_STATE_CHANGED_EVENT, handlePermissionChange);
      document.removeEventListener("visibilitychange", handleResume);
      permissionStatus?.removeEventListener("change", handlePermissionChange);
    };
  }, [pathname, publicKey]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const state = await enablePushNotifications(publicKey);
      if (state.permission === "denied") {
        rememberDeniedNow();
        setOpen(false);
        return;
      }
      if (state.subscribed) {
        clearDeniedMarker();
        setBlocked(false);
        setOpen(false);
      }
    } catch {
      // Keep the prompt visible so the user can retry.
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="push-permission-gate" role="dialog" aria-modal="true" aria-label="Bật thông báo">
      <section className="push-permission-card">
        <div className="push-permission-icon" aria-hidden="true">🔔</div>
        <div className="push-permission-copy">
          <span className="eyebrow">Thông báo PWA</span>
          <h2>{blocked ? "Bật lại thông báo" : "Bật thông báo"}</h2>
          <p>
            {blocked
              ? "Quyền thông báo đang bị chặn trên thiết bị. Mở hướng dẫn để cho phép lại, rồi quay về ứng dụng."
              : "Nhận thông báo về trận đấu, đội hình, kết quả, khoản phải đóng và các cập nhật quan trọng của CLB."}
          </p>
        </div>

        <div className="push-permission-actions">
          {blocked ? (
            <Link className="button primary" href="/settings" onClick={() => setOpen(false)}>
              Xem cách bật lại
            </Link>
          ) : (
            <button className="button primary" type="button" onClick={enable} disabled={busy}>
              {busy ? "Đang bật…" : "Bật thông báo"}
            </button>
          )}
          <button className="button secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>
            Hủy
          </button>
        </div>
      </section>
    </div>
  );
}
