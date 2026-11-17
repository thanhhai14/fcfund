import assert from "node:assert/strict";
import postgres from "postgres";
import puppeteer from "puppeteer-core";
import { SignJWT } from "jose";

async function main() {
  const databaseUrl = process.env.FCFUND_TEST_DATABASE_URL;
  assert.ok(databaseUrl);
  const dbUrl = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(dbUrl.hostname) && dbUrl.pathname.endsWith("_test"));
  const baseUrl = process.env.FCFUND_TEST_BASE_URL ?? "http://127.0.0.1:3107";
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname));
  const sql = postgres(databaseUrl);
  let clubId = "";
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const [club] = await sql`insert into clubs (name) values ('ACB UI Test') returning id`;
    clubId = club.id;
    const [member] = await sql`insert into members (club_id, code, full_name, phone) values (${clubId},'UI','Thành viên kiểm thử','0000000000') returning id`;
    const [admin] = await sql`insert into users (club_id, display_name, phone_normalized, password_hash, role) values (${clubId},'Admin Test',${'ui-' + clubId.slice(0, 8)},'unused','ADMIN') returning id`;
    const token = await new SignJWT({ clubId, role: "ADMIN" }).setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode("fcfund-local-acb-test-only"));
    const page = await browser.newPage();
    await page.setCookie({ name: "fcfund_session", value: token, url: baseUrl });
    await page.setViewport({ width: 1440, height: 1000 });
    assert.equal((await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle0" }))?.status(), 200);
    await page.evaluate(() => {
      const group = [...document.querySelectorAll("details.settings-group")].find((item) => item.querySelector("summary")?.textContent?.includes("Tích hợp email ACB")) as HTMLDetailsElement;
      group.open = true;
    });
    await page.select('select[name="mode"]', 'SIMULATE');
    await page.type('input[name="mailbox"]', 'test@example.com');
    await page.type('input[name="accountPattern"]', 'xxxxx1234');
    await page.click('input[name="rotateKey"]');
    await page.$eval('input[name="mailbox"]', (input) => (input.closest("form") as HTMLFormElement).requestSubmit());
    await page.waitForFunction(() => document.body.innerText.includes("API key chỉ hiển thị lần này"));
    const [settings] = await sql`select mode, key_hash from acb_email_settings where club_id=${clubId}`;
    assert.equal(settings.mode, "SIMULATE");
    assert.equal(settings.key_hash.length, 64);
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Settings must fit mobile width including API key message.");
    const [transaction] = await sql`insert into fund_transactions (club_id, member_id,direction,kind,source,amount,transaction_date,note) values (${clubId},${member.id},'IN','MEMBER_PAYMENT','ACB_EMAIL',10000,current_date,'ACB UI payment') returning id`;
    await sql`insert into acb_email_imports (club_id,message_id,mailbox,received_at,status,reason,transaction_id,member_id) values (${clubId},'uitest','test@example.com',now(),'RECORDED','Test',${transaction.id},${member.id})`;
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/transactions`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("API tự động · ACB"));
    await page.click("details.row-disclosure > summary");
    await page.type('input[name="reason"]', 'Hủy giao dịch kiểm thử');
    await page.$eval('input[name="reason"]', (input) => (input.closest("form") as HTMLFormElement).requestSubmit());
    await page.waitForFunction(() => !document.body.innerText.includes("ACB UI payment"));
    assert.equal((await sql`select status from acb_email_imports where transaction_id=${transaction.id}`)[0].status, "REVERSED");
    assert.ok((await sql`select deleted_at from fund_transactions where id=${transaction.id}`)[0].deleted_at);
    console.log("ACB UI: Admin config/key creation, mobile width, transaction source and actual soft-delete action passed.");
  } finally {
    await browser.close();
    if (clubId) {
      await sql`delete from acb_email_imports where club_id=${clubId}`;
      await sql`delete from activity_logs where club_id=${clubId}`;
      await sql`delete from fund_transactions where club_id=${clubId}`;
      await sql`delete from users where club_id=${clubId}`;
      await sql`delete from members where club_id=${clubId}`;
      await sql`delete from clubs where id=${clubId}`;
    }
    await sql.end();
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "ACB UI test failed"); process.exitCode = 1; });
