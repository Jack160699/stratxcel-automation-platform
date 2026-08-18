import { chromium } from "playwright";

async function main() {
  console.log("Launching headless browser to verify V1 5-connector onboarding layout...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Navigate to local or production
  await page.goto("https://www.stratxcel.in/test-onboarding-canonical", { waitUntil: "networkidle" });
  
  // Step 1 -> Click Next to go to Step 2 (Connectors)
  // Fill step 1 required fields if any
  const continueBtn = page.getByRole("button", { name: /Continue|Next/i });
  if (await continueBtn.isVisible()) {
    await continueBtn.click();
    await page.waitForTimeout(1000);
  }

  // Find all connector cards
  const cards = await page.locator("[data-platform]").all();
  console.log(`Found ${cards.length} connector cards`);

  const platforms = [];
  for (const card of cards) {
    const p = await card.getAttribute("data-platform");
    const text = await card.innerText();
    platforms.push({ platform: p, text: text.replace(/\n+/g, " ") });
  }

  console.log("Rendered connector platforms:", platforms);
  await browser.close();
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
});
