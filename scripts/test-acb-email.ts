import assert from "node:assert/strict";
import { ACB_SUBJECT, emailHash, hasAcbAuthentication, normalizeSubject, parseAcbEmail } from "../src/lib/acb-email-parser";

const body = `Kính gửi Quý khách hàng.
ACB trân trọng thông báo tài khoản xxxxx1234 của Quý khách đã thay đổi số dư như sau:
Số dư mới của tài khoản trên là: 602,903.00 VND tính đến 13/11/2026.
Giao dịch mới nhất:Ghi có +10,000.00 VND.
Nội dung giao dịch: FCF A7K9P2 THANH HAI.
Cảm ơn Quý khách hàng.`;
const parsed = parseAcbEmail(body);
assert.deepEqual(parsed, { amount: 10000, account: "xxxxx1234", transactionDate: "2026-11-13", content: "FCF A7K9P2 THANH HAI", reference: "A7K9P2" });
assert.equal(parseAcbEmail(body.replace("Ghi có +10,000.00", "Ghi nợ -10,000.00")), null);
assert.equal(parseAcbEmail(body.replace("FCF A7K9P2 THANH HAI", "HB LUONG THANG 10/2026")), null);
assert.equal(parseAcbEmail(body.replace("FCF A7K9P2", "FCF A7K9P2 FCF CDEFGH")), null);
assert.equal(parseAcbEmail(body.replace("10,000.00", "10,000.50")), null);
assert.equal(parseAcbEmail(body.replace("10,000.00", "10,00.00")), null);
assert.equal(parseAcbEmail(body.replace("13/11/2026", "31/02/2026")), null);
assert.equal(parseAcbEmail(body.replace("13/11/2026", "13/13/2026")), null);
assert.equal(parseAcbEmail(body.replace("+10,000.00", "+0.00")), null);
assert.equal(parseAcbEmail(body.replace("A7K9P2", "A7K9P")), null);
assert.equal(parseAcbEmail(body.replace("A7K9P2", "A7K9P22")), null);
assert.equal(parseAcbEmail(body.replace("FCF A7K9P2", "fcf a7k9p2"))?.reference, "A7K9P2");
assert.equal(normalizeSubject(` ${ACB_SUBJECT} `), ACB_SUBJECT);
assert.notEqual(normalizeSubject(`Fwd: ${ACB_SUBJECT}`), ACB_SUBJECT);
assert.notEqual(normalizeSubject(ACB_SUBJECT.toLowerCase()), ACB_SUBJECT);
const auth = "mx.google.com; dkim=pass header.i=@acb.com.vn header.s=mail; dmarc=pass header.from=acb.com.vn";
assert.equal(hasAcbAuthentication([auth]), true);
assert.equal(hasAcbAuthentication([auth.replace("dkim=pass", "dkim=fail")]), false);
assert.equal(hasAcbAuthentication([auth.replace("mx.google.com", "attacker.example")]), false);
assert.equal(hasAcbAuthentication([auth.replaceAll("acb.com.vn", "acb.com.vn.evil.example")]), false);
assert.equal(hasAcbAuthentication([]), false);
assert.equal(emailHash("secret").length, 64);
const gmailBody = body
  .replace("602,903.00 VND tính đến 13/11/2026.", "*602,903.00 VND* tính đến *13/11/2026*.")
  .replace("Ghi có +10,000.00 VND.", "Ghi có *+10,000.00 VND*.")
  .replace("FCF A7K9P2 THANH HAI.", "*MBVCB.123456.FCF A7K9P2 THANH HAI.CT TU TEST*.");
assert.deepEqual(parseAcbEmail(gmailBody), {
  amount: 10000,
  account: "xxxxx1234",
  transactionDate: "2026-11-13",
  content: "MBVCB.123456.FCF A7K9P2 THANH HAI.CT TU TEST",
  reference: "A7K9P2",
});
assert.equal(parseAcbEmail(gmailBody.replace("*+10,000.00 VND*", "*-10,000.00 VND*")), null);
assert.equal(parseAcbEmail(gmailBody.replace("*13/11/2026*", "*31/02/2026*")), null);
assert.equal(parseAcbEmail(gmailBody.replace("*+10,000.00 VND*", "*+10,000.00 VND")), null);
assert.equal(parseAcbEmail(gmailBody.replace("*+10,000.00 VND*", "*+10,000.50 VND*")), null);
assert.equal(parseAcbEmail(gmailBody.replace("xxxxx1234", "**xxxxx1234**"))?.account, "xxxxx1234");
console.log("ACB email: parser and authentication checks passed; no database used.");
