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

async function checkDeployment() {
  console.log(`Polling ${PROD_URL}/test-onboarding-canonical ...`);
  const res = await fetch(`${PROD_URL}/test-onboarding-canonical`, {
    headers: { "Cache-Control": "no-cache" },
  });

  console.log(`Status: ${res.status} | x-vercel-id: ${res.headers.get("x-vercel-id")} | age: ${res.headers.get("age")}`);

  if (res.status === 200) {
    const text = await res.text();
    return {
      isLive: true,
      hasAccount: text.includes("Your StratXcel Account") || text.includes("stratxcel"),
      htmlSnippet: text.slice(0, 300),
    };
  }
  return { isLive: false };
}

async function verifyInBrowser() {
  console.log("\n>>> Launching Chromium against production to verify interactive onboarding...");
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${PROD_URL}/test-onboarding-canonical`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent("body") || "";
  console.log(`Page content snippet: ${bodyText.slice(0, 300).replace(/\s+/g, " ")}`);

  await page.screenshot({ path: path.join(OUT_DIR, "production-test-canonical-live.png"), fullPage: true });

  const hasStep1Account = bodyText.includes("Your StratXcel Account");
  const hasDiscoverySources = bodyText.includes("Website / Domain") || bodyText.includes("Where is your business online?");
  const hasStepCount5 = bodyText.includes("Step 1 of 5");
  const hasNoLegacyDiscovery = !bodyText.includes("Start Business Discovery") && !bodyText.includes("Discovered Workspace Profile");

  console.log("--------------------------------------------------------------------------------");
  console.log("PRODUCTION LIVE VERIFICATION SUMMARY:");
  console.log(`- Step 1 Account Header: ${hasStep1Account ? "VERIFIED (✓)" : "FAILED (✗)"}`);
  console.log(`- Website / Google Maps Sources: ${hasDiscoverySources ? "VERIFIED (✓)" : "FAILED (✗)"}`);
  console.log(`- 5-Step Indicator: ${hasStepCount5 ? "VERIFIED (✓)" : "FAILED (✗)"}`);
  console.log(`- No Legacy Discovery UI: ${hasNoLegacyDiscovery ? "VERIFIED (✓)" : "FAILED (✗)"}`);
  console.log("--------------------------------------------------------------------------------");

  assert.ok(hasStep1Account, "Step 1 Account header must be present on production");
  assert.ok(hasDiscoverySources, "Step 1 Website/GBP inputs must be present on production");
  assert.ok(hasStepCount5, "5-step indicator must be present on production");
  assert.ok(hasNoLegacyDiscovery, "No legacy discovery UI on production");

  await browser.close();
}

async function main() {
  console.log("================================================================================");
  console.log("POLLING VERCEL PRODUCTION DEPLOYMENT FOR COMMIT 4221331");
  console.log("================================================================================\n");

  for (let attempt = 1; attempt <= 24; attempt++) {
    console.log(`[Attempt ${attempt}/24]`);
    try {
      const check = await checkDeployment();
      if (check.isLive) {
        console.log("\n🎉 Vercel deployment is LIVE on production!");
        await verifyInBrowser();
        console.log("\n>>> ALL PRODUCTION VERIFICATIONS PASSED SUCCESSFULLY! <<<\n");
        process.exit(0);
      }
    } catch (err) {
      console.log(`Fetch error: ${err.message}`);
    }
    console.log("Waiting 10s for Vercel build & propagation...\n");
    await new Promise((r) => setTimeout(r, 10000));
  }

  console.error("Timed out waiting for Vercel deployment.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
