import { chromium } from "playwright-core";

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function poll() {
  console.log("Polling Vercel production deployment for 8-channel connector order...");
  for (let i = 1; i <= 30; i++) {
    try {
      const browser = await chromium.launch({ executablePath, headless: true });
      const page = await browser.newPage();
      await page.goto("https://www.stratxcel.in/test-onboarding-canonical", { waitUntil: "networkidle" });
      await page.locator("button:has-text('Continue →')").click();
      await page.waitForTimeout(1000);
      const text = await page.textContent("body");
      await browser.close();

      const hasYouTube = text.includes("YouTube");
      const hasX = text.includes("X");
      const hasGbp = text.includes("Google Business");
      const hasContinueGoogle = text.includes("Continue with Google");

      console.log(`[Attempt ${i}/30] YouTube: ${hasYouTube} | X: ${hasX} | GBP: ${hasGbp} | Continue with Google: ${hasContinueGoogle}`);

      if (hasYouTube && hasX && hasGbp && hasContinueGoogle) {
        console.log(">>> DEPLOYMENT 3b5c5a7 IS LIVE ON PRODUCTION!");
        process.exit(0);
      }
    } catch (e) {
      console.log(`[Attempt ${i}/30] Error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.error("Timeout waiting for deployment.");
  process.exit(1);
}

poll();
