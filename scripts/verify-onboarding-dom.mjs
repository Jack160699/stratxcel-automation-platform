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
  console.error("No browser found");
  process.exit(1);
}

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "ultrawide-1920", width: 1920, height: 1080 },
];

async function run() {
  console.log(`Starting real browser DOM & layout inspection on ${BASE_URL}/test-onboarding-responsive...`);
  const browser = await chromium.launch({ executablePath, headless: true });

  const results = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    // Mock website discovery API route for deterministic, fast response
    await page.route("**/api/platform/site-discovery/resolve", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          finalState: "COMPLETE",
          data: {
            businessName: "StratXcel Technologies",
            industry: "SaaS & AI Growth Operations",
            businessModel: "B2B Subscription / Software",
            location: "Bhilai, Chhattisgarh, IN",
            businessStage: "GROWING",
            websiteUrl: "https://www.stratxcel.in",
            whatsapp: "+91-77778-12777",
            socialLinks: [
              { platform: "instagram", url: "https://www.instagram.com/stratxcel.ai/", handle: "@stratxcel.ai" },
              { platform: "threads", url: "https://www.threads.net/@stratxcel.ai", handle: "@stratxcel.ai" },
              { platform: "facebook", url: "https://www.facebook.com/share/1ZfjUR2RTS/", handle: "StratXcel Official" },
              { platform: "youtube", url: "https://www.youtube.com/@StratxcelSolutions", handle: "@StratxcelSolutions" },
              { platform: "linkedin", url: "https://www.linkedin.com/company/107894380/", handle: "stratxcel" },
            ]
          }
        })
      });
    });

    await page.goto(`${BASE_URL}/test-onboarding-responsive`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    // Measure bounding boxes of key elements
    const metrics = await page.evaluate(() => {
      const wizardContainer = document.querySelector("div[class*='max-w-']");
      const formCard = document.querySelector("form");
      const websiteField = document.querySelector("input[placeholder*='yourbusiness.com']");
      const socialSection = document.querySelector("form .grid.gap-3");
      const socialCards = Array.from(document.querySelectorAll("form .grid.gap-3 > div"));
      const firstCardHandle = socialCards[0]?.querySelector("p.font-semibold");
      const firstCardUrl = socialCards[0]?.querySelector("p.font-mono, p.text-subtle");

      const wBox = wizardContainer ? wizardContainer.getBoundingClientRect() : null;
      const fBox = formCard ? formCard.getBoundingClientRect() : null;
      const webBox = websiteField ? websiteField.getBoundingClientRect() : null;
      const sBox = socialSection ? socialSection.getBoundingClientRect() : null;
      const c0Box = socialCards[0] ? socialCards[0].getBoundingClientRect() : null;

      const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;

      return {
        viewportWidth: window.innerWidth,
        wizardWidth: wBox ? Math.round(wBox.width) : 0,
        formWidth: fBox ? Math.round(fBox.width) : 0,
        websiteInputWidth: webBox ? Math.round(webBox.width) : 0,
        socialGridWidth: sBox ? Math.round(sBox.width) : 0,
        socialCardCount: socialCards.length,
        firstCardWidth: c0Box ? Math.round(c0Box.width) : 0,
        hasHorizontalScroll,
        firstCardHandleText: firstCardHandle?.textContent || "",
        firstCardUrlText: firstCardUrl?.textContent || "",
      };
    });

    const screenshotPath = path.join(OUT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`[${vp.name}] Viewport: ${metrics.viewportWidth}px | Wizard: ${metrics.wizardWidth}px | Form: ${metrics.formWidth}px | WebInput: ${metrics.websiteInputWidth}px | Social Cards: ${metrics.socialCardCount} (card0: ${metrics.firstCardWidth}px) | Overflow: ${metrics.hasHorizontalScroll}`);
    console.log(`   Discovered handle 0: "${metrics.firstCardHandleText}" | URL: "${metrics.firstCardUrlText}"`);

    results.push({ viewport: vp.name, ...metrics, screenshotPath });
    await page.close();
  }

  await browser.close();

  console.log("\n=== SUMMARY OF VIEWPORT SCALING ===");
  for (const r of results) {
    const pct = Math.round((r.formWidth / r.viewportWidth) * 100);
    console.log(`• ${r.viewport}: Content Form Width = ${r.formWidth}px (${pct}% of viewport), WebInput = ${r.websiteInputWidth}px, Social Card Width = ${r.firstCardWidth}px, Overflow = ${r.hasHorizontalScroll}`);
    assert.equal(r.hasHorizontalScroll, false, `No horizontal scroll allowed at ${r.viewport}`);
    assert.ok(r.socialCardCount >= 5, `Must render at least 5 discovered social cards at ${r.viewport}`);
    if (r.viewportWidth >= 1280) {
      assert.ok(r.formWidth >= 1000, `Desktop form width must be >= 1000px on ${r.viewport}, got ${r.formWidth}px`);
      assert.ok(r.firstCardWidth >= 300, `Social card width must be >= 300px on ${r.viewport}, got ${r.firstCardWidth}px`);
    }
  }

  console.log("\n✓ All responsive assertions and visual inspections PASSED!");
}

run().catch((err) => {
  console.error("DOM verification failed:", err);
  process.exit(1);
});
