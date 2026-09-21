"use client";

import { useEffect, useState } from "react";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function vapidKeyBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function platformName() {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export function PushNotificationSettings({ publicKey }: { publicKey: string | null }) {
  const [supported, setSupported] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function refreshState() {
      await Promise.resolve();
      const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (cancelled) return;
      setSupported(ok);
      setStandalone(standaloneMode());
      if (!ok) return;
      setPermission(Notification.permission);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(subscription));
      } catch {
        // The settings panel remains usable even if service worker inspection fails.
      }
    }

    void refreshState();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey || !supported || !standalone) return;
    setBusy(true);
    setMessage("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage("Bạn chưa cho phép ứng dụng gửi thông báo.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(publicKey),
      });
      const json = subscription.toJSON();
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: json.keys,
          platform: platformName(),
          userAgent: navigator.userAgent,
        }),
      });
      if (!response.ok) throw new Error("save-failed");
      setSubscribed(true);
      setMessage("Đã bật thông báo trên thiết bị này.");
    } catch {
      setMessage("Không thể bật thông báo. Hãy thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Đã tắt thông báo trên thiết bị này.");
    } catch {
      setMessage("Không thể tắt thông báo. Hãy thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  const unavailable = !publicKey
    ? "Máy chủ chưa cấu hình VAPID keys."
    : !supported
      ? "Trình duyệt/thiết bị này không hỗ trợ Web Push."
      : !standalone
        ? "Hãy mở FCFUND từ PWA đã cài trên màn hình chính để bật thông báo."
        : permission === "denied"
          ? "Thông báo đang bị chặn trong cài đặt của hệ điều hành/trình duyệt."
          : null;

  return (
    <article className="panel push-settings-card">
      <div className="panel-heading">
        <div><span className="eyebrow">PWA</span><h2>Thông báo</h2></div>
        <span className={"status-badge " + (subscribed ? "active" : "inactive")}>
          {subscribed ? "Đang bật" : "Đang tắt"}
        </span>
      </div>
      <p className="panel-note">Nhận thông báo về trận đấu, đội hình, kết quả, khoản phải đóng và tiền nộp.</p>
      {unavailable && <p className="push-settings-warning">{unavailable}</p>}
      {message && <p className="push-settings-message">{message}</p>}
      <div className="form-actions">
        {subscribed
          ? <button className="button secondary" type="button" onClick={disable} disabled={busy}>{busy ? "Đang tắt…" : "Tắt thông báo"}</button>
          : <button className="button primary" type="button" onClick={enable} disabled={busy || Boolean(unavailable)}>{busy ? "Đang bật…" : "Bật thông báo"}</button>}
      </div>
    </article>
  );
}
