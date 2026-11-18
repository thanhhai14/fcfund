import { createHash } from "node:crypto";

export const ACB_SENDER = "mailalert@acb.com.vn";
export const ACB_SUBJECT = "ACB-Dich vu bao so du tu dong";
export const normalizeSubject = (value: string) => value.normalize("NFC").trim();
export const emailHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function parseAcbEmail(body: string) {
  const text = body.replace(/\r/g, "").replace(/\u00a0/g, " ");
  // Gmail's plain-text conversion can wrap bold values in asterisks.
  const amountMatches = [...text.matchAll(/Giao dịch mới nhất\s*:\s*Ghi có\s*(\*{0,2})\+([\d,]+)\.00\s*VND\1(?![\w*])/gi)];
  if (amountMatches.length !== 1 || /Ghi nợ/i.test(text)) return null;
  const amountText = amountMatches[0][2];
  const amount = Number(amountText.replace(/,/g, ""));
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(amountText)) return null;
  const account = text.match(/thông báo tài khoản\s+(\*{0,2})([^\s*]+)\1\s+của Quý khách/i)?.[2];
  const date = text.match(/tính đến\s+(\*{0,2})(\d{2})\/(\d{2})\/(\d{4})\1\s*\./i);
  const content = text.match(/Nội dung giao dịch\s*:\s*([^\n]+)/i)?.[1]?.trim()
    .replace(/\.\s*$/, "")
    .replace(/^(\*{1,2})([^*]+)\1$/, "$2");
  if (!account || !date || !content) return null;
  const transactionDate = `${date[4]}-${date[3]}-${date[2]}`;
  const parsedDate = new Date(`${transactionDate}T00:00:00+07:00`);
  if (!Number.isFinite(parsedDate.getTime()) || new Date(`${transactionDate}T00:00:00Z`).toISOString().slice(0, 10) !== transactionDate) return null;
  const references = [...content.toUpperCase().matchAll(/\bFCF\s+([A-HJ-NP-Z2-9]{6})\b/g)].map((match) => match[1]);
  if (references.length !== 1) return null;
  return { amount, account, transactionDate, content, reference: references[0] };
}

// Apps Script submits headers retrieved from Gmail, never a browser-supplied boolean.
export function hasAcbAuthentication(headers: string[]) {
  return headers.some((value) => /^mx\.google\.com\s*;/i.test(value.trim())
    && /\bdmarc=pass\b[^;]*\bheader\.from=acb\.com\.vn(?:[\s;]|$)/i.test(value)
    && /\bdkim=pass\b[^;]*\bheader\.(?:i=@|d=)(?:[a-z0-9-]+\.)*acb\.com\.vn(?:[\s;]|$)/i.test(value));
}
