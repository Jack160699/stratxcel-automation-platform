import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const PROD_URL = "https://www.stratxcel.in";
const SCREENSHOT_DIR = path.join(process.cwd(), ".screenshots-production-live");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

async function takeScreenshot(page, name) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}-${ts}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  console.log(`  📸 Screenshot: ${filename}`);
  return filePath;
}

async function main() {
  log("Connecting over CDP to http://127.0.0.1:9222 ...");
  let browser;
  for (let i = 1; i <= 5; i++) {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      break;
    } catch (e) {
      if (i === 5) throw new Error("Could not connect to Chrome on port 9222. Is the browser running?");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const pages = context.pages();
  const page = pages[pages.length - 1] || (await context.newPage());

  log(`Connected successfully to visible browser!`);
  log(`Active URL: ${page.url()}`);
  log(`Active Page Title: "${await page.title().catch(() => "N/A")}"`);

  // Expose status check
  return { browser, context, page };
}

main().catch((err) => {
  console.error("Runner connection error:", err.message);
  process.exit(1);
});
