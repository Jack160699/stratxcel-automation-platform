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
  log(`📸 Screenshot: ${filename}`);
  return filePath;
}

async function main() {
  log("Attaching over CDP to http://127.0.0.1:9222 ...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages[pages.length - 1];

  log(`✓ Attached to browser! URL: ${page.url()}`);
  log(`  Page Title: "${await page.title()}"`);

  let lastUrl = page.url();
  let loggedIn = false;

  context.on("page", async (p) => {
    log(`[New Window/Tab Opened] ${p.url()}`);
  });

  while (true) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const activePages = context.pages();
      const curPage = activePages[activePages.length - 1] || page;
      const curUrl = curPage.url();

      if (curUrl !== lastUrl) {
        lastUrl = curUrl;
        log(`>>> [Navigation] URL: ${curUrl}`);

        if (!loggedIn && curUrl.includes("stratxcel.in/app")) {
          loggedIn = true;
          log(`\n🎉 [LOGIN DETECTED!] User reached authenticated workspace: ${curUrl}`);
          await curPage.waitForTimeout(2000);
          await takeScreenshot(curPage, "02-dashboard-landed");

          if (!curUrl.includes("/app/brand")) {
            log("Navigating to Business Profile & Digital Presence (/app/brand)...");
            await curPage.goto(`${PROD_URL}/app/brand`, { waitUntil: "networkidle" });
            await curPage.waitForTimeout(2000);
            await takeScreenshot(curPage, "03-brand-profile-presence");
          }

          // Read digital presence status
          const presence = await curPage.evaluate(async () => {
            const res = await fetch("/api/platform/integrations/status");
            return await res.json().catch(() => ({}));
          });
          log("Current Digital Presence Connections:");
          console.log(JSON.stringify(presence, null, 2));
        }

        // Check for OAuth callbacks
        if (curUrl.includes("oauth=success") || curUrl.includes("googleConnected=1") || curUrl.includes("provider=")) {
          log(`🎉 [OAUTH RETURN DETECTED] Processing callback: ${curUrl}`);
          await curPage.waitForTimeout(3000);
          await takeScreenshot(curPage, "oauth-return-landed");

          const updated = await curPage.evaluate(async () => {
            const res = await fetch("/api/platform/integrations/status");
            return await res.json().catch(() => ({}));
          });
          log("Updated Digital Presence Connections:");
          console.log(JSON.stringify(updated, null, 2));
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }
}

main().catch((err) => {
  console.error("Session monitor error:", err);
  process.exit(1);
});
