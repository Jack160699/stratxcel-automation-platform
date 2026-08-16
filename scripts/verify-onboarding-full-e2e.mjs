import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-onboarding");
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
  { name: "mobile-320", width: 320, height: 600 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "ultrawide-1920", width: 1920, height: 1080 },
];

async function run() {
  console.log("================================================================================");
  console.log("STARTING FULL ONBOARDING E2E BROWSER & RESPONSIVE VALIDATION");
  console.log(`Targeting dev server: ${BASE_URL}`);
  console.log("================================================================================\n");

  const browser = await chromium.launch({ executablePath, headless: true });

  // ---------------------------------------------------------------------------
  // 1. Multi-Viewport Responsive Layout Audit
  // ---------------------------------------------------------------------------
  console.log(">>> Phase 1: Responsive Layout & Bounding Box Inspection Across 10 Viewports");
  const layoutResults = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    await page.goto(`${BASE_URL}/test-onboarding-responsive`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    const metrics = await page.evaluate(() => {
      const wizardContainer = document.querySelector("div[class*='max-w-']");
      const formCard = document.querySelector("form");
      const websiteSection = document.querySelector("form .rounded-sx-md");
      const websiteInput = document.querySelector("input[placeholder*='yourbusiness.com']");
      const socialGrid = document.querySelector("form .grid.gap-3\\.5, form .grid.gap-3");
      const socialCards = Array.from(document.querySelectorAll("form .grid.gap-3\\.5 > div, form .grid.gap-3 > div"));
      const firstCard = socialCards[0];

      const wBox = wizardContainer ? wizardContainer.getBoundingClientRect() : null;
      const fBox = formCard ? formCard.getBoundingClientRect() : null;
      const wsBox = websiteSection ? websiteSection.getBoundingClientRect() : null;
      const wiBox = websiteInput ? websiteInput.getBoundingClientRect() : null;
      const sgBox = socialGrid ? socialGrid.getBoundingClientRect() : null;
      const c0Box = firstCard ? firstCard.getBoundingClientRect() : null;

      const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;

      return {
        viewportWidth: window.innerWidth,
        wizardWidth: wBox ? Math.round(wBox.width) : 0,
        formWidth: fBox ? Math.round(fBox.width) : 0,
        websiteInputWidth: wiBox ? Math.round(wiBox.width) : 0,
        socialGridWidth: sgBox ? Math.round(sgBox.width) : 0,
        socialCardCount: socialCards.length,
        firstCardWidth: c0Box ? Math.round(c0Box.width) : 0,
        firstCardHandle: firstCard?.querySelector("p.font-semibold")?.textContent || "",
        hasHorizontalScroll,
      };
    });

    const screenshotPath = path.join(OUT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`[${vp.name}] V: ${metrics.viewportWidth}px | Form: ${metrics.formWidth}px (${Math.round((metrics.formWidth / metrics.viewportWidth) * 100)}%) | Card: ${metrics.firstCardWidth}px | Overflow: ${metrics.hasHorizontalScroll}`);
    layoutResults.push({ viewport: vp.name, ...metrics, screenshotPath });
    await page.close();
  }

  // Verify responsive constraints
  for (const r of layoutResults) {
    assert.equal(r.hasHorizontalScroll, false, `Must have NO horizontal overflow at ${r.viewport}`);
    assert.ok(r.socialCardCount >= 5, `Must render social cards at ${r.viewport}`);
    if (r.viewportWidth >= 1024) {
      assert.ok(r.formWidth >= 900, `Desktop/laptop form width must be >= 900px at ${r.viewport}, got ${r.formWidth}px`);
      assert.ok(r.firstCardWidth >= 300, `Social card width must be >= 300px at ${r.viewport}, got ${r.firstCardWidth}px`);
    }
  }
  console.log("✓ Phase 1: All 10 viewport responsive layout assertions passed!\n");

  // ---------------------------------------------------------------------------
  // 2. Functional Ownership & Replacement State Machine Verification
  // ---------------------------------------------------------------------------
  console.log(">>> Phase 2: Functional Ownership & Replacement Workflow Test");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${BASE_URL}/test-onboarding-responsive`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    // Test A: Confirming a discovered channel (✓ Mine)
    console.log("  Step A: Clicking '✓ Mine' on Instagram card...");
    const instagramCard = page.locator("form .grid > div").filter({ hasText: "Instagram" }).first();
    await instagramCard.locator("button:has-text('✓ Mine')").click();
    await page.waitForTimeout(200);
    const confirmedBadge = await instagramCard.locator("span:has-text('✓ Confirmed')").count();
    assert.ok(confirmedBadge > 0, "Instagram card must display '✓ Confirmed' badge after clicking '✓ Mine'");
    console.log("  ✓ Step A: '✓ Mine' confirmation state verified.");

    // Test B: Rejecting (Not mine) & Inline Replacement Flow
    console.log("  Step B: Clicking 'Not mine' on YouTube card...");
    const youtubeCard = page.locator("form .grid > div").filter({ hasText: "YouTube" }).first();
    await youtubeCard.locator("button:has-text('Not mine')").click();
    await page.waitForTimeout(200);

    // Verify inline replacement panel opened
    const replacementPanel = youtubeCard.locator("div:has-text('Enter your real YouTube account')");
    assert.ok((await replacementPanel.count()) > 0, "Inline replacement panel must open immediately on 'Not mine'");
    console.log("  ✓ Step B.1: Inline replacement panel opened immediately.");

    // Test C: Invalid replacement input error handling
    console.log("  Step C: Submitting invalid replacement input...");
    const replacementInput = youtubeCard.locator("input");
    await replacementInput.fill("invalid with spaces / symbols !!!");
    await youtubeCard.locator("button:has-text('Use this account')").click();
    await page.waitForTimeout(200);
    const errorMessage = await youtubeCard.locator("p.text-sx-danger").textContent();
    assert.ok(errorMessage && errorMessage.length > 0, "Must display inline error for invalid YouTube input");
    console.log(`  ✓ Step C: Inline error displayed correctly: "${errorMessage}"`);

    // Test D: Valid replacement input & auto-normalization
    console.log("  Step D: Submitting valid replacement input (@StratxcelSolutions)...");
    await replacementInput.fill("https://www.youtube.com/@StratxcelSolutions");
    await youtubeCard.locator("button:has-text('Use this account')").click();
    await page.waitForTimeout(300);

    // Verify YouTube card updated with user-provided verified account
    const ytHandle = await youtubeCard.locator("p.font-semibold").textContent();
    const ytUrl = await youtubeCard.locator("p.font-mono").textContent();
    const userProvidedBadge = await youtubeCard.locator("span:has-text('User Provided')").count();

    assert.equal(ytHandle?.trim(), "@StratxcelSolutions", "YouTube handle must be normalized to @StratxcelSolutions");
    assert.ok(ytUrl?.includes("https://www.youtube.com/@StratxcelSolutions"), "YouTube URL must match normalized link");
    assert.ok(userProvidedBadge > 0, "Must show 'User Provided' badge on replaced card");
    console.log(`  ✓ Step D: Replacement succeeded with handle: ${ytHandle} and URL: ${ytUrl}`);

    await page.close();
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("ALL REAL BROWSER ONBOARDING E2E TESTS COMPLETED & PASSED!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
