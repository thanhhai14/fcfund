import assert from "node:assert/strict";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { emailHash, ACB_SUBJECT } from "../src/lib/acb-email-parser";

async function main() {
  const databaseUrl = process.env.FCFUND_TEST_DATABASE_URL;
  const baseUrl = process.env.FCFUND_TEST_BASE_URL ?? "http://127.0.0.1:3107";
  assert.ok(databaseUrl, "Set FCFUND_TEST_DATABASE_URL to a disposable local test DB.");
  const parsedUrl = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(parsedUrl.hostname) && parsedUrl.pathname.endsWith("_test"), "Only disposable localhost *_test databases allowed.");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname));
  const sql = postgres(databaseUrl, { max: 2 });
  const key = `fcf_acb_${randomBytes(32).toString("hex")}`;
  let clubId = "";
  try {
    const [club] = await sql`insert into clubs (name) values ('ACB integration test') returning id`;
    clubId = club.id;
    const [member] = await sql`insert into members (club_id, code, full_name, phone) values (${clubId}, 'TEST', 'ACB Test Member', '0000000000') returning id, payment_reference`;
    await sql`insert into acb_email_settings (club_id, mode, mailbox, account_pattern, key_hash) values (${clubId}, 'SIMULATE', 'test@example.com', 'xxxxx1234', ${emailHash(key)})`;
    const base = {
      mailbox: "test@example.com", receivedAt: new Date().toISOString(), sender: "ACB <mailalert@acb.com.vn>", subject: ACB_SUBJECT,
      authenticationResults: ["mx.google.com; dkim=pass header.i=@acb.com.vn; dmarc=pass header.from=acb.com.vn"],
      body: `ACB trân trọng thông báo tài khoản xxxxx1234 của Quý khách đã thay đổi số dư như sau:\nSố dư mới của tài khoản trên là: 602,903.00 VND tính đến 13/11/2026.\nGiao dịch mới nhất:Ghi có +10,000.00 VND.\nNội dung giao dịch: FCF ${member.payment_reference} TEST MEMBER.`,
    };
    const post = async (messageId: string, extra = {}, apiKey = key) => {
      const response = await fetch(`${baseUrl}/api/integrations/acb-email`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ ...base, messageId, ...extra }) });
      return { code: response.status, data: await response.json() };
    };
    assert.equal((await post("unauthorized", {}, `fcf_acb_${"0".repeat(64)}`)).code, 401);
    assert.equal((await post("simulation")).data.status, "SIMULATED");
    assert.equal(Number((await sql`select count(*) from fund_transactions where club_id=${clubId}`)[0].count), 0);
    // Once enabled, old and simulated emails remain non-financial.
    await sql`update acb_email_settings set mode='LIVE', activated_at=now()-interval '1 minute' where club_id=${clubId}`;
    assert.equal((await post("simulation")).data.status, "SIMULATED");
    assert.equal((await post("old", { receivedAt: "2020-01-01T00:00:00Z" })).data.status, "IGNORED");
    assert.equal((await post("subject", { subject: `Fwd: ${ACB_SUBJECT}` })).data.status, "IGNORED");
    assert.equal((await post("sender", { sender: "fake@example.com" })).data.status, "IGNORED");
    assert.equal((await post("auth", { authenticationResults: [] })).data.status, "IGNORED");
    assert.equal((await post("account", { body: base.body.replace("xxxxx1234", "wrong") })).data.status, "IGNORED");
    assert.equal((await post("nomember", { body: base.body.replace(member.payment_reference, "ZZZZZZ") })).data.status, "IGNORED");
    const body = base.body.replace("10,000.00", "20,000.00");
    assert.equal((await post("live", { body })).data.status, "RECORDED");
    assert.equal((await post("live", { body })).data.status, "RECORDED");
    assert.equal(Number((await sql`select count(*) from fund_transactions where club_id=${clubId}`)[0].count), 1);
    assert.equal((await post("same-details", { body })).data.status, "REVIEW_REQUIRED");
    const concurrentBody = base.body.replace("10,000.00", "30,000.00");
    const concurrent = await Promise.all([post("parallel", { body: concurrentBody }), post("parallel", { body: concurrentBody })]);
    assert.ok(concurrent.every((response) => response.data.status === "RECORDED"));
    assert.equal(Number((await sql`select count(*) from fund_transactions where club_id=${clubId}`)[0].count), 2);
    // Exercise tombstone behavior after the same soft-delete/update used by the financial action.
    await sql`update fund_transactions set deleted_at=now() where club_id=${clubId} and amount=20000`;
    await sql`update acb_email_imports set status='REVERSED' where club_id=${clubId} and message_id='live'`;
    assert.equal((await post("live", { body })).data.status, "REVERSED");
    assert.equal((await post("reversed-new-id", { body })).data.status, "REVIEW_REQUIRED");
    await sql`insert into fund_transactions (club_id,member_id,direction,kind,amount,transaction_date) values (${clubId},${member.id},'IN','MEMBER_PAYMENT',40000,'2026-11-13')`;
    assert.equal((await post("manual", { body: base.body.replace("10,000.00", "40,000.00") })).data.status, "REVIEW_REQUIRED");
    await sql`update members set status='INACTIVE' where id=${member.id}`;
    assert.equal((await post("inactive", { body: base.body.replace("10,000.00", "50,000.00") })).data.status, "IGNORED");
    await sql`update acb_email_settings set mode='OFF' where club_id=${clubId}`;
    assert.equal((await post("disabled")).code, 403);
    console.log("ACB API: simulation, exact subject, authentication, cutoff, concurrent dedupe, tombstones, manual duplicate and disabled-mode checks passed on disposable local DB.");
  } finally {
    if (clubId) {
      await sql`delete from acb_email_imports where club_id=${clubId}`;
      await sql`delete from activity_logs where club_id=${clubId}`;
      await sql`delete from fund_transactions where club_id=${clubId}`;
      await sql`delete from members where club_id=${clubId}`;
      await sql`delete from clubs where id=${clubId}`;
    }
    await sql.end();
  }
}
main().catch(() => { console.error("ACB API test failed; inspect local test server logs. No production DB is permitted."); process.exitCode = 1; });
