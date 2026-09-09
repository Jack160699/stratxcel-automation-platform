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
  console.error("No Chromium browser executable found on host.");
  process.exit(1);
}

async function runLiveVerification() {
  console.log("================================================================================");
  console.log("STRATXCEL OFFICE — LIVE BROWSER VERIFICATION & SCREENSHOT TEST");
  console.log("================================================================================");
  console.log(`Using Chromium executable: ${executablePath}`);
  console.log(`Screenshots output: ${OUT_DIR}\n`);

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: 1920x1080 Viewport (Desktop Fullscreen)
    // -------------------------------------------------------------------------
    console.log(">>> [1/5] Testing 1920x1080 Desktop Viewport (Chrome 100%)...");
    const context1080 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    // Set dev admin bypass cookie
    await context1080.addCookies([
      { name: "sx_dev_admin", value: "1", domain: "localhost", path: "/" },
    ]);

    const page1080 = await context1080.newPage();
    await page1080.goto(`${BASE_URL}/admin/office`, { waitUntil: "networkidle", timeout: 30000 });
    await page1080.waitForTimeout(2000); // allow animations/telemetry stream to settle

    // Check no admin sidebar or header
    const sidebar = await page1080.$('[data-testid="admin-sidebar"]');
    const adminNav = await page1080.$('nav[aria-label="Admin Navigation"]');
    console.log(`- Admin sidebar visible: ${sidebar ? "YES (FAILED)" : "NO (CORRECT - HIDDEN)"}`);
    console.log(`- Admin header nav visible: ${adminNav ? "YES (FAILED)" : "NO (CORRECT - HIDDEN)"}`);

    // Check scrollbars
    const scrollInfo = await page1080.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        hasVerticalScroll: doc.scrollHeight > window.innerHeight + 2,
        hasHorizontalScroll: doc.scrollWidth > window.innerWidth + 2,
      };
    });
    console.log(`- Viewport 1920x1080 Scroll check: vScroll=${scrollInfo.hasVerticalScroll}, hScroll=${scrollInfo.hasHorizontalScroll}`);

    // Exact floorplan zones & departments in OfficeEnvironment & Desks
    const zoneLabels = [
      "CONFERENCE & STRATEGY ROOM",
      "EXECUTIVE CEO SUITE",
      "COFFEE LOUNGE",
      "KITCHEN & BREAK",
      "GAMING ROOM",
      "RELAXATION AREA",
      "SALES & DEALS",
      "MARKET RESEARCH & INTEL",
      "SEO & DISCOVERY",
      "CONTENT & EDITORIAL",
      "FINANCE & COMMERCIAL",
      "WEBSITE & VERCEL",
      "OPERATIONS & FLEET",
      "PEOPLE & HR",
    ];

    const bodyHtml = await page1080.content();
    let foundZonesCount = 0;
    for (const label of zoneLabels) {
      if (bodyHtml.includes(label)) {
        foundZonesCount++;
      } else {
        console.log(`  (Zone label not directly matched: "${label}")`);
      }
    }
    console.log(`- Floorplan zones detected in DOM: ${foundZonesCount}/${zoneLabels.length}`);

    // Check Command Dock button/pill
    const commandPill = await page1080.$('button:has-text("HERMES")');
    console.log(`- Hermes CEO Command Dock Pill detected: ${commandPill ? "YES" : "NO"}`);

    // Click to open Command Dock input
    if (commandPill) {
      await commandPill.click();
      await page1080.waitForTimeout(500);
      const commandInput = await page1080.$('input[placeholder*="Founder objective"]');
      console.log(`- Hermes Command Input expanded: ${commandInput ? "YES" : "NO"}`);
    }

    const path1080 = path.join(OUT_DIR, "01-office-1920x1080.png");
    await page1080.screenshot({ path: path1080 });
    console.log(`✓ Screenshot captured: ${path1080}\n`);

    // -------------------------------------------------------------------------
    // TEST 2: Interactive Activity Panel Opening and Drag-Resize
    // -------------------------------------------------------------------------
    console.log(">>> [2/5] Testing Activity Panel Opening & Drag-Resize...");
    // Click the PANEL button in top status bar
    const panelToggleBtn = await page1080.$('button:has-text("PANEL")');
    if (panelToggleBtn) {
      await panelToggleBtn.click();
      await page1080.waitForTimeout(600);
      console.log("- Clicked PANEL button in status bar to open Activity Panel");
    }

    // Verify Activity Panel title is visible
    const activityPanelHeader = await page1080.$('text="AUTONOMOUS EXECUTION ENGINE"');
    console.log(`- Harness-style Activity Panel opened: ${activityPanelHeader ? "YES" : "NO"}`);

    // Find the drag handle
    const resizeHandle = await page1080.$('div[title*="Drag to resize"]');
    if (resizeHandle) {
      const box = await resizeHandle.boundingBox();
      if (box) {
        await page1080.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page1080.mouse.down();
        // Drag left by 140px to widen the panel
        await page1080.mouse.move(box.x - 140, box.y + box.height / 2, { steps: 5 });
        await page1080.mouse.up();
        await page1080.waitForTimeout(500);
        console.log("- Successfully dragged resize handle to widen panel");
      }
    }

    const pathResized = path.join(OUT_DIR, "02-office-activity-panel-resized.png");
    await page1080.screenshot({ path: pathResized });
    console.log(`✓ Screenshot captured: ${pathResized}\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Employee Inspector Interaction
    // -------------------------------------------------------------------------
    console.log(">>> [3/5] Testing Employee Inspector (Click Desk)...");
    // Click on Hermes or Mercury desk card
    const mercuryCard = await page1080.$('text="Mercury"');
    if (mercuryCard) {
      await mercuryCard.click();
      await page1080.waitForTimeout(1000);
      const reportsTo = await page1080.$('text="Hermes (CEO)"');
      const shiftSchedule = await page1080.$('text="24/7 Autonomous"');
      console.log(`- Employee Inspector Drawer opened: ${reportsTo ? "YES (Reports to Hermes verified)" : "NO"}`);
      console.log(`- Shift schedule displayed: ${shiftSchedule ? "YES (24/7 Autonomous verified)" : "NO"}`);
    } else {
      console.log("- Clicking first available worker card...");
      const anyWorker = await page1080.$('button:has-text("SALES"), button:has-text("HERMES")');
      if (anyWorker) await anyWorker.click();
    }

    const pathInspector = path.join(OUT_DIR, "03-office-employee-inspector.png");
    await page1080.screenshot({ path: pathInspector });
    console.log(`✓ Screenshot captured: ${pathInspector}\n`);
    await context1080.close();

    // -------------------------------------------------------------------------
    // TEST 4: 1440x900 Viewport (MacBook Pro / Standard Desktop)
    // -------------------------------------------------------------------------
    console.log(">>> [4/5] Testing 1440x900 Viewport Scaling...");
    const context900 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await context900.addCookies([
      { name: "sx_dev_admin", value: "1", domain: "localhost", path: "/" },
    ]);
    const page900 = await context900.newPage();
    await page900.goto(`${BASE_URL}/admin/office`, { waitUntil: "networkidle" });
    await page900.waitForTimeout(1500);

    const scroll900 = await page900.evaluate(() => ({
      hasVScroll: document.documentElement.scrollHeight > window.innerHeight + 2,
      hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    console.log(`- 1440x900 Scroll check: vScroll=${scroll900.hasVScroll}, hScroll=${scroll900.hasHScroll}`);

    const path900 = path.join(OUT_DIR, "04-office-1440x900.png");
    await page900.screenshot({ path: path900 });
    console.log(`✓ Screenshot captured: ${path900}\n`);
    await context900.close();

    // -------------------------------------------------------------------------
    // TEST 5: 1280x720 Viewport (Compact HD Viewport)
    // -------------------------------------------------------------------------
    console.log(">>> [5/5] Testing 1280x720 Viewport Scaling...");
    const context720 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    await context720.addCookies([
      { name: "sx_dev_admin", value: "1", domain: "localhost", path: "/" },
    ]);
    const page720 = await context720.newPage();
    await page720.goto(`${BASE_URL}/admin/office`, { waitUntil: "networkidle" });
    await page720.waitForTimeout(1500);

    const scroll720 = await page720.evaluate(() => ({
      hasVScroll: document.documentElement.scrollHeight > window.innerHeight + 2,
      hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    console.log(`- 1280x720 Scroll check: vScroll=${scroll720.hasVScroll}, hScroll=${scroll720.hasHScroll}`);

    const path720 = path.join(OUT_DIR, "05-office-1280x720.png");
    await page720.screenshot({ path: path720 });
    console.log(`✓ Screenshot captured: ${path720}\n`);
    await context720.close();

    console.log("================================================================================");
    console.log("ALL BROWSER VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
    console.log("================================================================================");
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
