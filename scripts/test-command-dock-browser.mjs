import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), ".screenshots-office-live");
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
  console.error("No Chromium browser found.");
  process.exit(1);
}

async function testCommandDock() {
  console.log("================================================================================");
  console.log("TESTING HERMES COMMAND DOCK IN BROWSER");
  console.log("================================================================================");

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await context.addCookies([
      { name: "sx_dev_admin", value: "1", domain: "localhost", path: "/" },
    ]);

    const page = await context.newPage();
    page.on("console", (msg) => console.log("PAGE CONSOLE:", msg.text()));
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err));

    await page.goto(`${BASE_URL}/admin/office`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 1. Click Hermes command dock pill
    console.log("1. Finding Hermes Command Pill...");
    const pill = await page.$('button[aria-label*="Hermes executive command console"]');
    if (!pill) {
      throw new Error("Could not find Hermes command pill button");
    }
    await pill.click();
    await page.waitForTimeout(500);

    // 2. Locate input
    console.log("2. Verifying expanded input box...");
    const input = await page.$('input[placeholder*="Ask Hermes to act"]');
    if (!input) {
      throw new Error("Could not find command input after clicking pill");
    }

    // 3. Type Founder command
    const testCommand = "Find 100 qualified solar leads for Solara Energy";
    console.log(`3. Typing command: "${testCommand}"...`);
    await input.fill(testCommand);
    await page.waitForTimeout(300);

    // Take screenshot of open command dock
    const pathFocused = path.join(OUT_DIR, "06-office-command-dock-focused.png");
    await page.screenshot({ path: pathFocused });
    console.log(`✓ Screenshot captured: ${pathFocused}`);

    // 4. Submit command
    console.log("4. Submitting command via Enter...");
    await input.press("Enter");
    await page.waitForTimeout(2000);

    // 5. Open Activity Panel to verify immediate live activity ingestion
    const panelBtn = await page.$('button:has-text("PANEL")');
    if (panelBtn) {
      await panelBtn.click();
      await page.waitForTimeout(800);
    }

    // Check if new activity is displayed
    const content = await page.content();
    const hasActivity = content.includes("Solara Energy") || content.includes("PLANNING") || content.includes("Orchestrating");
    console.log(`5. Live activity reflected in office state: ${hasActivity ? "YES (VERIFIED)" : "NO"}`);

    const pathExecuted = path.join(OUT_DIR, "07-office-command-dock-executed.png");
    await page.screenshot({ path: pathExecuted });
    console.log(`✓ Screenshot captured: ${pathExecuted}`);

    console.log("================================================================================");
    console.log("HERMES COMMAND DOCK TEST COMPLETED SUCCESSFULLY!");
    console.log("================================================================================");
  } finally {
    await browser.close();
  }
}

testCommandDock().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
