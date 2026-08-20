import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const SCREENSHOT_DIR = path.join(process.cwd(), ".screenshots-production-live");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages[pages.length - 1];

  const url = page.url();
  const title = await page.title().catch(() => "N/A");

  console.log("=== CURRENT VISIBLE CHROME STATE ===");
  console.log(`Contexts: ${contexts.length}`);
  console.log(`Pages:    ${pages.length}`);
  console.log(`URL:      ${url}`);
  console.log(`Title:    "${title}"`);

  const screenshotPath = path.join(SCREENSHOT_DIR, "current-session-state.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot saved to: ${screenshotPath}`);

  // Check if we are on login, signup, onboarding, or dashboard
  let status = "unknown";
  if (url.includes("/login")) status = "login_page";
  else if (url.includes("/app/brand")) status = "brand_profile";
  else if (url.includes("/app/onboarding")) status = "onboarding_wizard";
  else if (url.includes("/app")) status = "dashboard";

  console.log(`Status category: ${status}`);
}

main().catch((err) => {
  console.error("Inspect error:", err.message);
  process.exit(1);
});
