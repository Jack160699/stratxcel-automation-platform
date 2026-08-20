import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const USER_PROFILE = process.env.USERPROFILE || "C:\\Users\\shriyansh chandrakar";
const PROFILE_DIR = path.join(USER_PROFILE, ".stratxcel-e2e-headed-profile");

try {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
} catch (e) {}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

console.log("Launching headed Google Chrome via Playwright...");

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  viewport: null,
  args: [
    "--start-maximized",
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

const page = context.pages()[0] || (await context.newPage());
console.log("Navigating to https://www.stratxcel.in/login ...");
await page.goto("https://www.stratxcel.in/login", { waitUntil: "domcontentloaded" });
console.log("✓ Headed Chrome is open on user desktop! Page URL:", page.url(), "Title:", await page.title());

// Keep process running so window stays open
console.log("Keeping browser open. Waiting 10 seconds...");
await new Promise((r) => setTimeout(r, 10000));
await context.close();
console.log("Closed test browser.");
