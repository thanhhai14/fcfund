"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

type BankApp = {
  appId: string;
  appLogo: string | null;
  appName: string;
  bankName: string;
  monthlyInstall: number;
  deeplink: string;
};

type BankAppsResponse = {
  ok?: boolean;
  apps?: BankApp[];
  error?: string;
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

export function DebtPaymentButton({
  reminderId,
  amount,
  initialMessage,
}: {
  reminderId: string;
  amount: number;
  initialMessage?: string | null;
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

  return (
    <div className="debt-payment">
      <button
        type="button"
        className="button primary debt-payment-button"
        onClick={() => void openPicker()}
      >
        Thanh toán {formatMoney(amount)}
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
                <span className="eyebrow">Thanh toán công nợ</span>
                <h2 id="bank-picker-title">Chọn ứng dụng ngân hàng</h2>
                <p>{formatMoney(amount)} · Mỗi lần thanh toán đều chọn lại ngân hàng.</p>
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
                  href={`/api/payments/debt-reminder/${encodeURIComponent(reminderId)}?app=${encodeURIComponent(app.appId)}`}
                >
                  <span className="bank-picker-logo">
                    {app.appLogo
                      ? <img src={app.appLogo} alt="" loading="lazy" />
                      : <span>{app.appName.slice(0, 2).toUpperCase()}</span>}
                  </span>
                  <span className="bank-picker-copy">
                    <strong>{app.appName}</strong>
                    <small>{app.bankName}</small>
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
