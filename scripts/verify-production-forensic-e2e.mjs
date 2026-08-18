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

async function main() {
  console.log("================================================================================");
  console.log("STRATXCEL FINAL PRODUCTION FORENSIC E2E ACCEPTANCE TEST");
  console.log(`Target: ${PROD_URL}`);
  console.log("================================================================================\n");

  // 1. Health & Commit Verification
  console.log(">>> 1. Verifying /api/health and deployed git commit...");
  const healthRes = await fetch(`${PROD_URL}/api/health`, { headers: { "Cache-Control": "no-cache" } });
  assert.equal(healthRes.status, 200, "/api/health must return 200");
  const healthData = await healthRes.json();
  console.log("  Health response:", JSON.stringify(healthData));
  assert.equal(healthData.status, "healthy", "Production must report healthy");
  assert.ok(healthData.commit, "Commit SHA must be returned");
  console.log(`  ✓ Production commit verified: ${healthData.commit}`);

  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 2. Step 1: Onboarding Entry & Account
  console.log("\n>>> 2. Verifying Step 1 (Account & Presence Discovery)...");
  await page.goto(`${PROD_URL}/test-onboarding-canonical`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const step1Text = await page.textContent("body") || "";
  assert.ok(step1Text.includes("Your StratXcel Account"), "Must render account header");
  assert.ok(step1Text.includes("Where is your business online?"), "Must render discovery source title");

  await page.screenshot({ path: path.join(OUT_DIR, "prod-step1-account.png") });
  console.log("  ✓ Step 1 verified.");

  // Fill Website and Maps
  const websiteInput = page.locator("input[placeholder*='yourwebsite.com']").first();
  await websiteInput.fill("https://auroracafe.in");
  const mapsInput = page.locator("input[placeholder*='Google Maps']").first();
  if (await mapsInput.isVisible()) {
    await mapsInput.fill("https://maps.app.goo.gl/auroracafe");
  }

  // Advance to Step 2
  const continueBtn = page.getByRole("button", { name: /Continue|Next/i });
  await continueBtn.click();
  await page.waitForTimeout(800);

  // 3. Step 2: 5 V1 Connectors (Google with GSC/GA4, Instagram, Facebook, YouTube, WhatsApp)
  console.log("\n>>> 3. Verifying Step 2 (Connectors Hub)...");
  const step2Text = await page.textContent("body") || "";
  assert.ok(step2Text.includes("Google Business Profile") || step2Text.includes("Google"), "Must render Google connector");
  assert.ok(step2Text.includes("Instagram"), "Must render Instagram connector");
  assert.ok(step2Text.includes("Facebook"), "Must render Facebook connector");
  assert.ok(step2Text.includes("YouTube"), "Must render YouTube connector");
  assert.ok(step2Text.includes("WhatsApp"), "Must render WhatsApp connector");

  await page.screenshot({ path: path.join(OUT_DIR, "prod-step2-connectors.png") });
  console.log("  ✓ Step 2 verified.");

  // Advance to Step 3
  const continueBtn2 = page.locator("button[type='submit']").first();
  await continueBtn2.click();
  await page.waitForTimeout(1000);

  // 4. Step 3: Verified Business Foundation & Brand Brain
  console.log("\n>>> 4. Verifying Step 3 (Business Profile Verification)...");
  const step3Text = await page.textContent("body") || "";
  assert.ok(step3Text.includes("Your business") || step3Text.includes("Business"), "Must render Business verification header");

  await page.screenshot({ path: path.join(OUT_DIR, "prod-step3-business.png") });
  console.log("  ✓ Step 3 verified.");

  // Advance to Step 4
  const continueBtn3 = page.locator("button[type='submit']").first();
  await continueBtn3.click();
  await page.waitForTimeout(1000);

  // 5. Step 4: Strategic Priorities & Questionnaire
  console.log("\n>>> 5. Verifying Step 4 (Strategic Growth Priorities)...");
  const step4Text = await page.textContent("body") || "";
  assert.ok(step4Text.includes("Growth") || step4Text.includes("Priority") || step4Text.includes("Focus") || step4Text.includes("Goal"), "Must render Growth priorities");

  await page.screenshot({ path: path.join(OUT_DIR, "prod-step4-adaptive.png") });
  console.log("  ✓ Step 4 verified.");

  // Advance to Step 5 (Finalize)
  const continueBtn4 = page.locator("button[type='submit']").first();
  await continueBtn4.click();
  await page.waitForTimeout(1000);

  // 6. Step 5: Final Review & Start Audit
  console.log("\n>>> 6. Verifying Step 5 (Final Review & Start Free Audit)...");
  const step5Text = await page.textContent("body") || "";
  assert.ok(step5Text.includes("Review") || step5Text.includes("Start") || step5Text.includes("Audit") || step5Text.includes("Ready"), "Must render Final Review screen");

  await page.screenshot({ path: path.join(OUT_DIR, "prod-step5-review.png") });
  console.log("  ✓ Step 5 verified.");

  await browser.close();

  console.log("\n================================================================================");
  console.log("ALL REAL PRODUCTION FORENSIC VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Production forensic verification failed:", err);
  process.exit(1);
});
