import { chromium } from "playwright-core";

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function test() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.stratxcel.in/test-onboarding-canonical", { waitUntil: "networkidle" });
  console.log("Step 1 h3:", await page.textContent("h3"));
  await page.locator("button:has-text('Continue')").click();
  await page.waitForTimeout(1000);
  const step2Text = await page.textContent("body");
  console.log("Step 2 has Google Business:", step2Text.includes("Google Business"));
  console.log("Step 2 has Instagram:", step2Text.includes("Instagram"));
  console.log("Step 2 has Facebook:", step2Text.includes("Facebook"));
  console.log("Step 2 has Threads:", step2Text.includes("Threads"));
  console.log("Step 2 has LinkedIn:", step2Text.includes("LinkedIn"));
  console.log("Step 2 has WhatsApp Number:", step2Text.includes("WhatsApp Number"));
  console.log("Step 2 snippet:\n", step2Text.slice(0, 500));
  await browser.close();
}

test().catch(console.error);
