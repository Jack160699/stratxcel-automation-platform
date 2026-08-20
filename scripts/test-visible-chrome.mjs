import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright-core";

const PROFILE_DIR = path.join(process.env.USERPROFILE || process.env.HOME, ".stratxcel-chrome-profile");
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

console.log("=== TESTING VISIBLE CHROME LAUNCH & CDP ATTACH ===");
console.log(`Executable: ${CHROME_PATH}`);
console.log(`Profile:    ${PROFILE_DIR}`);

// 1. Launch Chrome directly on Windows desktop with remote debugging
const chromeProcess = spawn(
  CHROME_PATH,
  [
    "--remote-debugging-port=9222",
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "https://www.stratxcel.in/login",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
);

console.log(`Chrome Process Spawned. PID: ${chromeProcess.pid}`);
chromeProcess.unref();

// 2. Poll for CDP endpoint
async function waitForCDP(maxAttempts = 15) {
  for (let i = 1; i <= maxAttempts; i++) {
    const ok = await new Promise((resolve) => {
      http
        .get("http://127.0.0.1:9222/json/version", (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              console.log(`✓ CDP Ready on attempt ${i}: ${json.Browser}`);
              resolve(true);
            } catch {
              resolve(false);
            }
          });
        })
        .on("error", () => resolve(false));
    });

    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function run() {
  const ready = await waitForCDP();
  if (!ready) {
    console.error("❌ CDP failed to become ready on http://127.0.0.1:9222");
    process.exit(1);
  }

  console.log("\n>>> Connecting Playwright to visible Chrome via CDP...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const contexts = browser.contexts();
  console.log(`✓ Attached to Browser! Contexts: ${contexts.length}`);

  const context = contexts[0] || (await browser.newContext());
  const pages = context.pages();
  console.log(`✓ Pages in context: ${pages.length}`);

  const page = pages[0] || (await context.newPage());
  console.log(`✓ Active page URL: ${page.url()}`);

  const title = await page.title();
  console.log(`✓ Active page Title: "${title}"`);

  console.log("\n================================================================================");
  console.log("SUCCESS: VISIBLE CHROME IS LIVE AND CONTROLLED VIA PLAYWRIGHT OVER CDP!");
  console.log("================================================================================\n");

  await browser.close();
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
