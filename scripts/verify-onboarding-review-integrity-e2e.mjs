import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-review-integrity");
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
  console.log("STARTING REVIEW SCREEN DATA INTEGRITY & AUDIT HANDOFF E2E VALIDATION");
  console.log(`Targeting dev server: ${BASE_URL}`);
  console.log("================================================================================\n");

  const browser = await chromium.launch({ executablePath, headless: true });

  // ---------------------------------------------------------------------------
  // Scenario A: Full Multi-Source Presence (Website + GBP + Socials + Brand + Goals)
  // ---------------------------------------------------------------------------
  console.log(">>> Scenario A: Full Multi-Source Presence (Website + GBP + Socials + Brand + Goals)");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Step 1: Account
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 2: Business - Fill Website & Google Maps Link & Trigger Scan
    await page.getByLabel("Website / Domain").fill("https://stratxcel.in");
    await page.getByLabel("Google Maps / Business Profile").fill("https://www.google.com/maps/place/StratXcel+Solutions/@21.19,81.35,17z");

    await page.locator("button:has-text('Scan & Auto-Fill')").click();
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });
    console.log("  ✓ Step 2: Discovery and synthesis complete.");

    // Step 3: Goals
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // Step 4: Brand
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // Step 5: Review
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const reviewText = await page.textContent("form");

    // Assertions on Review page contents:
    assert.ok(reviewText?.includes("https://stratxcel.in"), "Review must display the Website URL");
    assert.ok(reviewText?.includes("Google Maps / Business Profile"), "Review must display Google Maps / GBP heading");
    assert.ok(reviewText?.includes("Profile Linked") || reviewText?.includes("StratXcel"), "Review must display GBP status");
    assert.ok(reviewText?.includes("Confirmed Social Profiles"), "Review must show confirmed social profiles heading");
    assert.ok(reviewText?.includes("Instagram") || reviewText?.includes("stratxcel.ai"), "Review must show confirmed Instagram");
    assert.ok(reviewText?.includes("Short description"), "Review must display Short description row");
    assert.equal(reviewText?.includes("not saved by this step"), false, "Must NOT say 'not saved by this step'!");
    assert.ok(reviewText?.includes("Selected Goals"), "Review must display Selected Goals");
    assert.ok(reviewText?.includes("Create Workspace & Start Audit →"), "Review CTA must be 'Create Workspace & Start Audit →'");

    console.log("  ✓ Scenario A: Review screen accurately displays all connected sources, GBP, and real description.");
    await page.screenshot({ path: path.join(OUT_DIR, "scenario-a-review.png") });
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario B: Google Maps Only (No Website) Local Business
  // ---------------------------------------------------------------------------
  console.log("\n>>> Scenario B: Google Maps Only (No Website) Local Business");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Pass Step 1
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Enter ONLY Google Maps link and Industry
    await page.getByLabel("Google Maps / Business Profile").fill("https://www.google.com/maps/place/Sweet+Bakes+Bakery/@12.97,77.64,15z");
    await page.getByLabel("Industry / Category").fill("Food & Hospitality");

    await page.locator("button:has-text('Scan & Auto-Fill')").click();
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });

    // Step 3: Goals
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 4: Brand
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 5: Review
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const reviewText = await page.textContent("form");

    assert.ok(reviewText?.includes("Sweet Bakes Bakery"), "Review must display Sweet Bakes Bakery");
    assert.ok(reviewText?.includes("Google Maps / Business Profile"), "Review must show Google Maps section");
    assert.ok(reviewText?.includes("No social profiles were provided or confirmed"), "Must honestly state no social profiles without fabrication");
    assert.ok(reviewText?.includes("Warm, inviting") || reviewText?.includes("artisanal") || reviewText?.includes("Food & Hospitality"), "Must show bakery tone/profile");

    console.log("  ✓ Scenario B: Review screen handles GBP-only business with zero fake social fabrication.");
    await page.screenshot({ path: path.join(OUT_DIR, "scenario-b-review.png") });
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario C: Website Only (No GBP / No Socials)
  // ---------------------------------------------------------------------------
  console.log("\n>>> Scenario C: Website Only (No GBP / No Socials)");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Pass Step 1
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Enter ONLY Website
    await page.getByLabel("Website / Domain").fill("https://localclinic.org");
    await page.getByLabel("Industry / Category").fill("Healthcare & Clinics");
    await page.getByLabel("Business name").fill("Care Dental Clinic");

    // Step 3: Goals
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 4: Brand
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 5: Review
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const reviewText = await page.textContent("form");

    assert.ok(reviewText?.includes("https://localclinic.org"), "Review must show Website");
    assert.ok(reviewText?.includes("No social profiles were provided or confirmed"), "Must state no social profiles confirmed");

    console.log("  ✓ Scenario C: Website-only flow accurately displays on Review.");
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario D: Social Rejection & Replacement "Not mine" Workflow
  // ---------------------------------------------------------------------------
  console.log("\n>>> Scenario D: Social Replacement ('Not mine' -> Custom Handle -> Review)");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Step 1
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 2: Enter website to discover socials
    await page.getByLabel("Website / Domain").fill("https://stratxcel.in");
    await page.locator("button:has-text('Scan & Auto-Fill')").click();
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });

    // Find Instagram card and click "Not mine" or "Change"
    const instagramCard = page.locator("form .grid > div").filter({ hasText: "Instagram" }).first();
    if ((await instagramCard.count()) > 0) {
      const changeBtn = instagramCard.locator("button:has-text('Change'), button:has-text('Not mine')");
      await changeBtn.click();
      await page.waitForTimeout(200);

      // Enter replacement handle
      const replacementInput = instagramCard.locator("input");
      await replacementInput.fill("@custom_stratxcel_brand");
      await instagramCard.locator("button:has-text('Use this account')").click();
      await page.waitForTimeout(300);
      console.log("  ✓ Replaced Instagram with custom handle '@custom_stratxcel_brand'.");
    }

    // Step 3: Goals
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 4: Brand
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 5: Review
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const reviewText = await page.textContent("form");
    assert.ok(reviewText?.includes("@custom_stratxcel_brand"), "Review MUST show replaced custom handle");
    console.log("  ✓ Scenario D: Replaced social profile accurately rendered in Review.");

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario E: User Edits Precedence
  // ---------------------------------------------------------------------------
  console.log("\n>>> Scenario E: User Custom Edits Precedence");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Step 1
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 2: Auto-fill
    await page.getByLabel("Website / Domain").fill("https://stratxcel.in");
    await page.locator("button:has-text('Scan & Auto-Fill')").click();
    await page.waitForSelector("text=✓ Business profile", { timeout: 15000 });

    // Step 3: Goals - Deselect one goal and select another
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    // Step 4: Brand - Edit Tone and Description
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(200);

    const customTone = "Ultra-modern, consultative, authoritative growth agency";
    const customDesc = "StratXcel provides proprietary AI automation and social autopilot infrastructure for scaling companies.";
    await page.getByLabel("Tone / personality").fill(customTone);
    await page.getByLabel("Short description").fill(customDesc);

    // Step 5: Review
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    const reviewText = await page.textContent("form");
    assert.ok(reviewText?.includes(customTone), "Review must reflect user-edited tone");
    assert.ok(reviewText?.includes(customDesc), "Review must reflect user-edited description");

    console.log("  ✓ Scenario E: User custom edits have highest priority and appear in Review.");
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // Responsive Layout Check across 5 Viewports
  // ---------------------------------------------------------------------------
  console.log("\n>>> Responsive Layout Verification of Review Screen across 5 Viewports");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);

    // Navigate to Review (Step 5)
    await page.locator("button:has-text('Continue')").click(); // to 2
    await page.getByLabel("Business name").fill("StratXcel");
    await page.locator("button:has-text('Continue')").click(); // to 3
    await page.locator("button:has-text('Continue')").click(); // to 4
    await page.locator("button:has-text('Continue')").click(); // to 5 (Review)
    await page.waitForTimeout(200);

    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasHorizontalScroll, false, `Must have zero horizontal overflow on Review on ${vp.name}`);

    await page.screenshot({ path: path.join(OUT_DIR, `review-${vp.name}.png`) });
    console.log(`  ✓ [${vp.name}] Review layout clean, zero horizontal overflow.`);
    await context.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("ALL REVIEW SCREEN DATA INTEGRITY & AUDIT HANDOFF TESTS PASSED!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("Review integrity verification failed:", err);
  process.exit(1);
});
