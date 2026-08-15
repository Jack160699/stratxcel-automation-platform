import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL || "http://localhost:3312";

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

async function runVerification() {
  console.log(`Starting Public UX & Direct Browser Verification on ${BASE_URL}...`);
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Load Homepage
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);

  // 2. Check Title & SEO metadata
  const title = await page.title();
  console.log(`✓ Page Title: "${title}"`);
  assert.ok(title.includes("Stratxcel AI Agent"), "Title must contain Stratxcel AI Agent");

  // 3. Hero Section Validation
  const heroH1 = await page.textContent("section#hero");
  assert.ok(heroH1?.includes("You run your business"), "Hero must include 'You run your business'");
  assert.ok(heroH1?.includes("We help you get more on"), "Hero must include 'We help you get more on'");
  assert.ok(heroH1?.includes("START MY ₹999 BUSINESS AUDIT"), "Hero must have primary CTA");
  assert.ok(heroH1?.includes("SEE HOW IT WORKS"), "Hero must have secondary CTA");
  console.log("✓ Hero copy, outcome word container, and dual CTAs verified.");

  // Check outcome cycling over 3.5 seconds
  const initialOutcome = await page.textContent("section#hero span.underline");
  await page.waitForTimeout(3600);
  const nextOutcome = await page.textContent("section#hero span.underline");
  console.log(`✓ Dynamic Outcome Cycling: "${initialOutcome?.trim()}" → "${nextOutcome?.trim()}"`);
  assert.notEqual(initialOutcome?.trim(), nextOutcome?.trim(), "Outcome word must cycle dynamically");

  // 4. Benefit Strip Validation
  const benefitText = await page.textContent("section[aria-label='Core Business Benefits']");
  assert.ok(benefitText?.includes("SAVE TIME"), "Must include SAVE TIME");
  assert.ok(benefitText?.includes("REDUCE COSTS"), "Must include REDUCE COSTS");
  assert.ok(benefitText?.includes("BETTER QUALITY"), "Must include BETTER QUALITY");
  assert.ok(benefitText?.includes("MORE CUSTOMERS"), "Must include MORE CUSTOMERS");
  assert.ok(benefitText?.includes("BETTER FOLLOW-UP"), "Must include BETTER FOLLOW-UP");
  assert.ok(benefitText?.includes("FASTER GROWTH"), "Must include FASTER GROWTH");
  console.log("✓ Benefit Strip (Section 02) verified.");

  // 5. What Stratxcel Helps With Validation
  const helpsSection = await page.textContent("text=WHAT STRATXCEL HELPS WITH >> xpath=ancestor::section");
  assert.ok(helpsSection?.includes("Website"), "Must include Website");
  assert.ok(helpsSection?.includes("SEO / Google"), "Must include SEO / Google");
  assert.ok(helpsSection?.includes("Content"), "Must include Content");
  assert.ok(helpsSection?.includes("Social Media"), "Must include Social Media");
  assert.ok(helpsSection?.includes("Customers"), "Must include Customers");
  assert.ok(helpsSection?.includes("Marketing"), "Must include Marketing");
  assert.ok(helpsSection?.includes("Sales"), "Must include Sales");
  assert.ok(helpsSection?.includes("Reporting"), "Must include Reporting");
  console.log("✓ What Stratxcel Helps With (Section 03: 8 Core Capabilities) verified.");

  // 6. How It Works (4 Connected Steps)
  const stepsSection = await page.textContent("section#how-it-works");
  assert.ok(stepsSection?.includes("Tell us about your business."), "Step 1 verified");
  assert.ok(stepsSection?.includes("Connect what you already use."), "Step 2 verified");
  assert.ok(stepsSection?.includes("Stratxcel helps with the work."), "Step 3 verified");
  assert.ok(stepsSection?.includes("See what is improving."), "Step 4 verified");
  console.log("✓ How It Works (Section 04: 4 Connected Steps) verified.");

  // 7. Interactive Discovery (Section 05)
  const explorerSection = await page.locator("section#explorer");
  await explorerSection.scrollIntoViewIfNeeded();
  
  // Click on "Grow on social media"
  const socialGoalButton = page.locator("button:has-text('Grow on social media')");
  await socialGoalButton.click();
  await page.waitForTimeout(300);
  const panelText = await page.textContent("#goal-panel-grow-on-social-media");
  assert.ok(panelText?.includes("multi-channel content calendar"), "Interactive Explorer must update to social workflow");
  console.log("✓ Interactive Discovery (Section 05) interaction verified.");

  // 8. Product Evidence (Section 06)
  const proofSection = await page.locator("section#proof");
  await proofSection.scrollIntoViewIfNeeded();
  assert.ok((await proofSection.textContent())?.includes("REAL PRODUCT EVIDENCE"), "Section 06 header verified");
  assert.ok((await proofSection.textContent())?.includes("LIVE"), "LIVE badge verified");
  assert.ok((await proofSection.textContent())?.includes("BETA"), "BETA badge verified");
  assert.ok((await proofSection.textContent())?.includes("STAFF-ASSISTED"), "STAFF-ASSISTED badge verified");
  assert.ok((await proofSection.textContent())?.includes("COMING SOON"), "COMING SOON badge verified");
  console.log("✓ Product Evidence (Section 06: Truthful Availability Standards) verified.");

  // 9. ₹999 Business Growth Audit (Section 07)
  const auditSection = await page.locator("section#audit");
  await auditSection.scrollIntoViewIfNeeded();
  const auditText = await auditSection.textContent();
  assert.ok(auditText?.includes("Not sure what your business needs first?"), "Audit headline verified");
  assert.ok(auditText?.includes("₹999"), "₹999 pricing verified");
  assert.ok(auditText?.includes("START MY ₹999 AUDIT"), "Audit CTA verified");
  console.log("✓ ₹999 Business Growth Audit (Section 07) verified.");

  // 10. Trust / Control (Section 08)
  const trustSection = await page.locator("text=YOU STAY IN CONTROL. >> xpath=ancestor::section");
  const trustText = await trustSection.textContent();
  assert.ok(trustText?.includes("Important work can require approval."), "Pillar 1 verified");
  assert.ok(trustText?.includes("Your accounts remain yours."), "Pillar 2 verified");
  assert.ok(trustText?.includes("Business information stays separated."), "Pillar 3 verified");
  assert.ok(trustText?.includes("You can see what Stratxcel is doing."), "Pillar 4 verified");
  console.log("✓ Trust & Control (Section 08: 4 Pillars) verified.");

  // 11. Final Closing Section (Section 09)
  const closingText = await page.textContent("text=Give your business the digital team it deserves. >> xpath=ancestor::section");
  assert.ok(closingText?.includes("START MY ₹999 BUSINESS AUDIT"), "Final primary CTA verified");
  assert.ok(closingText?.includes("SEE HOW IT WORKS"), "Final secondary CTA verified");
  console.log("✓ Final Closing CTA (Section 09) verified.");

  // 12. Footer & Verified Socials
  const footer = await page.locator("footer");
  const footerText = await footer.textContent();
  assert.ok(footerText?.includes("https://www.stratxcel.in"), "Canonical domain in footer verified");
  assert.ok(footerText?.includes("+91 77778 12777"), "WhatsApp contact in footer verified");
  
  const linkedinLink = await page.locator("footer a[href*='linkedin.com/company/stratxcel']").count();
  assert.ok(linkedinLink > 0, "Real Stratxcel LinkedIn link must be in footer");
  console.log("✓ Footer & Verified Social Destinations verified.");

  // 13. Mobile Viewport (390px) Test
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const mobileHero = await page.textContent("section#hero");
  assert.ok(mobileHero?.includes("You run your business"), "Mobile hero renders cleanly");
  assert.ok(mobileHero?.includes("START MY ₹999 BUSINESS AUDIT"), "Mobile CTA renders cleanly");
  console.log("✓ Mobile Viewport (390px) layout verified.");

  await browser.close();
  console.log("\n==========================================");
  console.log("ALL PUBLIC UX DIRECT VERIFICATIONS PASSED!");
  console.log("==========================================\n");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
