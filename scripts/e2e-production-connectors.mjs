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
  console.log(`  📸 Screenshot saved: ${filename}`);
  return filePath;
}

async function connectToVisibleChrome() {
  log("Connecting over CDP to http://127.0.0.1:9222 ...");
  let browser;
  for (let i = 1; i <= 15; i++) {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      break;
    } catch (e) {
      if (i === 15) throw new Error("Could not connect to Chrome on port 9222. Please ensure the launcher script is running.");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const pages = context.pages();
  const page = pages[pages.length - 1] || (await context.newPage());

  log(`✓ Connected to visible Chrome!`);
  log(`  Current URL: ${page.url()}`);
  log(`  Current Title: "${await page.title().catch(() => "")}"`);

  return { browser, context, page };
}

async function monitorSessionAndConnectors() {
  const { context, page } = await connectToVisibleChrome();

  context.on("page", async (newPage) => {
    log(`[Browser Event: New Tab/Popup] -> ${newPage.url()}`);
  });

  log("Monitoring browser session...");
  await takeScreenshot(page, "01-initial-state");

  let lastUrl = "";
  while (true) {
    try {
      const activePages = context.pages();
      const currentPage = activePages[activePages.length - 1] || page;
      const currentUrl = currentPage.url();

      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        log(`\n>>> [Active Page Navigation] URL: ${currentUrl}`);
        await takeScreenshot(currentPage, "nav-" + encodeURIComponent(currentUrl.replace(/[^a-zA-Z0-9]/g, "-")).slice(0, 35));

        // Check if OAuth return params are present
        if (currentUrl.includes("oauth=success") || currentUrl.includes("googleConnected=1") || currentUrl.includes("provider=")) {
          log(`🎉 [OAUTH RETURN DETECTED] -> ${currentUrl}`);
          await currentPage.waitForTimeout(3000);
          await takeScreenshot(currentPage, "oauth-return-detected");
        }
      }
    } catch (err) {
      // Non-fatal loop error
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// Support direct invocation
if (process.argv[1]?.endsWith("e2e-production-connectors.mjs")) {
  monitorSessionAndConnectors().catch((err) => {
    console.error("Runner failed:", err.message);
    process.exit(1);
  });
}
