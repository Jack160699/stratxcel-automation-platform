import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-onboarding-rebuild");
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
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-412", width: 412, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "ultrawide-1920", width: 1920, height: 1080 },
];

async function run() {
  console.log("================================================================================");
  console.log("STARTING REBUILT ONBOARDING ARCHITECTURE & MOBILE UX E2E VALIDATION");
  console.log(`Targeting dev server: ${BASE_URL}`);
  console.log("================================================================================\n");

  const browser = await chromium.launch({ executablePath, headless: true });

  // ---------------------------------------------------------------------------
  // 1. STEP 1: ACCOUNT (Google Identity + Explicit Social Connectors)
  // ---------------------------------------------------------------------------
  console.log(">>> Scenario 1: Step 1 Account & Social Connectors Hub");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-rebuild`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    const step1Text = await page.textContent("body");
    assert.ok(step1Text?.includes("Your StratXcel Account"), "Must display authenticated account section");
    assert.ok(step1Text?.includes("Connect your business channels"), "Must display social connectors section in Account step");
    assert.ok(step1Text?.includes("Instagram"), "Must display Instagram connector");
    assert.ok(step1Text?.includes("Facebook"), "Must display Facebook connector");
    assert.ok(step1Text?.includes("WhatsApp"), "Must display WhatsApp connector");
    assert.ok(step1Text?.includes("LinkedIn"), "Must display LinkedIn connector");
    assert.ok(step1Text?.includes("YouTube"), "Must display YouTube connector");
    assert.ok(step1Text?.includes("Threads"), "Must display Threads connector");

    // Connect WhatsApp explicitly
    await page.locator('[data-platform="whatsapp"]').locator("button:has-text('Connect')").click();
    await page.waitForSelector("text=Connect WhatsApp", { timeout: 3000 });
    await page.locator("#platform-input").fill("+91 98765 43210");
    await page.locator("button:has-text('Authorize WhatsApp')").click();
    await page.waitForTimeout(500);

    // Verify WhatsApp is now connected
    assert.ok(await page.textContent("body")?.then((t) => t.includes("+91 98765 43210")), "WhatsApp must show connected number");

    // Connect Instagram explicitly
    await page.locator('[data-platform="instagram"]').locator("button:has-text('Connect')").click();
    await page.waitForSelector("text=Connect Instagram", { timeout: 3000 });
    await page.locator("#platform-input").fill("stratxcel.ai");
    await page.locator("button:has-text('Authorize Instagram')").click();
    await page.waitForTimeout(500);

    // Verify Instagram is now connected
    assert.ok(await page.textContent("body")?.then((t) => t.includes("@stratxcel.ai")), "Instagram must show connected handle");

    console.log("  ✓ Step 1: Google account and explicit social connectors verified.");
    await page.screenshot({ path: path.join(OUT_DIR, "step1-account-connected.png") });

    // Continue to Step 2
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 2. STEP 2: BUSINESS (Pure Business Fields, NO Social Discovery, NO Slug)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Scenario 2: Step 2 Pure Business Fields (No Scraping / No Slug)");
    const step2Text = await page.textContent("body");
    assert.ok(step2Text?.includes("Tell us about your business"), "Must show canonical headline");
    assert.ok(step2Text?.includes("Business Name"), "Must have Business Name");
    assert.ok(step2Text?.includes("Website / Domain"), "Must have Website");
    assert.ok(step2Text?.includes("Google Maps / Business Profile"), "Must have Google Maps");
    assert.ok(step2Text?.includes("Location / Operating City"), "Must have Location");
    assert.ok(step2Text?.includes("Industry / Category"), "Must have Industry");
    assert.ok(step2Text?.includes("Business Model"), "Must have Business Model");

    // CRITICAL: Ensure NO social discovery or workspace slug in Step 2!
    assert.equal(step2Text?.includes("Discovered Social Channels"), false, "Must NOT have Discovered Social Channels in Business step");
    assert.equal(step2Text?.includes("Workspace slug"), false, "Must NOT expose Workspace slug in Business step");
    assert.equal(step2Text?.includes("Scan & Auto-Fill"), false, "Must NOT have scraping button in Business step");

    // Fill Business Information
    await page.locator("#" + (await page.locator("label:has-text('Business Name')").getAttribute("for"))).fill("StratXcel Solutions");
    await page.locator("#" + (await page.locator("label:has-text('Website / Domain')").getAttribute("for"))).fill("https://stratxcel.in");
    await page.locator("#" + (await page.locator("label:has-text('Google Maps / Business Profile')").getAttribute("for"))).fill("https://www.google.com/maps/place/StratXcel+Solutions/@21.19,81.35,17z");
    await page.locator("#" + (await page.locator("label:has-text('Location / Operating City')").getAttribute("for"))).fill("Bhilai, Chhattisgarh, India");
    await page.locator("#" + (await page.locator("label:has-text('Industry / Category')").getAttribute("for"))).selectOption("SaaS & Technology");

    console.log("  ✓ Step 2: Pure business inputs verified (Zero social discovery UI / Zero slug field).");
    await page.screenshot({ path: path.join(OUT_DIR, "step2-business-pure.png") });

    // Continue to Step 3
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 3. STEP 3: GOALS (Simple Business Language + Recommendations)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Scenario 3: Step 3 Goals with Business Language");
    const step3Text = await page.textContent("body");
    assert.ok(step3Text?.includes("What do you want StratXcel to help you improve?"), "Must show canonical goals question");
    assert.ok(step3Text?.includes("Recommended"), "Must show recommended tags");
    assert.ok(step3Text?.includes("Get more local customers"), "Must show business goals");
    assert.ok(step3Text?.includes("Improve Google visibility"), "Must show Google visibility");
    assert.ok(step3Text?.includes("Get more leads from WhatsApp"), "Must show WhatsApp leads");
    assert.ok(step3Text?.includes("Stay active on social media"), "Must show social media");
    assert.equal(step3Text?.includes("₹9,999"), false, "Must NOT show pricing in goals");

    console.log("  ✓ Step 3: Goals step verified.");
    await page.screenshot({ path: path.join(OUT_DIR, "step3-goals.png") });

    // Continue to Step 4
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 4. STEP 4: BRAND (Brand Signals & Pre-fill)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Scenario 4: Step 4 Brand Signals & Editable Pre-fill");
    const step4Text = await page.textContent("body");
    assert.ok(step4Text?.includes("Help StratXcel understand how your business should sound"), "Must show brand headline");
    assert.ok(step4Text?.includes("Pre-filled from your business information"), "Must show pre-fill badge");
    assert.ok(step4Text?.includes("Short Business Description"), "Must show description field");
    assert.ok(step4Text?.includes("Target Audience"), "Must show audience field");
    assert.ok(step4Text?.includes("Tone of Voice"), "Must show tone field");
    assert.ok(step4Text?.includes("Primary Services / Offers"), "Must show offers field");

    console.log("  ✓ Step 4: Brand step verified.");
    await page.screenshot({ path: path.join(OUT_DIR, "step4-brand.png") });

    // Continue to Step 5
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 5. STEP 5: REVIEW (Verified Snapshot & Start Free Audit CTA)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Scenario 5: Step 5 Review & Zero Technical Jargon");
    const step5Text = await page.textContent("body");
    assert.ok(step5Text?.includes("Everything looks good?"), "Must show Review headline");
    assert.ok(step5Text?.includes("Account & Channels"), "Must show Account & Channels section");
    assert.ok(step5Text?.includes("Business Identity"), "Must show Business Identity section");
    assert.ok(step5Text?.includes("StratXcel Solutions"), "Must show business name");
    assert.ok(step5Text?.includes("https://stratxcel.in"), "Must show website");
    assert.ok(step5Text?.includes("Start My Free Business Audit →"), "Must have primary audit CTA");

    // Critical assertion: Zero slug, zero internal metadata, zero pricing
    assert.equal(step5Text?.includes("slug"), false, "Must NOT show slug in review");
    assert.equal(step5Text?.includes("₹9,999"), false, "Must NOT show ₹9,999 in review");
    assert.equal(step5Text?.includes("Growth tier"), false, "Must NOT show Growth tier in review");

    console.log("  ✓ Step 5: Review step verified.");
    await page.screenshot({ path: path.join(OUT_DIR, "step5-review.png") });

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 6. Multi-Viewport Mobile & Desktop Responsive Validation
  // ---------------------------------------------------------------------------
  console.log("\n>>> Scenario 6: Multi-Viewport Responsive Validation across 7 devices");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-rebuild`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);

    // Check horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasHorizontalScroll, false, `Must have zero horizontal overflow on ${vp.name}`);

    // Verify compact progress indicator visibility
    const stepIndicator = await page.textContent("body");
    assert.ok(stepIndicator?.includes("Step 1 of 5"), `Must show progress on ${vp.name}`);

    await page.screenshot({ path: path.join(OUT_DIR, `onboarding-${vp.name}.png`) });
    console.log(`  ✓ [${vp.name}] (${vp.width}x${vp.height}) Layout clean, no horizontal overflow.`);
    await context.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("ALL REBUILT ONBOARDING ARCHITECTURE E2E TESTS COMPLETED & PASSED!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("E2E Verification Failed:", err);
  process.exit(1);
});
