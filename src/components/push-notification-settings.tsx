"use client";

import { useCallback, useEffect, useState } from "react";
import {
  blockedPermissionHelp,
  disablePushNotifications,
  enablePushNotifications,
  readPushClientState,
  type PushClientState,
} from "@/lib/push-client";

const EMPTY_STATE: PushClientState = {
  supported: false,
  standalone: false,
  permission: "unsupported",
  subscribed: false,
};

export function PushNotificationSettings({
  publicKey,
  isAdmin,
}: {
  publicKey: string | null;
  isAdmin: boolean;
}) {
  const [state, setState] = useState<PushClientState>(EMPTY_STATE);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshState = useCallback(async () => {
    try {
      setState(await readPushClientState());
    } catch {
      // Keep the settings panel available if service worker inspection fails.
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshState();
    }, 0);

    function handleResume() {
      if (document.visibilityState === "visible") void refreshState();
    }

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [refreshState]);

  async function enable() {
    if (!publicKey || !state.supported || !state.standalone) return;
    setBusy(true);
    setMessage("");
    try {
      const nextState = await enablePushNotifications(publicKey);
      setState(nextState);
      if (nextState.permission === "denied") {
        setMessage(blockedPermissionHelp());
        return;
      }
      if (nextState.subscribed) {
        setMessage("Đã bật thông báo trên thiết bị này.");
      }
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
      await disablePushNotifications();
      await refreshState();
      setMessage("Đã tắt thông báo trên thiết bị này.");
    } catch {
      setMessage("Không thể tắt thông báo. Hãy thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTestBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const result = await response.json().catch(() => null) as { ok?: boolean; status?: string; error?: string } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "test-failed");
      }

      if (result.status === "SENT") {
        setMessage("Đã gửi thông báo thử. Nếu Push hoạt động bình thường, thiết bị sẽ nhận được ngay.");
      } else if (result.status === "PARTIAL") {
        setMessage("Thông báo thử đã gửi thành công tới ít nhất một thiết bị của tài khoản Admin.");
      } else if (result.status === "FAILED") {
        setMessage("Máy chủ đã thử gửi nhưng Push thất bại. Hãy kiểm tra subscription và VAPID.");
      } else {
        setMessage("Không tìm thấy subscription Push đang hoạt động cho tài khoản này.");
      }
    } catch {
      setMessage("Không thể gửi thông báo thử. Hãy thử lại sau.");
    } finally {
      setTestBusy(false);
    }
  }

  const unavailable = !publicKey
    ? "Máy chủ chưa cấu hình VAPID keys."
    : !state.supported
      ? "Trình duyệt/thiết bị này không hỗ trợ Web Push."
      : !state.standalone
        ? "Hãy mở FCFUND từ PWA đã cài trên màn hình chính để bật thông báo."
        : null;

  const blocked = state.permission === "denied";

  return (
    <article className="panel push-settings-card">
      <div className="panel-heading">
        <div><span className="eyebrow">PWA</span><h2>Thông báo</h2></div>
        <span className={"status-badge " + (state.subscribed ? "active" : "inactive")}>
          {state.subscribed ? "Đang bật" : blocked ? "Bị chặn" : "Đang tắt"}
        </span>
      </div>
      <p className="panel-note">Nhận thông báo về trận đấu, đội hình, kết quả, khoản phải đóng và tiền nộp.</p>
      {unavailable && <p className="push-settings-warning">{unavailable}</p>}
      {blocked && !unavailable && <p className="push-settings-warning">{blockedPermissionHelp()}</p>}
      {message && <p className="push-settings-message">{message}</p>}
      <div className="form-actions push-settings-actions">
        {state.subscribed
          ? <button className="button secondary" type="button" onClick={disable} disabled={busy}>{busy ? "Đang tắt…" : "Tắt thông báo"}</button>
          : <button className="button primary" type="button" onClick={enable} disabled={busy || Boolean(unavailable)}>{busy ? "Đang kiểm tra…" : blocked ? "Bật lại thông báo" : "Bật thông báo"}</button>}
        {isAdmin && (
          <button
            className="button secondary"
            type="button"
            onClick={sendTest}
            disabled={testBusy}
          >
            {testBusy ? "Đang gửi…" : "Gửi thông báo thử"}
          </button>
        )}
      </div>
      {isAdmin && <p className="push-settings-test-note">Nút test chỉ hiển thị với Administrator và gửi tới các thiết bị Push đang hoạt động của tài khoản Admin hiện tại.</p>}
    </article>
  );
}
