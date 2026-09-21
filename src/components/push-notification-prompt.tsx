"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  enablePushNotifications,
  readPushClientState,
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

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const state = await readPushClientState();
          if (cancelled || !state.supported || !state.standalone || state.subscribed) return;

          if (state.permission === "denied") {
            if (deniedRecently()) return;
            setBlocked(true);
            setOpen(true);
            return;
          }

          setBlocked(false);
          setOpen(true);
        } catch {
          // Do not interrupt app usage if push state inspection fails.
        }
      })();
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [publicKey]);

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
              ? "Quyền thông báo đang bị chặn. Bạn có thể bật lại trong phần Cài đặt của ứng dụng."
              : "Nhận thông báo về trận đấu, đội hình, kết quả, khoản phải đóng và các cập nhật quan trọng của CLB."}
          </p>
        </div>

        <div className="push-permission-actions">
          {blocked ? (
            <Link className="button primary" href="/settings" onClick={() => setOpen(false)}>
              Mở cài đặt
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
