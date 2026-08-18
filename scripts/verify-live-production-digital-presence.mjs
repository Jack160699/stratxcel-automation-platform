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
  console.log("LIVE PRODUCTION DIGITAL PRESENCE & CONNECTOR VERIFICATION");
  console.log(`Target: ${PROD_URL}`);
  console.log("================================================================================\n");

  // 1. Health & Live Commit Confirmation
  console.log(">>> 1. Verifying /api/health and live deployed commit SHA...");
  const healthRes = await fetch(`${PROD_URL}/api/health`, { headers: { "Cache-Control": "no-cache" } });
  assert.equal(healthRes.status, 200, "Health check must return 200");
  const healthData = await healthRes.json();
  console.log("  Live Health Response:", JSON.stringify(healthData));
  assert.ok(healthData.commit, "Commit SHA must exist");
  assert.ok(
    healthData.commit.startsWith("b62b0ef"),
    `Live commit must match b62b0ef, received: ${healthData.commit}`
  );
  console.log(`  ✓ LIVE PRODUCTION RUNNING COMMIT: ${healthData.commit}\n`);

  // 2. Browser Verification of Live Public Surfaces and Onboarding Connectors
  console.log(">>> 2. Launching Chromium against live production environment...");
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Test Onboarding / Connectors Flow
  console.log("  Navigating to production onboarding connectors...");
  await page.goto(`${PROD_URL}/test-onboarding-canonical`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Fill Step 1 to reach Step 2 Connectors
  const websiteInput = page.locator("input[placeholder*='yourwebsite.com']").first();
  await websiteInput.fill("https://stratxcel.in");
  const continueBtn = page.getByRole("button", { name: /Continue|Next/i });
  await continueBtn.click();
  await page.waitForTimeout(1000);

  const step2Text = (await page.textContent("body")) || "";
  console.log("  Step 2 Text Preview:", step2Text.slice(0, 300).replace(/\s+/g, " "));

  // Assert V1.5 Platforms are present in Connectors
  assert.ok(step2Text.includes("Instagram"), "Instagram connector must be present");
  assert.ok(step2Text.includes("Facebook"), "Facebook connector must be present");
  assert.ok(step2Text.includes("YouTube"), "YouTube connector must be present");
  assert.ok(step2Text.includes("WhatsApp"), "WhatsApp connector must be present");
  assert.ok(step2Text.includes("Google"), "Google connector must be present");

  // Assert LinkedIn, X, Threads are ABSENT from customer Connectors in V1.5
  const hasLinkedIn = step2Text.includes("Connect LinkedIn") || step2Text.includes("LinkedIn account");
  const hasX = step2Text.includes("Connect X") || step2Text.includes("X account");
  const hasThreads = step2Text.includes("Connect Threads") || step2Text.includes("Threads account");

  console.log(`  - LinkedIn in V1.5 Connectors: ${hasLinkedIn ? "PRESENT (FAIL)" : "ABSENT (CLEAN ✓)"}`);
  console.log(`  - X in V1.5 Connectors: ${hasX ? "PRESENT (FAIL)" : "ABSENT (CLEAN ✓)"}`);
  console.log(`  - Threads in V1.5 Connectors: ${hasThreads ? "PRESENT (FAIL)" : "ABSENT (CLEAN ✓)"}`);

  assert.equal(hasLinkedIn, false, "LinkedIn must not be present in customer V1.5 connectors");
  assert.equal(hasX, false, "X must not be present in customer V1.5 connectors");
  assert.equal(hasThreads, false, "Threads must not be present in customer V1.5 connectors");

  await page.screenshot({ path: path.join(OUT_DIR, "live-prod-step2-connectors.png"), fullPage: true });

  // 3. Verify Live OAuth Connect Endpoints (Authentication & Parameter Enforcement)
  console.log("\n>>> 3. Testing Live OAuth Initiate Endpoints on Production...");

  const providers = ["instagram", "facebook", "youtube", "google_business"];
  for (const p of providers) {
    const res = await fetch(`${PROD_URL}/api/social/oauth/${p}/connect?redirectTo=/app/brand&tenantId=live_test_tenant`, {
      redirect: "manual",
    });
    console.log(`  [OAuth Connect] ${p}: HTTP ${res.status} (gated on authentication)`);
    assert.ok(
      res.status === 401 || res.status === 302 || res.status === 307,
      `${p} connect endpoint must enforce authentication or return redirect`
    );
  }

  // Google Search & GA4 Connect Endpoint
  const gRes = await fetch(`${PROD_URL}/api/platform/search/google/connect?redirectTo=/app/brand&tenantId=live_test_tenant`, {
    redirect: "manual",
  });
  console.log(`  [OAuth Connect] Google Search & GA4: HTTP ${gRes.status} (gated on authentication)`);
  assert.ok(gRes.status === 401 || gRes.status === 302 || gRes.status === 307, "Google connect must enforce authentication or return redirect");

  // 4. Verify Live Disconnect Route is Active
  console.log("\n>>> 4. Testing Live Disconnect Route Response...");
  const discRes = await fetch(`${PROD_URL}/api/platform/integrations/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  console.log(`  [Disconnect Route] HTTP ${discRes.status}`);
  assert.ok(discRes.status === 400 || discRes.status === 401 || discRes.status === 403, "Disconnect route must be live and enforce validation/auth");

  await browser.close();

  console.log("\n================================================================================");
  console.log("ALL LIVE PRODUCTION VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Live verification failed:", err);
  process.exit(1);
});
