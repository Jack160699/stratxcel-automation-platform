import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-canonical-5step-onboarding");
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
  console.log("STARTING CANONICAL 5-STEP STRATXCEL ONBOARDING E2E VALIDATION");
  console.log(`Targeting dev server: ${BASE_URL}`);
  console.log("================================================================================\n");

  const browser = await chromium.launch({ executablePath, headless: true });

  // ---------------------------------------------------------------------------
  // 1. STEP 1: ACCOUNT (Google Identity + Website & Google Maps ONLY)
  // ---------------------------------------------------------------------------
  console.log(">>> Step 1: Account (Google Identity + Website & Google Maps inputs)");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-canonical`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    const step1Text = await page.textContent("body");
    assert.ok(step1Text?.includes("Your StratXcel Account"), "Must display authenticated account section");
    assert.ok(step1Text?.includes("Google account connected"), "Must show Google connected badge");
    assert.ok(step1Text?.includes("Where is your business online?"), "Must show discovery source headline");
    assert.ok(step1Text?.includes("Website / Domain"), "Must display Website input in Step 1");
    assert.ok(step1Text?.includes("Google Maps / Google Business Profile"), "Must display Google Maps input in Step 1");
    assert.equal(step1Text?.includes("Connect your business channels"), false, "Step 1 must NOT contain social connectors");

    // Test natural website normalization (e.g. typing "stratxcel.in" auto-normalizes)
    const websiteInput = page.locator("input[placeholder='yourwebsite.com']");
    await websiteInput.fill("stratxcel.in");
    await websiteInput.blur();
    await page.waitForTimeout(200);

    const normalizedValue = await websiteInput.inputValue();
    assert.equal(normalizedValue, "https://stratxcel.in", "Natural website input must normalize to canonical HTTPS");

    // Fill Google Maps link
    const gbpInput = page.locator("input[placeholder*='Google Maps']");
    await gbpInput.fill("https://maps.app.goo.gl/stratxcelHQ");
    await page.waitForTimeout(200);

    await page.screenshot({ path: path.join(OUT_DIR, "step1-account-sources.png") });
    console.log("  ✓ Step 1: Google account, website normalization, and Google Maps inputs verified.");

    // Advance to Step 2
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 2. STEP 2: CONNECTORS (Dedicated OAuth Channel Hub)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 2: Connectors (Dedicated OAuth Hub)");
    const step2Text = await page.textContent("body");
    assert.ok(step2Text?.includes("Connect your business channels"), "Must display Step 2 headline");
    assert.ok(step2Text?.includes("Instagram"), "Must display Instagram connector");
    assert.ok(step2Text?.includes("Facebook"), "Must display Facebook connector");
    assert.ok(step2Text?.includes("Threads"), "Must display Threads connector");
    assert.ok(step2Text?.includes("LinkedIn"), "Must display LinkedIn connector");
    assert.ok(step2Text?.includes("YouTube"), "Must display YouTube connector");
    assert.ok(step2Text?.includes("WhatsApp"), "Must display WhatsApp connector");
    assert.ok(step2Text?.includes("Requires Meta Business setup"), "WhatsApp must explain business setup");

    // Test public profile manual addition fallback
    const addProfileLink = page.locator("button:has-text('Add public profile manually instead')").first();
    await addProfileLink.click();
    await page.waitForSelector("text=Add public profile", { timeout: 3000 });
    assert.ok(await page.textContent("body")?.then((t) => t.includes("This adds a public profile reference only")), "Dialog must explain public profile status");

    await page.locator("#public-profile-input").fill("@stratxcel.ai");
    await page.locator("button:has-text('Save Public Profile')").click();
    await page.waitForTimeout(300);

    // Verify it is labeled as public profile (NOT connected via OAuth)
    const afterAddText = await page.textContent("body");
    assert.ok(afterAddText?.includes("Public profile only — not an authorized connection"), "Must show amber public profile badge");

    await page.screenshot({ path: path.join(OUT_DIR, "step2-connectors-hub.png") });
    console.log("  ✓ Step 2: Dedicated connector cards, OAuth architecture, and public profile fallback verified.");

    // Advance to Step 3
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 3. STEP 3: BUSINESS (Verification Screen: Pre-filled from Step 1 & 2)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 3: Business (Verification Screen, No Slug in UI)");
    const step3Text = await page.textContent("body");
    assert.ok(step3Text?.includes("Your business"), "Must show Step 3 headline");
    assert.ok(step3Text?.includes("We found most of this information for you"), "Must show verification subtext");
    assert.ok(step3Text?.includes("Business Name"), "Must have Business Name field");
    assert.ok(step3Text?.includes("Industry / Category"), "Must have Industry field");
    assert.ok(step3Text?.includes("Location / Operating City"), "Must have Location field");
    assert.ok(step3Text?.includes("Website"), "Must show pre-filled Website");
    assert.ok(step3Text?.includes("Google Maps / Business Profile"), "Must show pre-filled Google Maps");
    assert.equal(/Workspace Slug/i.test(step3Text || ""), false, "Workspace slug must NEVER be exposed in UI");

    // Verify website is pre-filled from Step 1
    const bizWebsiteInput = page.locator("input[placeholder='https://example.com']");
    assert.equal(await bizWebsiteInput.inputValue(), "https://stratxcel.in", "Website from Step 1 must be pre-filled in Step 3");

    // Fill business name and location
    const nameInput = page.locator("input[placeholder*='StratXcel Solutions']");
    await nameInput.fill("StratXcel Global");
    const locInput = page.locator("input[placeholder*='Bhilai']");
    await locInput.fill("Bhilai, Chhattisgarh, India");

    await page.screenshot({ path: path.join(OUT_DIR, "step3-business-verification.png") });
    console.log("  ✓ Step 3: Pre-filled signals, no workspace slug, verified.");

    // Advance to Step 4
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 4. STEP 4: GOALS (AI Recommended Priorities)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 4: Goals (AI Recommendations)");
    const step4Text = await page.textContent("body");
    assert.ok(step4Text?.includes("What do you want StratXcel to help you improve?"), "Must show Step 4 headline");
    assert.ok(step4Text?.includes("Recommended"), "Must show Recommended chips");
    assert.ok(step4Text?.includes("Get more local customers"), "Must have local customers goal");
    assert.ok(step4Text?.includes("Improve Google visibility"), "Must have Google visibility goal");

    await page.screenshot({ path: path.join(OUT_DIR, "step4-goals-recommended.png") });
    console.log("  ✓ Step 4: AI goals recommendation verified.");

    // Advance to Step 5 (Review) — Brand is cleanly bypassed!
    await page.locator("button:has-text('Continue')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 5. STEP 5: REVIEW (Final Verification Summary with GET MY FREE AUDIT CTA)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 5: Review (Summary & GET MY FREE AUDIT CTA)");
    const step5Text = await page.textContent("body");
    assert.ok(step5Text?.includes("Everything looks good?"), "Must show Step 5 headline");
    assert.ok(step5Text?.includes("Account & Channels"), "Must show Account section");
    assert.ok(step5Text?.includes("Business Identity"), "Must show Business section");
    assert.ok(step5Text?.includes("Focus Priorities"), "Must show Focus Priorities section");
    assert.ok(step5Text?.includes("GET MY FREE AUDIT →"), "Must show canonical Audit CTA button 'GET MY FREE AUDIT →'");
    assert.equal(/Workspace Slug/i.test(step5Text || ""), false, "Workspace slug must NOT be in Review summary");
    assert.equal(/₹9,999|pricing|package/i.test(step5Text || ""), false, "Pricing/packages must NOT be in Review summary");

    await page.screenshot({ path: path.join(OUT_DIR, "step5-review-summary.png") });
    console.log("  ✓ Step 5: Final Review summary and 'GET MY FREE AUDIT →' CTA verified.");

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 6. MULTI-VIEWPORT RESPONSIVE LAYOUT VERIFICATION (7 VIEWPORTS)
  // ---------------------------------------------------------------------------
  console.log("\n>>> Phase 6: 7-Viewport Responsive Visual Check");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/test-onboarding-canonical`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);

    // Verify touch target sizes and layout width on mobile
    const metrics = await page.evaluate(() => {
      const continueBtn = document.querySelector("button[type='submit']");
      const rect = continueBtn?.getBoundingClientRect();
      return {
        btnHeight: rect?.height || 0,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    assert.ok(metrics.btnHeight >= 40, `Primary CTA height (${metrics.btnHeight}px) must be touch-friendly on ${vp.name}`);
    assert.ok(metrics.bodyWidth <= vp.width + 10, `No horizontal overflow on ${vp.name} (${metrics.bodyWidth} <= ${vp.width})`);

    await page.screenshot({ path: path.join(OUT_DIR, `responsive-${vp.name}.png`) });
    console.log(`  ✓ ${vp.name} (${vp.width}x${vp.height}) responsive check passed.`);
    await context.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("ALL CANONICAL 5-STEP ONBOARDING E2E TESTS PASSED SUCCESSFULLY");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("E2E Test Failure:", err);
  process.exit(1);
});
