"use client";

import { useState } from "react";

export function CopyBankAccount({ account }: { account: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="button secondary small" onClick={async () => {
    try { await navigator.clipboard.writeText(account); setCopied(true); }
    catch { setCopied(false); }
  }}>{copied ? "Đã sao chép" : "Sao chép số tài khoản"}</button>;
}
