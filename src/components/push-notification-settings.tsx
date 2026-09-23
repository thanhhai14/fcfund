"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnPushDevices } from "./push-device-manager";
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
  const [testOpen, setTestOpen] = useState(false);
  const [testBody, setTestBody] = useState("");
  const [message, setMessage] = useState("");
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);

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
        setDeviceRefreshKey((value) => value + 1);
      }
    } catch {
      setMessage("Không thể bật thông báo. Hãy thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!isAdmin) return;
    setBusy(true);
    setMessage("");
    try {
      await disablePushNotifications();
      await refreshState();
      setDeviceRefreshKey((value) => value + 1);
      setMessage("Đã tắt thông báo trên thiết bị này.");
    } catch {
      setMessage("Không thể tắt thông báo. Hãy thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    const body = testBody.trim();
    if (!body) {
      setMessage("Hãy nhập nội dung thông báo.");
      return;
    }

    setTestBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        recipientCount?: number;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "test-failed");
      }

      if ((result.recipientCount ?? 0) === 0) {
        setMessage(result.message ?? "Không có thành viên nào đang có thiết bị đăng ký Push.");
      } else {
        setMessage(`Đã gửi thông báo tới ${result.recipientCount} thành viên có thiết bị Push đang hoạt động.`);
        setTestBody("");
        setTestOpen(false);
      }
    } catch (error) {
      setMessage(error instanceof Error && error.message !== "test-failed"
        ? error.message
        : "Không thể gửi thông báo. Hãy thử lại sau.");
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
  const active = state.subscribed && state.permission === "granted";

  return (
    <article className="panel push-settings-card">
      <div className="panel-heading">
        <div><span className="eyebrow">PWA</span><h2>Thông báo</h2></div>
        <span className={"status-badge " + (active ? "active" : "inactive")}>
          {active ? "Đang bật" : blocked ? "Bị chặn" : "Đang tắt"}
        </span>
      </div>
      <p className="panel-note">Nhận thông báo về trận đấu, đội hình, kết quả, khoản phải đóng và tiền nộp.</p>
      {unavailable && <p className="push-settings-warning">{unavailable}</p>}
      {blocked && !unavailable && <p className="push-settings-warning">{blockedPermissionHelp()}</p>}
      {message && <p className="push-settings-message">{message}</p>}

      <div className="form-actions push-settings-actions">
        {active ? (
          isAdmin
            ? <button className="button secondary" type="button" onClick={disable} disabled={busy}>{busy ? "Đang tắt…" : "Tắt thông báo"}</button>
            : <span className="push-settings-readonly">Thông báo đang hoạt động trên thiết bị này.</span>
        ) : (
          <button className="button primary" type="button" onClick={enable} disabled={busy || Boolean(unavailable)}>{busy ? "Đang kiểm tra…" : blocked ? "Bật lại thông báo" : "Bật thông báo"}</button>
        )}

        {isAdmin && (
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setTestOpen((value) => !value);
              setMessage("");
            }}
            disabled={testBusy}
          >
            {testOpen ? "Đóng gửi thử" : "Gửi thông báo thử"}
          </button>
        )}
      </div>

      {isAdmin && testOpen && (
        <div className="push-test-composer">
          <label>
            Nội dung thông báo
            <textarea
              value={testBody}
              onChange={(event) => setTestBody(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Nhập nội dung muốn gửi đến các thành viên..."
            />
          </label>
          <div className="push-test-composer-meta">
            <small>{testBody.length}/500 ký tự</small>
            <button
              className="button primary"
              type="button"
              onClick={sendTest}
              disabled={testBusy || !testBody.trim()}
            >
              {testBusy ? "Đang gửi…" : "Gửi"}
            </button>
          </div>
        </div>
      )}

      {isAdmin && <p className="push-settings-test-note">Thông báo thử sẽ gửi tới toàn bộ thành viên ACTIVE đang có ít nhất một thiết bị Push đã đăng ký.</p>}

      <OwnPushDevices refreshKey={deviceRefreshKey} isAdmin={isAdmin} />
    </article>
  );
}
