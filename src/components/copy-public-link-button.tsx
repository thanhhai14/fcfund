"use client";

import { useState } from "react";
import { Icon } from "./icon";

export function CopyPublicLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <button type="button" className="button secondary" onClick={copy}><Icon name={copied ? "check" : "copy"} /> {copied ? "Đã sao chép" : "Sao chép liên kết"}</button>;
}
