"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

const REPORT_TIMEZONE = "Asia/Ho_Chi_Minh";

function needsSafariWarmup() {
  const userAgent = window.navigator.userAgent;
  return /AppleWebKit/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android)/i.test(userAgent);
}

function capturedAtLabel() {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: REPORT_TIMEZONE,
  }).format(new Date());
}

async function waitForImages(node: HTMLElement) {
  await Promise.all(Array.from(node.querySelectorAll("img")).map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
        window.setTimeout(resolve, 8000);
      });
    }
    if (image.naturalWidth > 0 && typeof image.decode === "function") {
      await Promise.race([
        image.decode().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
      ]);
    }
  }));
}

async function blobToThumbnailDataUrl(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Không giải mã được ảnh.")), { once: true });
    });
    if (typeof image.decode === "function") await image.decode().catch(() => undefined);
    const maxDimension = 128;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không tạo được thumbnail avatar.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }));
}

async function inlineImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  const originals = images.map((image) => ({
    image,
    src: image.getAttribute("src"),
    srcset: image.getAttribute("srcset"),
  }));
  const restore = () => originals.forEach(({ image, src, srcset }) => {
    if (src === null) image.removeAttribute("src");
    else image.setAttribute("src", src);
    if (srcset === null) image.removeAttribute("srcset");
    else image.setAttribute("srcset", srcset);
  });
  const imagesBySource = new Map<string, HTMLImageElement[]>();

  images.forEach((image) => {
    const source = image.currentSrc || image.src;
    if (!source || source.startsWith("data:") || source.startsWith("blob:")) return;
    imagesBySource.set(source, [...(imagesBySource.get(source) ?? []), image]);
  });

  let failedImages = 0;
  await runWithConcurrency(Array.from(imagesBySource.entries()), 3, async ([source, sourceImages]) => {
    try {
      const response = await fetch(source, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`Không tải được ảnh (${response.status}).`);
      const dataUrl = await blobToThumbnailDataUrl(await response.blob());
      sourceImages.forEach((image) => {
        image.removeAttribute("srcset");
        image.src = dataUrl;
      });
    } catch {
      failedImages += sourceImages.length;
    }
  });

  if (failedImages > 0) {
    restore();
    throw new Error(`${failedImages} ảnh chưa tải được; đã dừng chụp để tránh báo cáo thiếu avatar.`);
  }

  await waitForImages(node);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
  return restore;
}

export function ReportImageExporter({
  title,
  subtitle,
  clubName,
  logoUrl,
  filename,
  width,
  iconOnly = false,
  children,
}: {
  title: string;
  subtitle: string;
  clubName: string;
  logoUrl: string | null;
  filename: string;
  width: number;
  iconOnly?: boolean;
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

    let restoreImages: (() => void) | undefined;
    try {
      await document.fonts?.ready;
      restoreImages = await inlineImages(node);
      const { toBlob } = await import("html-to-image");
      const imageArea = node.scrollWidth * node.scrollHeight;
      const pixelRatio = Math.max(1, Math.min(2, Math.sqrt(14_000_000 / Math.max(imageArea, 1))));
      const renderOptions = {
        backgroundColor: "#f7f4f5",
        cacheBust: true,
        includeQueryParams: true,
        pixelRatio,
        width: node.scrollWidth,
        height: node.scrollHeight,
        fetchRequestInit: { credentials: "include" },
      } as const;
      if (needsSafariWarmup()) {
        await toBlob(node, renderOptions);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      }
      const blob = await toBlob(node, renderOptions);
      if (!blob) throw new Error("Không tạo được dữ liệu ảnh.");
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch (captureError) {
      console.error(captureError);
      setError("Không thể tạo ảnh báo cáo. Vui lòng thử lại sau khi ảnh đại diện đã tải xong.");
    } finally {
      restoreImages?.();
      setBusy(false);
    }
  }

  return <>
    <div className="report-export-trigger">
      <button type="button" className={`button secondary small ${iconOnly ? "report-export-icon-button" : ""}`} onClick={() => void capture()} disabled={busy} aria-label={busy ? "Đang tạo ảnh báo cáo" : "Chụp báo cáo"} title={busy ? "Đang tạo ảnh..." : "Chụp báo cáo"}><Icon name="camera" />{!iconOnly && <span>{busy ? "Đang tạo ảnh..." : "Chụp báo cáo"}</span>}</button>
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
