"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PushDevice = {
  id: string;
  userId: string;
  platform: string | null;
  deviceLabel: string | null;
  defaultLabel: string;
  enabled: boolean;
  lastSeenAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
};

type PushAdminUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "TREASURER" | "ORGANIZER" | "MEMBER";
  active: boolean;
  memberId: string | null;
  memberName: string | null;
  memberStatus: "ACTIVE" | "INACTIVE" | null;
};

type PushAdminMember = {
  id: string;
  fullName: string;
  userId: string | null;
  userDisplayName: string | null;
  userRole: "ADMIN" | "TREASURER" | "ORGANIZER" | "MEMBER" | null;
  userActive: boolean | null;
};

type DeviceResponse = {
  ok?: boolean;
  selfDevices?: PushDevice[];
  adminUsers?: PushAdminUser[];
  adminMembers?: PushAdminMember[];
  adminDevices?: PushDevice[];
  error?: string;
};

type DeviceFilter = "all" | "enabled" | "missing" | "error" | "disabled";

function formatDateTime(value: string | null) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN");
}

function deviceName(device: PushDevice) {
  return device.deviceLabel || device.defaultLabel;
}

function deviceStatus(device: PushDevice) {
  if (!device.enabled) return { label: "Đã tắt", className: "inactive" };
  if (device.failureCount > 0) return { label: "Có lỗi", className: "warning" };
  return { label: "Hoạt động", className: "active" };
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

async function requestDevice(
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
) {
  const response = await fetch("/api/push/devices", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await readJson(response);
  if (!response.ok || result?.ok !== true) {
    throw new Error(typeof result?.error === "string" ? result.error : "Thao tác thất bại.");
  }
  return result;
}

async function currentPushEndpoint() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

export function OwnPushDevices({ refreshKey = 0 }: { refreshKey?: number }) {
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/push/devices", { cache: "no-store" });
      const result = await response.json().catch(() => null) as DeviceResponse | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Không tải được thiết bị.");
      setDevices(result.selfDevices ?? []);

      const endpoint = await currentPushEndpoint();
      if (!endpoint) {
        setCurrentId(null);
        return;
      }

      const identify = await requestDevice("POST", { action: "identify", endpoint });
      setCurrentId(typeof identify.deviceId === "string" ? identify.deviceId : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được thiết bị.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);

  async function testDevice(device: PushDevice) {
    setBusyId(device.id);
    setMessage("");
    try {
      const result = await requestDevice("POST", { action: "test", id: device.id });
      setMessage(typeof result.message === "string" ? result.message : "Đã gửi thông báo thử.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không gửi được thông báo thử.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function renameDevice(device: PushDevice) {
    const value = window.prompt("Tên thiết bị", device.deviceLabel || device.defaultLabel);
    if (value === null) return;
    setBusyId(device.id);
    setMessage("");
    try {
      await requestDevice("PATCH", { id: device.id, deviceLabel: value });
      setMessage("Đã cập nhật tên thiết bị.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không đổi được tên thiết bị.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDevice(device: PushDevice) {
    if (device.id === currentId) return;
    if (!window.confirm(`Xóa thiết bị "${deviceName(device)}" khỏi danh sách Push?`)) return;
    setBusyId(device.id);
    setMessage("");
    try {
      await requestDevice("DELETE", { id: device.id });
      setMessage("Đã xóa thiết bị.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xóa được thiết bị.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="push-own-devices">
      <div className="push-device-section-heading">
        <div>
          <span className="eyebrow">Thiết bị của tôi</span>
          <h3>Push đã đăng ký</h3>
        </div>
        <span className="push-device-count">{devices.length}</span>
      </div>

      {message && <p className="push-settings-message">{message}</p>}
      {loading && <p className="empty-state-inline">Đang tải thiết bị…</p>}
      {!loading && !devices.length && (
        <p className="empty-state-inline">Chưa có thiết bị Push nào được đăng ký cho tài khoản này.</p>
      )}

      <div className="push-device-list">
        {devices.map((device) => {
          const status = deviceStatus(device);
          const current = device.id === currentId;
          return (
            <article className="push-device-row" key={device.id}>
              <div className="push-device-row-main">
                <div className="push-device-title">
                  <strong>{deviceName(device)}</strong>
                  {current && <span className="push-device-current">Thiết bị này</span>}
                </div>
                <small>
                  Đăng ký {formatDateTime(device.createdAt)} · Hoạt động gần nhất {formatDateTime(device.lastSeenAt)}
                </small>
                <small>
                  Push thành công gần nhất: {formatDateTime(device.lastSuccessAt)}
                  {device.lastFailureAt ? ` · Lỗi gần nhất: ${formatDateTime(device.lastFailureAt)}` : ""}
                </small>
              </div>
              <span className={`status-badge ${status.className}`}>{status.label}</span>
              <div className="push-device-actions">
                <button
                  className="button secondary small"
                  type="button"
                  onClick={() => testDevice(device)}
                  disabled={busyId === device.id || !device.enabled}
                >
                  Gửi thử
                </button>
                <button
                  className="button secondary small"
                  type="button"
                  onClick={() => renameDevice(device)}
                  disabled={busyId === device.id}
                >
                  Đổi tên
                </button>
                {!current && (
                  <button
                    className="button danger small"
                    type="button"
                    onClick={() => deleteDevice(device)}
                    disabled={busyId === device.id}
                  >
                    Xóa
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function PushDeviceManager() {
  const [users, setUsers] = useState<PushAdminUser[]>([]);
  const [members, setMembers] = useState<PushAdminMember[]>([]);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/push/devices", { cache: "no-store" });
      const result = await response.json().catch(() => null) as DeviceResponse | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Không tải được thiết bị Push.");
      setUsers(result.adminUsers ?? []);
      setMembers(result.adminMembers ?? []);
      setDevices(result.adminDevices ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được thiết bị Push.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const devicesByUser = useMemo(() => {
    const map = new Map<string, PushDevice[]>();
    devices.forEach((device) => {
      const list = map.get(device.userId) ?? [];
      list.push(device);
      map.set(device.userId, list);
    });
    return map;
  }, [devices]);

  const memberByUserId = useMemo(
    () => new Map(members.flatMap((member) => member.userId ? [[member.userId, member] as const] : [])),
    [members],
  );
  const enabledUserIds = useMemo(
    () => new Set(devices.filter((device) => device.enabled).map((device) => device.userId)),
    [devices],
  );

  const summary = useMemo(() => ({
    members: members.length,
    covered: members.filter((member) => (
      member.userId
      && member.userActive
      && enabledUserIds.has(member.userId)
    )).length,
    activeDevices: devices.filter((device) => device.enabled).length,
    errorDevices: devices.filter((device) => device.enabled && device.failureCount > 0).length,
    disabledDevices: devices.filter((device) => !device.enabled).length,
  }), [devices, enabledUserIds, members]);

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi-VN");
    const managedUsers = users.filter((user) => {
      const userDevices = devicesByUser.get(user.id) ?? [];
      return userDevices.length > 0 || memberByUserId.has(user.id);
    });

    const accountRows = managedUsers.flatMap((user) => {
      const member = memberByUserId.get(user.id) ?? null;
      const userDevices = devicesByUser.get(user.id) ?? [];
      const enabledDevices = userDevices.filter((device) => device.enabled);
      const missing = Boolean(member && (!user.active || enabledDevices.length === 0));

      return userDevices.length
        ? userDevices.map((device) => ({ user, member, device, missing }))
        : [{ user, member, device: null as PushDevice | null, missing }];
    });

    const noAccountRows = members
      .filter((member) => !member.userId)
      .map((member) => ({
        user: null as PushAdminUser | null,
        member,
        device: null as PushDevice | null,
        missing: true,
      }));

    return [...accountRows, ...noAccountRows].filter(({ user, member, device, missing }) => {
      if (filter === "enabled" && !device?.enabled) return false;
      if (filter === "missing" && !missing) return false;
      if (filter === "error" && !(device?.enabled && device.failureCount > 0)) return false;
      if (filter === "disabled" && !(device && !device.enabled)) return false;

      if (!normalizedSearch) return true;
      const haystack = [
        member?.fullName ?? "",
        user?.displayName ?? "",
        device?.deviceLabel ?? "",
        device?.defaultLabel ?? "",
      ].join(" ").toLocaleLowerCase("vi-VN");
      return haystack.includes(normalizedSearch);
    });
  }, [devicesByUser, filter, memberByUserId, members, search, users]);

  async function mutateDevice(
    device: PushDevice,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusyId(device.id);
    setMessage("");
    try {
      const result = await requestDevice(method, body);
      setMessage(typeof result.message === "string" ? result.message : successMessage);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Thao tác thất bại.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function renameDevice(device: PushDevice) {
    const value = window.prompt("Tên thiết bị", device.deviceLabel || device.defaultLabel);
    if (value === null) return;
    void mutateDevice(device, "PATCH", { id: device.id, deviceLabel: value }, "Đã cập nhật tên thiết bị.");
  }

  function removeDevice(device: PushDevice) {
    if (!window.confirm(`Xóa subscription "${deviceName(device)}"? Thiết bị sẽ phải đăng ký Push lại để nhận thông báo.`)) return;
    void mutateDevice(device, "DELETE", { id: device.id }, "Đã xóa subscription.");
  }

  return (
    <article className="panel push-device-manager">
      <div className="panel-heading push-manager-heading">
        <div>
          <span className="eyebrow">Quản trị Push</span>
          <h2>Thiết bị Push của thành viên</h2>
          <p>Theo dõi coverage, lỗi gửi và quản lý từng subscription mà không cần truy cập database.</p>
        </div>
        <button className="button secondary small" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      <div className="push-manager-summary">
        <div><small>Thành viên</small><strong>{summary.members}</strong></div>
        <div><small>Có Push</small><strong>{summary.covered}</strong><span>{summary.members ? Math.round(summary.covered / summary.members * 100) : 0}%</span></div>
        <div><small>Thiết bị active</small><strong>{summary.activeDevices}</strong></div>
        <div><small>Có lỗi</small><strong>{summary.errorDevices}</strong></div>
        <div><small>Đã tắt</small><strong>{summary.disabledDevices}</strong></div>
      </div>

      <div className="push-manager-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm thành viên hoặc thiết bị…"
          aria-label="Tìm thiết bị Push"
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value as DeviceFilter)} aria-label="Lọc thiết bị Push">
          <option value="all">Tất cả</option>
          <option value="enabled">Có Push</option>
          <option value="missing">Chưa có Push</option>
          <option value="error">Có lỗi</option>
          <option value="disabled">Đã tắt</option>
        </select>
      </div>

      {message && <p className="push-settings-message">{message}</p>}

      <div className="push-manager-list">
        {rows.map(({ user, member, device, missing }, index) => {
          const status = device ? deviceStatus(device) : null;
          const displayName = member?.fullName || user?.displayName || "Không xác định";
          return (
            <article className="push-manager-row" key={device?.id ?? `${user?.id ?? member?.id ?? "unknown"}-missing-${index}`}>
              <div className="push-manager-member">
                <strong>{displayName}</strong>
                <small>
                  {user
                    ? `${member && user.displayName !== member.fullName ? `${user.displayName} · ` : ""}${user.role}${!user.active ? " · Tài khoản đã khóa" : ""}`
                    : "Chưa có tài khoản đăng nhập"}
                </small>
              </div>

              <div className="push-manager-device">
                {device ? (
                  <>
                    <strong>{deviceName(device)}</strong>
                    <small>Hoạt động: {formatDateTime(device.lastSeenAt)}</small>
                    <small>Thành công: {formatDateTime(device.lastSuccessAt)}</small>
                    {device.lastFailureAt && <small>Lỗi: {formatDateTime(device.lastFailureAt)} · {device.failureCount} lần</small>}
                  </>
                ) : (
                  <>
                    <strong>{user ? "Chưa đăng ký thiết bị" : "Chưa có tài khoản liên kết"}</strong>
                    <small>
                      {user
                        ? "Thành viên này hiện không có subscription Push."
                        : "Cần tạo hoặc liên kết tài khoản trước khi có thể đăng ký Push."}
                    </small>
                  </>
                )}
              </div>

              <div className="push-manager-status">
                {device
                  ? <span className={`status-badge ${status?.className ?? "inactive"}`}>{status?.label}</span>
                  : missing && <span className="status-badge inactive">Chưa có Push</span>}
              </div>

              {device && (
                <div className="push-manager-actions">
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={busyId === device.id || !device.enabled}
                    onClick={() => void mutateDevice(device, "POST", { action: "test", id: device.id }, "Đã gửi thử.")}
                  >
                    Gửi thử
                  </button>
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={busyId === device.id}
                    onClick={() => void mutateDevice(
                      device,
                      "PATCH",
                      { id: device.id, enabled: !device.enabled },
                      device.enabled ? "Đã tắt thiết bị." : "Đã bật lại thiết bị.",
                    )}
                  >
                    {device.enabled ? "Tắt" : "Bật lại"}
                  </button>
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={busyId === device.id}
                    onClick={() => renameDevice(device)}
                  >
                    Đổi tên
                  </button>
                  <button
                    className="button danger small"
                    type="button"
                    disabled={busyId === device.id}
                    onClick={() => removeDevice(device)}
                  >
                    Xóa
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!loading && !rows.length && <p className="empty-state-inline">Không có thiết bị phù hợp bộ lọc.</p>}
      </div>
    </article>
  );
}
