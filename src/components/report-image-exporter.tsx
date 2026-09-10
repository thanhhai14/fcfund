"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

const REPORT_TIMEZONE = "Asia/Ho_Chi_Minh";

function capturedAtLabel() {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: REPORT_TIMEZONE,
  }).format(new Date());
}

async function waitForImages(node: HTMLElement) {
  await Promise.all(Array.from(node.querySelectorAll("img")).map(async (image) => {
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 5000);
    });
  }));
}

export function ReportImageExporter({
  title,
  subtitle,
  clubName,
  logoUrl,
  filename,
  width,
  children,
}: {
  title: string;
  subtitle: string;
  clubName: string;
  logoUrl: string | null;
  filename: string;
  width: number;
  children: React.ReactNode;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const capturedAtRef = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview]);

  function closePreview() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function download() {
    if (!preview) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = preview.url;
    link.click();
  }

  async function share() {
    if (!preview) return;
    const file = new File([preview.blob], filename, { type: "image/png" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }
    download();
  }

  async function capture() {
    const node = exportRef.current;
    if (!node || busy) return;
    setBusy(true);
    setError("");
    closePreview();
    if (capturedAtRef.current) capturedAtRef.current.textContent = capturedAtLabel();

    try {
      await document.fonts?.ready;
      await waitForImages(node);
      const { toBlob } = await import("html-to-image");
      const imageArea = node.scrollWidth * node.scrollHeight;
      const pixelRatio = Math.max(1, Math.min(2, Math.sqrt(14_000_000 / Math.max(imageArea, 1))));
      const blob = await toBlob(node, {
        backgroundColor: "#f7f4f5",
        cacheBust: true,
        includeQueryParams: true,
        pixelRatio,
        width: node.scrollWidth,
        height: node.scrollHeight,
        fetchRequestInit: { credentials: "include" },
      });
      if (!blob) throw new Error("Không tạo được dữ liệu ảnh.");
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch (captureError) {
      console.error(captureError);
      setError("Không thể tạo ảnh báo cáo. Vui lòng thử lại sau khi ảnh đại diện đã tải xong.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="report-export-trigger">
      <button type="button" className="button secondary small" onClick={() => void capture()} disabled={busy}><Icon name="camera" /> {busy ? "Đang tạo ảnh..." : "Chụp báo cáo"}</button>
      {error && <small role="alert">{error}</small>}
    </div>
    <div className="report-export-source" aria-hidden="true">
      <div className="report-export-sheet" ref={exportRef} style={{ width }}>
        <header className="report-export-header">
          <div className="report-export-brand">
            {logoUrl ? <img src={logoUrl} alt="" width="72" height="72" /> : <span>{clubName.slice(0, 2).toUpperCase()}</span>}
            <div><small>BÁO CÁO QUỸ ĐỘI BÓNG</small><strong>{clubName}</strong></div>
          </div>
          <div className="report-export-title"><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="report-export-time"><small>NGÀY CHỤP BÁO CÁO</small><span ref={capturedAtRef}>{capturedAtLabel()}</span><b>Asia/Ho_Chi_Minh</b></div>
        </header>
        {children}
        <footer className="report-export-footer"><span>{clubName}</span><span>FCFund · Báo cáo được tạo từ dữ liệu đang hiển thị</span></footer>
      </div>
    </div>
    {preview && createPortal(<div className="report-export-preview" role="presentation" onMouseDown={closePreview}>
      <section role="dialog" aria-modal="true" aria-label="Xem trước ảnh báo cáo" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">Ảnh báo cáo</span><h2>Xem trước khi lưu</h2></div><button type="button" aria-label="Đóng" onClick={closePreview}>×</button></header>
        <div className="report-export-preview-image"><img src={preview.url} alt={title} /></div>
        <footer><button type="button" className="button secondary" onClick={closePreview}>Đóng</button><button type="button" className="button secondary" onClick={download}>Tải PNG</button><button type="button" className="button" onClick={() => void share()}>Chia sẻ</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
