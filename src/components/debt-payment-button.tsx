"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { formatMoney } from "@/lib/format";

type BankApp = {
  appId: string;
  appLogo: string | null;
  appName: string;
  bankName: string;
  monthlyInstall: number;
  deeplink: string;
  autofillSupported: boolean;
};

type BankAppsResponse = {
  ok?: boolean;
  apps?: BankApp[];
  error?: string;
};

const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Yêu cầu thanh toán không hợp lệ.",
  "not-configured": "Đội bóng chưa cấu hình đầy đủ ngân hàng nhận tiền.",
  "unsupported-device": "Thiết bị này chưa hỗ trợ mở ứng dụng ngân hàng trực tiếp.",
  "bank-app": "Ứng dụng ngân hàng được chọn không hợp lệ hoặc không còn được hỗ trợ.",
  settled: "Bạn hiện không còn khoản cần thanh toán.",
  failed: "Chưa thể tạo liên kết thanh toán. Vui lòng thử lại.",
};

function detectPlatform(): "android" | "ios" | null {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (
    /iPad|iPhone|iPod/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return null;
}

function toSafariScheme(url: string) {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    return `x-safari-${url}`;
  }
  return url;
}

export function DebtPaymentButton({
  reminderId,
  amount,
  initialMessage,
  paymentPath,
  testMode = false,
}: {
  reminderId: string;
  amount: number;
  initialMessage?: string | null;
  paymentPath?: string;
  testMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<BankApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(initialMessage ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visibleApps = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return apps;
    return apps.filter((app) =>
      `${app.appName} ${app.bankName}`.toLocaleLowerCase("vi").includes(normalized)
    );
  }, [apps, query]);

  async function openPicker() {
    setOpen(true);
    setQuery("");
    setMessage("");

    const platform = detectPlatform();
    if (!platform) {
      setApps([]);
      setMessage("Chức năng mở ứng dụng ngân hàng trực tiếp chỉ hỗ trợ trên điện thoại.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/payments/bank-apps?platform=${platform}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null) as BankAppsResponse | null;
      if (!response.ok || !data?.ok || !Array.isArray(data.apps)) {
        setApps([]);
        setMessage(data?.error || "Chưa tải được danh sách ứng dụng ngân hàng.");
        return;
      }
      setApps(data.apps);
    } catch {
      setApps([]);
      setMessage("Không kết nối được danh sách ứng dụng ngân hàng. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function openBankApp(event: MouseEvent<HTMLAnchorElement>, app: BankApp) {
    const platform = detectPlatform();
    if (platform !== "ios") return;

    event.preventDefault();
    setMessage("Đang mở Safari để tiếp tục thanh toán…");

    const endpoint = paymentPath ?? `/api/payments/debt-reminder/${encodeURIComponent(reminderId)}`;
    const requestUrl = `${endpoint}?app=${encodeURIComponent(app.appId)}&format=json`;

    try {
      const response = await fetch(requestUrl, { cache: "no-store" });
      const data = await response.json().catch(() => null) as {
        ok?: boolean;
        paymentUrl?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.ok || !data.paymentUrl) {
        setMessage(PAYMENT_ERROR_MESSAGES[data?.error ?? ""] || data?.error || "Chưa tạo được liên kết thanh toán.");
        return;
      }

      window.location.assign(toSafariScheme(data.paymentUrl));
    } catch {
      setMessage("Không thể mở Safari để thanh toán. Vui lòng thử lại.");
    }
  }

  return (
    <div className="debt-payment">
      <button
        type="button"
        className="button primary debt-payment-button"
        onClick={() => void openPicker()}
      >
        {testMode ? "Thanh toán thử" : "Thanh toán"} {formatMoney(amount)}
      </button>

      {message && <p className="panel-note debt-payment-message">{message}</p>}

      {open && (
        <div
          className="bank-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="bank-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-picker-title"
          >
            <header className="bank-picker-header">
              <div>
                <span className="eyebrow">{testMode ? "Kiểm tra thanh toán" : "Thanh toán công nợ"}</span>
                <h2 id="bank-picker-title">Chọn ứng dụng ngân hàng</h2>
                <p>
                  {formatMoney(amount)} · Mỗi lần thanh toán đều chọn lại ngân hàng.
                  {testMode ? " Đây là deeplink thật; chỉ xác nhận trong app ngân hàng nếu bạn muốn chuyển thử 1.000đ." : ""}
                </p>
              </div>
              <button
                type="button"
                className="bank-picker-close"
                onClick={() => setOpen(false)}
                aria-label="Đóng danh sách ngân hàng"
              >
                ×
              </button>
            </header>

            {!loading && apps.length > 0 && (
              <label className="bank-picker-search">
                <span className="sr-only">Tìm ngân hàng</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm MB Bank, Vietcombank, BIDV..."
                  autoComplete="off"
                />
              </label>
            )}

            <div className="bank-picker-list">
              {loading && <p className="bank-picker-status">Đang tải danh sách ngân hàng…</p>}

              {!loading && message && apps.length === 0 && (
                <div className="bank-picker-status">
                  <strong>Chưa thể mở ngân hàng</strong>
                  <p>{message}</p>
                </div>
              )}

              {!loading && apps.length > 0 && visibleApps.map((app) => (
                <a
                  key={app.appId}
                  className="bank-picker-item"
                  href={`${paymentPath ?? `/api/payments/debt-reminder/${encodeURIComponent(reminderId)}`}?app=${encodeURIComponent(app.appId)}`}
                  onClick={(event) => void openBankApp(event, app)}
                >
                  <span className="bank-picker-logo">
                    {app.appLogo
                      ? <img src={app.appLogo} alt="" loading="lazy" />
                      : <span>{app.appName.slice(0, 2).toUpperCase()}</span>}
                  </span>
                  <span className="bank-picker-copy">
                    <strong>{app.appName}</strong>
                    <small>{app.bankName}</small>
                    <small>{app.autofillSupported ? "Hỗ trợ điền sẵn thông tin" : "Chỉ mở ứng dụng ngân hàng"}</small>
                  </span>
                  <span className="bank-picker-open" aria-hidden="true">›</span>
                </a>
              ))}

              {!loading && apps.length > 0 && visibleApps.length === 0 && (
                <p className="bank-picker-status">Không tìm thấy ứng dụng ngân hàng phù hợp.</p>
              )}
            </div>

            <footer className="bank-picker-footer">
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>
                Hủy
              </button>
              <small>Nếu app ngân hàng không mở được, bạn vẫn có thể dùng QR hoặc sao chép số tài khoản.</small>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
