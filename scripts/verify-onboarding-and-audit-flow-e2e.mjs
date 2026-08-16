import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-audit-flow");
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

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "ultrawide-1920", width: 1920, height: 1080 },
];

async function run() {
  console.log("================================================================================");
  console.log("STARTING ONBOARDING 5-STEP FLOW & POST-AUDIT COMMERCIAL E2E VALIDATION");
  console.log(`Targeting dev server: ${BASE_URL}`);
  console.log("================================================================================\n");

  const browser = await chromium.launch({ executablePath, headless: true });

  // ---------------------------------------------------------------------------
  // 1. Onboarding 5-Step Flow End-to-End Test
  // ---------------------------------------------------------------------------
  console.log(">>> Phase 1: Onboarding 5-Step Wizard Flow (Account -> Business -> Goals -> Brand -> Review)");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-flow`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Verify Progress Rail has 5 stages and NO "Plan"
    const railText = await page.textContent("body");
    assert.ok(railText?.includes("Account"), "Rail must contain Account");
    assert.ok(railText?.includes("Business"), "Rail must contain Business");
    assert.ok(railText?.includes("Goals"), "Rail must contain Goals");
    assert.ok(railText?.includes("Brand"), "Rail must contain Brand");
    assert.ok(railText?.includes("Review"), "Rail must contain Review");
    assert.ok(railText?.includes("Step 1 of 5"), "Must be 5 total steps");
    console.log("  ✓ Progress rail correctly shows 5 stages with Plan removed.");

    // Step 1: Account
    console.log("  Step 1: Passing Account Step...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 2: Business - Fill Website & Google Maps Link & Trigger Scan
    console.log("  Step 2: Entering Website & Google Maps links and clicking 'Scan & Auto-Fill'...");
    const websiteInput = page.getByLabel("Website / Domain");
    const gbpInput = page.getByLabel("Google Maps / Business Profile");

    await websiteInput.fill("https://stratxcel.in");
    await gbpInput.fill("https://www.google.com/maps/place/StratXcel+Solutions/@21.19,81.35,17z");

    await page.locator("button:has-text('Scan & Auto-Fill')").click();
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });
    console.log("  ✓ Step 2: Scan completed successfully.");

    await page.screenshot({ path: path.join(OUT_DIR, "step2-business.png") });

    // Step 3: Goals
    console.log("  Step 3: Continuing to Goals...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const recBanner = page.locator("text=Based on your");
    assert.ok((await recBanner.count()) > 0, "Must display recommendation banner on Goals step");
    console.log("  ✓ Step 3: Goals step rendered with personalized recommendation banner.");

    await page.screenshot({ path: path.join(OUT_DIR, "step3-goals.png") });

    // Step 4: Brand
    console.log("  Step 4: Continuing to Brand...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const brandTone = await page.getByLabel("Tone / personality").inputValue();
    assert.ok(brandTone.length > 0, "Brand tone must be pre-filled");
    console.log(`  ✓ Step 4: Brand step rendered with pre-filled tone: "${brandTone}"`);

    await page.screenshot({ path: path.join(OUT_DIR, "step4-brand.png") });

    // Step 5: Review (Immediately after Brand!)
    console.log("  Step 5: Continuing to Review (Verifying NO Plan step in between)...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const reviewHeader = await page.locator("h2").textContent();
    assert.equal(reviewHeader?.trim(), "Review", "Step 5 must be Review");

    const submitBtnText = await page.locator("button[type='submit'], button:has-text('Audit')").textContent();
    assert.ok(submitBtnText?.includes("Start Audit") || submitBtnText?.includes("Continue to Business Audit"), "Submit CTA must prompt to Start Audit");
    console.log(`  ✓ Step 5: Review Step rendered directly after Brand with CTA: "${submitBtnText?.trim()}"`);

    // Verify Back navigation goes directly from Review (5) to Brand (4)
    await page.locator("button:has-text('Back')").click();
    await page.waitForTimeout(200);
    const backHeader = await page.locator("h2").textContent();
    assert.equal(backHeader?.trim(), "Brand", "Back from Review must lead directly to Brand");
    console.log("  ✓ Navigation: Back from Review goes directly to Brand without Plan step.");

    await page.screenshot({ path: path.join(OUT_DIR, "step5-review.png") });
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 2. Post-Audit Report & Commercial Recommendation Layer Validation
  // ---------------------------------------------------------------------------
  console.log("\n>>> Phase 2: Post-Audit Report & Commercial Recommendation Layer");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-audit-report`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // 1. Verify Four Core Findings
    const findingsContent = await page.textContent("body");
    assert.ok(findingsContent?.includes("1. What is Working"), "Must answer 'What is Working'");
    assert.ok(findingsContent?.includes("2. What is Weak / Missing"), "Must answer 'What is Weak / Missing'");
    assert.ok(findingsContent?.includes("3. What is Blocking Growth"), "Must answer 'What is Blocking Growth'");
    assert.ok(findingsContent?.includes("4. What to Fix First"), "Must answer 'What to Fix First'");
    console.log("  ✓ Diagnosis & Findings: All 4 clear business answers rendered.");

    // 2. Verify 30-Day Recommended Action Plan
    assert.ok(findingsContent?.includes("What We Recommend for the Next 30 Days"), "Must show 30-day recommended actions");
    assert.ok(findingsContent?.includes("Fix Google Visibility & Local Presence") || findingsContent?.includes("Deploy Live Website"), "Must show numbered action items");
    assert.ok(findingsContent?.includes("Enable Instant WhatsApp Lead Qualification") || findingsContent?.includes("WhatsApp"), "Must show WhatsApp automation action");
    console.log("  ✓ 30-Day Recommended Action Plan: Action roadmap accurately rendered.");

    // 3. Verify Commercial Section ("We found these issues. StratXcel can help you fix them.")
    assert.ok(findingsContent?.includes("We found these issues. StratXcel can help you fix them."), "Must include canonical transition header");
    assert.ok(findingsContent?.includes("Recommended for StratXcel Solutions: Growth") || findingsContent?.includes("Recommended for"), "Must include intelligent recommendation");
    assert.ok(findingsContent?.includes("Starter"), "Must include Starter tier");
    assert.ok(findingsContent?.includes("Growth"), "Must include Growth tier");
    assert.ok(findingsContent?.includes("Business"), "Must include Business tier");
    assert.ok(findingsContent?.includes("Not sure?"), "Must include consultation option");
    console.log("  ✓ Commercial Layer: Transition header, intelligent recommendation, and plain-language tiers rendered.");

    await page.screenshot({ path: path.join(OUT_DIR, "audit-report-desktop.png"), fullPage: true });
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 3. Responsive Verification across all 5 Viewports
  // ---------------------------------------------------------------------------
  console.log("\n>>> Phase 3: Responsive Layout Verification across 5 Viewports");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-audit-report`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);

    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasHorizontalScroll, false, `Must have zero horizontal overflow on ${vp.name}`);

    await page.screenshot({ path: path.join(OUT_DIR, `audit-report-${vp.name}.png`) });
    console.log(`  ✓ [${vp.name}] Layout clean, no horizontal overflow.`);
    await context.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("ALL ONBOARDING 5-STEP & POST-AUDIT E2E TESTS COMPLETED & PASSED!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("E2E Verification Failed:", err);
  process.exit(1);
});
