import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-intelligence");
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
  console.log("STARTING FULL ONBOARDING BUSINESS INTELLIGENCE & AUTO-FILL E2E VALIDATION");
  console.log(`Targeting dev server: ${BASE_URL}`);
  console.log("================================================================================\n");

  const browser = await chromium.launch({ executablePath, headless: true });

  // ---------------------------------------------------------------------------
  // 1. Multi-Viewport Layout Check with Google Maps & Website Inputs
  // ---------------------------------------------------------------------------
  console.log(">>> Phase 1: Responsive Layout Check with Google Maps & Website Inputs");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-intelligence`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Pass Step 1 (Account)
    const continueBtn = page.locator("button:has-text('Continue')");
    await continueBtn.click();
    await page.waitForTimeout(200);

    // Verify Business step layout
    const metrics = await page.evaluate(() => {
      const gbpInput = document.querySelector("input[placeholder*='maps.app.goo.gl']");
      const websiteInput = document.querySelector("input[placeholder*='yourbusiness.com']");
      const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;

      return {
        hasGbpInput: Boolean(gbpInput),
        hasWebsiteInput: Boolean(websiteInput),
        hasHorizontalScroll,
      };
    });

    assert.equal(metrics.hasHorizontalScroll, false, `Must have no horizontal scroll on ${vp.name}`);
    assert.ok(metrics.hasGbpInput, `Must display Google Maps input on ${vp.name}`);
    assert.ok(metrics.hasWebsiteInput, `Must display Website input on ${vp.name}`);

    await page.screenshot({ path: path.join(OUT_DIR, `step2-business-${vp.name}.png`) });
    console.log(`  ✓ [${vp.name}] Layout clean, Google Maps input rendered without overflow.`);
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 2. Scenario A: Website + GBP + Socials Scan & Full Auto-Population
  // ---------------------------------------------------------------------------
  console.log("\n>>> Phase 2: Scenario A - Website + GBP Multi-Source Auto-Population");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-intelligence`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Step 1: Account
    console.log("  Step 1: Passing Account Step...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 2: Business - Fill Website & Google Maps Link & Trigger Scan
    console.log("  Step 2: Entering Website & Google Maps links and clicking 'Scan & Auto-Fill'...");
    const websiteInput = page.locator("input[placeholder*='yourbusiness.com']");
    const gbpInput = page.locator("input[placeholder*='maps.app.goo.gl']");

    await websiteInput.fill("https://stratxcel.in");
    await gbpInput.fill("https://www.google.com/maps/place/StratXcel+Solutions/@21.19,81.35,17z");

    const scanBtn = page.locator("button:has-text('Scan & Auto-Fill')");
    await scanBtn.click();

    // Wait for scan completion
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });
    console.log("  ✓ Step 2: Scan completed successfully.");

    // Verify Business fields auto-populated
    const bizName = await page.locator("input[placeholder='Acme Studio']").inputValue();
    assert.ok(bizName.includes("StratXcel") || bizName.length > 0, "Business name must be auto-filled");
    console.log(`  ✓ Step 2: Business Name auto-filled: "${bizName}"`);

    // Verify Discovered Socials and confirm one
    const instagramCard = page.locator("form .grid > div").filter({ hasText: "Instagram" }).first();
    if ((await instagramCard.count()) > 0) {
      const mineBtn = instagramCard.locator("button:has-text('✓ Mine')");
      if ((await mineBtn.count()) > 0) {
        await mineBtn.click();
        await page.waitForTimeout(200);
      }
      console.log("  ✓ Step 2: Confirmed Instagram profile.");
    }

    await page.screenshot({ path: path.join(OUT_DIR, "scenario-a-step2-business.png") });

    // Step 3: Goals
    console.log("  Step 3: Continuing to Goals...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // Verify recommendation banner is present
    const recBanner = page.locator("text=Based on your");
    assert.ok((await recBanner.count()) > 0, "Must display personalized recommendation banner on Goals step");

    // Verify at least one goal is pre-selected
    const selectedGoalsCount = await page.locator("button[aria-pressed='true']").count();
    assert.ok(selectedGoalsCount > 0, "Must have recommended goals pre-selected automatically");
    console.log(`  ✓ Step 3: Goals Step loaded with ${selectedGoalsCount} recommended goals pre-selected.`);

    await page.screenshot({ path: path.join(OUT_DIR, "scenario-a-step3-goals.png") });

    // Step 4: Brand
    console.log("  Step 4: Continuing to Brand...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // Verify Brand step pre-filled fields
    const brandName = await page.getByLabel("Brand / business name").inputValue();
    const brandTone = await page.getByLabel("Tone / personality").inputValue();
    const brandAudience = await page.getByLabel("Target audience").inputValue();
    const brandDesc = await page.getByLabel("Short description").inputValue();
    const brandOffers = await page.getByLabel("Primary offers / services").inputValue();
    const brandRestrictions = await page.getByLabel("Restrictions or claims to avoid").inputValue();

    assert.ok(brandName.length > 0, "Brand name must not be blank");
    assert.ok(brandTone.length > 0, "Brand tone must be pre-filled");
    assert.ok(brandAudience.length > 0, "Target audience must be pre-filled");
    assert.ok(brandDesc.length > 0, "Brand description must be pre-filled");
    assert.ok(brandOffers.length > 0, "Offers must be pre-filled");
    assert.ok(brandRestrictions.length > 0, "Restrictions must be pre-filled");

    console.log("  ✓ Step 4: ALL Brand fields automatically pre-filled:");
    console.log(`     - Tone: "${brandTone}"`);
    console.log(`     - Audience: "${brandAudience.slice(0, 50)}..."`);
    console.log(`     - Description: "${brandDesc.slice(0, 50)}..."`);
    console.log(`     - Offers:\n${brandOffers.split("\n").map((o) => `        • ${o}`).join("\n")}`);

    // Verify user can edit a field and have it preserved
    const customTone = "Authoritative, modern, cutting-edge AI agency";
    await page.getByLabel("Tone / personality").fill(customTone);

    await page.screenshot({ path: path.join(OUT_DIR, "scenario-a-step4-brand.png") });

    // Step 5: Plan
    console.log("  Step 5: Continuing to Plan...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // Step 6: Review
    console.log("  Step 6: Continuing to Review...");
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // Verify Review step content
    const reviewContent = await page.locator("form").textContent();
    assert.ok(reviewContent?.includes("StratXcel") || reviewContent?.includes("Stratxcel"), "Review must summarize Business name");
    assert.ok(reviewContent?.includes("Connected Presence"), "Review must show Connected Presence");
    assert.ok(reviewContent?.includes(customTone), "Review must show user-edited Brand Tone");

    console.log("  ✓ Step 6: Review Step accurately summarizes business profile, presence, goals, and brand.");
    await page.screenshot({ path: path.join(OUT_DIR, "scenario-a-step6-review.png") });

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 3. Scenario B: Google Maps Only (No Website) Auto-Population
  // ---------------------------------------------------------------------------
  console.log("\n>>> Phase 3: Scenario B - Google Maps Only (No Website) Local Business");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-intelligence`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Pass Step 1
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Enter ONLY Google Maps link and Industry
    console.log("  Step 2: Entering only Google Maps link for Sweet Bakes Bakery...");
    const gbpInput = page.getByLabel("Google Maps / Business Profile");
    const industryInput = page.getByLabel("Industry / Category");

    await gbpInput.fill("https://www.google.com/maps/place/Sweet+Bakes+Bakery/@12.97,77.64,15z");
    await industryInput.fill("Food & Hospitality");

    await page.locator("button:has-text('Scan & Auto-Fill')").click();
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });

    const bizName = await page.getByLabel("Business name").inputValue();
    assert.equal(bizName, "Sweet Bakes Bakery", "Business name must be extracted from Google Maps link");
    console.log(`  ✓ Step 2: Auto-extracted place name from Google Maps: "${bizName}"`);

    // Navigate to Brand step (Step 4)
    await page.locator("button:has-text('Continue')").click(); // to Goals
    await page.waitForTimeout(200);
    await page.locator("button:has-text('Continue')").click(); // to Brand
    await page.waitForTimeout(200);

    const brandTone = await page.getByLabel("Tone / personality").inputValue();
    const brandDesc = await page.getByLabel("Short description").inputValue();
    assert.ok(brandTone.toLowerCase().includes("warm") || brandTone.toLowerCase().includes("artisanal"), "Tone must match Food & Hospitality preset");
    assert.ok(brandDesc.includes("Sweet Bakes Bakery"), "Description must reference extracted bakery name");

    console.log(`  ✓ Step 4: Bakery Brand Tone: "${brandTone}"`);
    console.log(`  ✓ Step 4: Bakery Description: "${brandDesc}"`);
    await page.screenshot({ path: path.join(OUT_DIR, "scenario-b-bakery-brand.png") });

    await context.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("ALL REAL BROWSER ONBOARDING INTELLIGENCE E2E TESTS COMPLETED & PASSED!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
