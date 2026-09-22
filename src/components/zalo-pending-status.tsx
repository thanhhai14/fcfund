"use client";

import { useEffect, useState } from "react";

type PendingStatus = "PENDING" | "APPROVED" | "REJECTED" | "ERROR";

export function ZaloPendingStatus({ initialStatus }: { initialStatus: PendingStatus }) {
  const [status, setStatus] = useState<PendingStatus>(initialStatus);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "REJECTED" || status === "ERROR") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const response = await fetch("/api/auth/zalo/pending/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json() as {
          status?: PendingStatus;
          message?: string;
          redirect?: string;
        };

        if (cancelled) return;

        if (data.status === "APPROVED" && data.redirect) {
          setStatus("APPROVED");
          setMessage("Đã được duyệt. Đang vào Liên đoàn…");
          window.location.replace(data.redirect);
          return;
        }

        if (data.status === "REJECTED") {
          setStatus("REJECTED");
          setMessage(data.message ?? "Yêu cầu liên kết Zalo đã bị từ chối.");
          return;
        }

        if (!response.ok || data.status === "ERROR") {
          setStatus("ERROR");
          setMessage(data.message ?? "Không kiểm tra được trạng thái yêu cầu.");
          return;
        }

        setStatus("PENDING");
        timer = setTimeout(check, 5000);
      } catch {
        if (cancelled) return;
        setMessage("Mất kết nối. FCFUND sẽ thử kiểm tra lại.");
        timer = setTimeout(check, 5000);
      }
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  return (
    <div className={"zalo-pending-state " + status.toLowerCase()} aria-live="polite">
      {status === "PENDING" && (
        <>
          <span className="zalo-pending-dot" aria-hidden="true" />
          <strong>Đang chờ Chủ Tịch Fifa duyệt</strong>
        </>
      )}
      {status === "APPROVED" && <strong>Đã được duyệt</strong>}
      {status === "REJECTED" && <strong>Yêu cầu đã bị từ chối</strong>}
      {status === "ERROR" && <strong>Không kiểm tra được trạng thái</strong>}
      {message && <p>{message}</p>}
    </div>
  );
}
