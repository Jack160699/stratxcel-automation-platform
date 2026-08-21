// Captures real screenshots of the Growth Assistant / content-approval /
// publish-result screens for the public site's product-evidence story, from
// the isolated demo harness at /test-growth-assistant-canonical (which
// renders the actual production components — see that route's file header).
// Modeled on scripts/verify-onboarding-full-e2e.mjs.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] || "http://localhost:3322";
const OUT_DIR = path.join(process.cwd(), ".screenshots-growth-assistant");
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

const SCREENS = [
  { id: "screen-growth-assistant", file: "05-growth-assistant.png" },
  { id: "screen-generated-content", file: "06-generated-content.png" },
  { id: "screen-approval", file: "07-approval.png" },
  { id: "screen-published", file: "08-published.png" },
];

async function run() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });

  await page.goto(`${BASE_URL}/test-growth-assistant-canonical`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  for (const screen of SCREENS) {
    const locator = page.locator(`#${screen.id}`);
    await locator.waitFor({ state: "visible" });
    const outPath = path.join(OUT_DIR, screen.file);
    await locator.screenshot({ path: outPath });
    console.log(`✓ Captured ${screen.id} -> ${outPath}`);
  }

  await browser.close();
  console.log("\nAll Growth Assistant demo screenshots captured.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
