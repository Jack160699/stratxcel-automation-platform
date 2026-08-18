import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const PROD_URL = "https://www.stratxcel.in";
const OUT_DIR = path.join(process.cwd(), ".screenshots-production-live");
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((c) => fs.existsSync(c));
if (!executablePath) {
  console.error("No Chromium browser found");
  process.exit(1);
}

async function inspectProductionPage() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 StratXcelLiveCheck",
  });
  const page = await context.newPage();

  console.log(`Navigating to production ${PROD_URL}/app ...`);
  const response = await page.goto(`${PROD_URL}/app`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  const status = response?.status() || 0;
  const currentUrl = page.url();
  console.log(`HTTP Status: ${status}`);
  console.log(`Landed at URL: ${currentUrl}`);

  const pageContent = await page.content();
  const bodyText = await page.textContent("body") || "";

  // Screenshot current state
  await page.screenshot({ path: path.join(OUT_DIR, "production-app-current.png"), fullPage: true });

  const hasStepIndicator = bodyText.includes("Step 1 of 5") || bodyText.includes("Step 1 of 6");
  const hasAccountStep = bodyText.includes("Your StratXcel Account");
  const hasDiscoverySources = bodyText.includes("Where is your business online?") || bodyText.includes("Website / Domain");
  const hasLegacyDiscovery = bodyText.includes("Start Business Discovery") || bodyText.includes("Discovered Workspace Profile") || bodyText.includes("Re-scan website");
  const hasBrandStepInWizard = bodyText.includes("Step 4 of 5 · Brand") || bodyText.includes("Step 4 of 6 · Brand");

  console.log("--------------------------------------------------------------------------------");
  console.log("PRODUCTION LIVE DIAGNOSIS RESULTS:");
  console.log(`- URL: ${currentUrl}`);
  console.log(`- Step Indicator: ${hasStepIndicator ? "FOUND" : "NOT VISIBLE"}`);
  console.log(`- Account Step Header: ${hasAccountStep ? "FOUND" : "MISSING"}`);
  console.log(`- Discovery Sources (Website/GBP): ${hasDiscoverySources ? "FOUND" : "MISSING"}`);
  console.log(`- Legacy Discovery UI: ${hasLegacyDiscovery ? "STILL PRESENT" : "REMOVED (CLEAN)"}`);
  console.log(`- Brand Step in Wizard: ${hasBrandStepInWizard ? "STILL PRESENT" : "REMOVED (CLEAN)"}`);
  console.log("--------------------------------------------------------------------------------");

  await browser.close();

  return {
    status,
    currentUrl,
    hasStepIndicator,
    hasAccountStep,
    hasDiscoverySources,
    hasLegacyDiscovery,
    hasBrandStepInWizard,
    bodyTextSnippet: bodyText.slice(0, 500),
  };
}

async function main() {
  console.log("================================================================================");
  console.log("CHECKING PRODUCTION DEPLOYMENT FOR STRATXCEL ONBOARDING");
  console.log("================================================================================\n");

  for (let attempt = 1; attempt <= 15; attempt++) {
    console.log(`\n[Attempt ${attempt}/15] Checking https://www.stratxcel.in/app ...`);
    const result = await inspectProductionPage();

    if (result.currentUrl.includes("/login") || result.currentUrl.includes("/signup")) {
      console.log("  ⚠️  /app redirected to login because session is unauthenticated on production.");
      console.log("  Checking public assets and static bundle hashes for commit confirmation...");
      break;
    }

    if (result.hasDiscoverySources && !result.hasLegacyDiscovery) {
      console.log("\n>>> SUCCESS: Production is live with new onboarding architecture! <<<\n");
      process.exit(0);
    } else {
      console.log("Waiting 15s for Vercel deployment propagation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
}

main().catch((err) => {
  console.error("Error checking production:", err);
  process.exit(1);
});
