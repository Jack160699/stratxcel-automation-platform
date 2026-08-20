import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const PROD_URL = "https://www.stratxcel.in";
const PROFILE_DIR = path.join(process.cwd(), ".browser-profile");
const SCREENSHOT_DIR = path.join(process.cwd(), ".screenshots-production-live");
fs.mkdirSync(PROFILE_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((c) => fs.existsSync(c));

async function main() {
  console.log("================================================================================");
  console.log("STRATXCEL LIVE CONNECTOR STABILITY WATCHER (REOPEN RESILIENT)");
  console.log(`URL: ${PROD_URL}`);
  console.log("================================================================================\n");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath,
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });

  context.on("page", (newPage) => {
    console.log(`[Event: New Tab/Popup opened] URL: ${newPage.url()}`);
  });

  let page = context.pages()[0] || (await context.newPage());
  console.log("Navigating to https://www.stratxcel.in/login ...");
  await page.goto(`${PROD_URL}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});

  while (true) {
    try {
      const pages = context.pages();
      if (pages.length === 0) {
        console.log("[Notice] Tab was closed by user. Reopening new tab at https://www.stratxcel.in/login ...");
        page = await context.newPage();
        await page.goto(`${PROD_URL}/login`, { waitUntil: "domcontentloaded" });
      } else {
        page = pages[pages.length - 1];
      }

      const url = page.url();

      if (url.includes("/login") || url.includes("/signup")) {
        // Still on login
      } else if (url.includes("/app")) {
        const bodyText = (await page.textContent("body").catch(() => "")) || "";

        if (url.includes("/app/brand") || url.includes("/app/integrations")) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `brand-live-${timestamp}.png`;
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true }).catch(() => {});

          console.log(`\n--------------------------------------------------------------------------------`);
          console.log(`[DOM SNAPSHOT: ${new Date().toLocaleTimeString()} at ${url}]`);
          console.log(`- Screenshot saved: ${filename}`);

          const platforms = [
            "Website",
            "Google Business",
            "Instagram",
            "Facebook",
            "YouTube",
            "Google Analytics",
            "Google Search Console",
            "WhatsApp",
          ];

          for (const p of platforms) {
            const hasPlatform = bodyText.includes(p);
            console.log(`  * ${p}: ${hasPlatform ? "VISIBLE (✓)" : "NOT VISIBLE"}`);
          }

          const hasLinkedIn = bodyText.includes("LinkedIn");
          const hasX = bodyText.includes(" X ") || bodyText.includes("Twitter");
          const hasThreads = bodyText.includes("Threads");
          console.log(`  * Unwanted Platforms: LinkedIn=${hasLinkedIn ? "PRESENT (FAIL)" : "ABSENT (CLEAN ✓)"} | X=${hasX ? "PRESENT (FAIL)" : "ABSENT (CLEAN ✓)"} | Threads=${hasThreads ? "PRESENT (FAIL)" : "ABSENT (CLEAN ✓)"}`);
          console.log(`--------------------------------------------------------------------------------\n`);
        }
      }
    } catch (err) {
      console.log("[Loop non-fatal]", err.message);
    }

    await new Promise((r) => setTimeout(r, 4000));
  }
}

main().catch((err) => {
  console.error("Monitor fatal error:", err);
});
