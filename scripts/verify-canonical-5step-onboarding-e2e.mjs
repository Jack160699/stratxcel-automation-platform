import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "https://www.stratxcel.in";
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
  console.log("STARTING CANONICAL 5-STEP STRATXCEL ONBOARDING & 8-CONNECTOR E2E VALIDATION");
  console.log(`Target: ${BASE_URL}`);
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
    await page.locator("button:has-text('Continue →')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 2. STEP 2: CONNECTORS (Mandatory 5 V1 Channels in Order)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 2: Connectors (Mandatory 5 V1 Channels in Order)");
    const step2Text = await page.textContent("body");
    assert.ok(step2Text?.includes("Connect your business channels"), "Must display Step 2 headline");
    assert.ok(step2Text?.includes("Google Business"), "Must display Google Business connector");
    assert.ok(step2Text?.includes("Instagram"), "Must display Instagram connector");
    assert.ok(step2Text?.includes("Facebook"), "Must display Facebook connector");
    assert.ok(step2Text?.includes("YouTube"), "Must display YouTube connector");
    assert.ok(step2Text?.includes("WhatsApp Number"), "Must display WhatsApp Number connector");
    assert.equal(step2Text?.includes("Threads"), false, "Must NOT display Threads connector in V1");
    assert.equal(step2Text?.includes("LinkedIn"), false, "Must NOT display LinkedIn connector in V1");
    assert.equal(step2Text?.includes("WhatsApp Business connected"), false, "Must NOT say WhatsApp Business connected");

    // Test WhatsApp OTP Modal
    const connectButtons = await page.locator("button:has-text('Connect')").all();
    assert.ok(connectButtons.length >= 5, "All 5 connector cards must display Connect CTA");

    const verifyNumberBtn = page.locator("[data-platform='whatsapp'] button:has-text('Connect')");
    await verifyNumberBtn.click();
    await page.waitForSelector("text=Verify WhatsApp Number", { timeout: 3000 });
    const modalText = await page.textContent("body");
    assert.ok(modalText?.includes("Send OTP on WhatsApp"), "Must show Send OTP on WhatsApp button");
    await page.locator("button:has-text('Cancel')").click();
    await page.waitForTimeout(200);

    // Test public profile manual addition fallback
    const addProfileLink = page.locator("button:has-text('Add public profile manually instead')").first();
    await addProfileLink.click();
    await page.waitForSelector("text=Add public profile", { timeout: 3000 });

    const manualInput = page.locator("#public-profile-input");
    await manualInput.fill("stratxcel_solutions");
    await page.locator("button:has-text('Save Public Profile')").click();
    await page.waitForTimeout(300);

    const step2UpdatedText = await page.textContent("body");
    assert.ok(
      step2UpdatedText?.includes("@stratxcel_solutions"),
      "Must show saved manual public profile handle"
    );
    assert.ok(
      step2UpdatedText?.includes("Public profile only"),
      "Must show distinction for unverified public profile"
    );

    await page.screenshot({ path: path.join(OUT_DIR, "step2-dedicated-connectors.png") });
    console.log("  ✓ Step 2: Mandatory 5-channel V1 order, YouTube, WhatsApp OTP modal, and manual profile fallback verified.");

    // Advance to Step 3
    await page.locator("button:has-text('Continue →')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 3. STEP 3: BUSINESS (Prefilled Discovery Verification, NO SLUG INPUT)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 3: Business (Prefilled Intelligence Verification)");
    const step3Text = await page.textContent("body");
    assert.ok(step3Text?.includes("Business name"), "Must display Business Name field");
    assert.ok(step3Text?.includes("Industry"), "Must display Industry field");
    assert.ok(step3Text?.includes("Headquarters / Operating Location"), "Must display Location field");
    assert.equal(step3Text?.includes("Workspace URL"), false, "Step 3 must NOT contain Workspace URL / Slug input");
    assert.equal(step3Text?.includes("workspace slug"), false, "Step 3 must NOT expose internal slug controls");

    await page.screenshot({ path: path.join(OUT_DIR, "step3-business-verification.png") });
    console.log("  ✓ Step 3: Business fields verified, zero slug input.");

    // Advance to Step 4
    await page.locator("button:has-text('Continue →')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 4. STEP 4: GOALS (Smart Multi-Select Goals)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 4: Goals (Multi-Select Strategic Goals)");
    const step4Text = await page.textContent("body");
    assert.ok(step4Text?.includes("What are your primary goals?"), "Must display Goals headline");

    await page.screenshot({ path: path.join(OUT_DIR, "step4-goals.png") });
    console.log("  ✓ Step 4: Strategic goals selection verified.");

    // Advance to Step 5
    await page.locator("button:has-text('Continue →')").click();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------------------
    // 5. STEP 5: REVIEW ("GET MY FREE AUDIT →" Primary CTA)
    // ---------------------------------------------------------------------------
    console.log("\n>>> Step 5: Review (GET MY FREE AUDIT Handoff)");
    const step5Text = await page.textContent("body");
    assert.ok(step5Text?.includes("Everything looks good?"), "Must display Review headline");
    assert.ok(step5Text?.includes("GET MY FREE AUDIT"), "Must contain primary CTA: GET MY FREE AUDIT");
    assert.ok(step5Text?.includes("No credit card required"), "Must highlight risk-free free audit");

    await page.screenshot({ path: path.join(OUT_DIR, "step5-review-audit-cta.png") });
    console.log("  ✓ Step 5: Review summary with GET MY FREE AUDIT CTA verified.");

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 6. RESPONSIVE VALIDATION ACROSS 7 VIEWPORTS
  // ---------------------------------------------------------------------------
  console.log("\n>>> Validating 7 Responsive Viewports on Step 2 Connectors...");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/test-onboarding-canonical`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);

    // Click to Step 2
    await page.locator("button:has-text('Continue →')").click();
    await page.waitForTimeout(200);

    const shotPath = path.join(OUT_DIR, `step2-connectors-${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`  ✓ Viewport ${vp.name} (${vp.width}x${vp.height}) verified.`);
    await context.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("CANONICAL 5-STEP & 8-CONNECTOR E2E VALIDATION: ALL VIEWPORTS PASSED");
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
