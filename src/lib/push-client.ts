"use client";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export type PushClientState = {
  supported: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

export function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function vapidKeyBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function pushPlatformName() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function blockedPermissionHelp() {
  const platform = pushPlatformName();
  if (platform === "ios") {
    return "Quyền thông báo đang bị chặn. Hãy mở Cài đặt trên iPhone/iPad → Thông báo → FCFUND (hoặc tên ứng dụng) → bật Cho phép thông báo, rồi quay lại đây.";
  }
  if (platform === "android") {
    return "Quyền thông báo đang bị chặn. Hãy mở Cài đặt Android → Ứng dụng/Thông báo → FCFUND (hoặc tên ứng dụng) → cho phép thông báo, rồi quay lại đây.";
  }
  return "Quyền thông báo đang bị chặn trong cài đặt của hệ điều hành/trình duyệt. Hãy cho phép lại rồi quay lại đây.";
}

export async function readPushClientState(): Promise<PushClientState> {
  const supported = pushSupported();
  const standalone = standaloneMode();
  if (!supported) {
    return {
      supported: false,
      standalone,
      permission: "unsupported",
      subscribed: false,
    };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    standalone,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: json.keys,
      platform: pushPlatformName(),
      userAgent: navigator.userAgent,
    }),
  });
  if (!response.ok) throw new Error("save-failed");
}

export async function enablePushNotifications(publicKey: string) {
  if (!pushSupported() || !standaloneMode()) {
    return readPushClientState();
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return {
      supported: true,
      standalone: true,
      permission,
      subscribed: false,
    } satisfies PushClientState;
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKeyBytes(publicKey),
  });
  await saveSubscription(subscription);

  return {
    supported: true,
    standalone: true,
    permission,
    subscribed: true,
  } satisfies PushClientState;
}

export async function disablePushNotifications() {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error("disable-failed");
  await subscription.unsubscribe();
}
