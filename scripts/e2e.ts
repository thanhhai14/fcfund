import puppeteer from "puppeteer-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForText(page: import("puppeteer-core").Page, text: string) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    { timeout: 10_000 },
    text,
  );
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const response = await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0" });
  assert(response?.ok(), "Trang đăng nhập không trả về HTTP 200.");
  await page.type('input[name="phone"]', "0900000000");
  await page.type('input[name="password"]', "Trailang123");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click(".login-form button"),
  ]);
  assert(page.url().includes("/dashboard"), "Đăng nhập không chuyển đến dashboard.");
  await waitForText(page, "Số dư quỹ hiện tại");
  await page.screenshot({ path: "/tmp/fcfund-dashboard.png", fullPage: true });

  for (const route of ["/members", "/charges", "/transactions", "/matches", "/reports", "/settings"]) {
    const routeResponse = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle0" });
    assert(routeResponse?.ok(), `${route} không trả về HTTP 200.`);
    assert(!(await page.content()).includes("Application error"), `${route} có Application error.`);
  }

  await page.goto(`${baseUrl}/members`, { waitUntil: "networkidle0" });
  await page.click("details.action-disclosure > summary");
  const suffix = Date.now().toString().slice(-5);
  const memberName = `Thành viên kiểm thử ${suffix}`;
  await page.type('input[name="code"]', `TEST${suffix}`);
  await page.type('input[name="fullName"]', memberName);
  await page.type('input[name="phone"]', `091${suffix}00`);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    page.$eval("details.action-disclosure form", (form) => (form as HTMLFormElement).requestSubmit()),
  ]);
  await page.reload({ waitUntil: "networkidle0" });
  await waitForText(page, memberName);

  await page.goto(`${baseUrl}/charges`, { waitUntil: "networkidle0" });
  await page.click("details.action-disclosure > summary");
  const memberValue = await page.$eval(
    'select[name="memberId"]',
    (select, name) => [...(select as HTMLSelectElement).options].find((option) => option.text.includes(String(name)))?.value,
    memberName,
  );
  assert(memberValue, "Không tìm thấy thành viên mới trong form khoản thu.");
  await page.select('select[name="memberId"]', memberValue);
  const waterType = await page.$eval(
    'select[name="chargeTypeId"]',
    (select) => [...(select as HTMLSelectElement).options].find((option) => option.text.includes("Mời nước"))?.value,
  );
  assert(waterType, "Không tìm thấy loại thu Mời nước.");
  await page.select('select[name="chargeTypeId"]', waterType);
  await page.$eval('input[name="quantity"]', (input) => {
    (input as HTMLInputElement).value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    page.$eval("details.action-disclosure form", (form) => (form as HTMLFormElement).requestSubmit()),
  ]);

  await page.goto(`${baseUrl}/transactions`, { waitUntil: "networkidle0" });
  await page.click("details.action-disclosure > summary");
  await page.select('select[name="kind"]', "MEMBER_PAYMENT");
  await page.select('select[name="memberId"]', memberValue);
  await page.type('input[name="amount"]', "100000");
  await page.type('textarea[name="note"]', "Kiểm thử đóng dư");
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    page.$eval("details.action-disclosure form", (form) => (form as HTMLFormElement).requestSubmit()),
  ]);

  await page.goto(`${baseUrl}/reports`, { waitUntil: "networkidle0" });
  await waitForText(page, memberName);
  const body = await page.evaluate(() => document.body.innerText);
  assert(body.includes("+28.000"), "Số dư kiểm thử không đúng: phải đóng 72K, đã nộp 100K, dư 28K.");

    console.log("E2E passed: login, routes, member, charge, payment and balance.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
