// Verify Step 2 WhatsApp Card on production
import { chromium } from "playwright-core";
import fs from "node:fs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((c) => fs.existsSync(c));

async function main() {
  console.log("=== VERIFYING STEP 2 ON PRODUCTION (https://www.stratxcel.in) ===");
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto("https://www.stratxcel.in/test-onboarding-canonical", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Fill Step 1 Account fields to navigate to Step 2
  const nameInput = page.locator('input[placeholder*="Company"], input[name="businessName"], input[id*="business"]').first();
  if (await nameInput.isVisible()) {
    await nameInput.fill("StratXcel Test Co");
  }

  // Click Next / Continue button
  const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
  if (await continueBtn.isVisible()) {
    await continueBtn.click();
    await page.waitForTimeout(1000);
  }

  // Check Step 2 Connectors
  const bodyText = await page.textContent("body") || "";
  console.log("Step 2 loaded. Checking WhatsApp card...");

  const waCardText = await page.locator('[data-platform="whatsapp"]').textContent().catch(() => "");
  console.log("WhatsApp Card Content:", waCardText.replace(/\s+/g, " "));

  const hasVerifiedBug = waCardText.includes("WhatsApp number verified");
  console.log("Has premature 'WhatsApp number verified' text:", hasVerifiedBug ? "BUG DETECTED" : "NO (CORRECT)");

  const hasConnectBtn = waCardText.includes("Connect");
  console.log("Has Connect button:", hasConnectBtn ? "YES (CORRECT)" : "NO");

  await browser.close();
}

main().catch(console.error);
