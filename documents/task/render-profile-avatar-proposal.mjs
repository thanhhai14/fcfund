import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const input = resolve(root, "documents/task/profile-avatar-proposal.html");
const output = resolve(root, "documents/task/profile-avatar-proposal.png");
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(`file://${input}`, { waitUntil: "networkidle0" });
  await page.screenshot({ path: output, fullPage: false });
  console.log(output);
} finally {
  await browser.close();
}
