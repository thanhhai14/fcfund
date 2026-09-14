"use client";

import { useState } from "react";
import { Icon } from "./icon";

export function CopyPublicLinkButton({ path, label = "Sao chép liên kết", iconOnly = false }: { path: string; label?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const text = copied ? "Đã sao chép" : label;
  return <button type="button" className={`button secondary small ${iconOnly ? "report-share-icon-button" : ""}`} onClick={copy} aria-label={text} title={text}><Icon name={copied ? "check" : "copy"} />{!iconOnly && <span>{text}</span>}</button>;
}
