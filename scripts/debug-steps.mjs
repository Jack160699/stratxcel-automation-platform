import { chromium } from "playwright-core";

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function debug() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.stratxcel.in/test-onboarding-canonical", { waitUntil: "networkidle" });

  console.log("1. On Step 1. Clicking Continue...");
  await page.locator("button:has-text('Continue →')").click();
  await page.waitForTimeout(500);

  console.log("2. On Step 2. Headline:", await page.textContent("h3"));

  console.log("3. Clicking Continue on Step 2...");
  const continueBtn = page.locator("button:has-text('Continue →')");
  console.log("Continue button count:", await continueBtn.count());
  await continueBtn.click();
  await page.waitForTimeout(500);

  console.log("4. After clicking Continue on Step 2. Headline:", await page.textContent("h3"));
  console.log("Page text snippet:", (await page.textContent("body")).slice(0, 400));

  await browser.close();
}

debug().catch(console.error);
