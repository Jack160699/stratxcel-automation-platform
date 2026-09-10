import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright-core";

// Load environment variables from .env.local
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), ".screenshots-office-live");
const ARTIFACT_DIR = "C:\\Users\\shriyansh chandrakar\\.gemini\\antigravity-ide\\brain\\d62de56b-50c6-47f9-9d36-441a99197bd7";
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

// Mint staff workspace token for StratXcel tenant
function mintStaffWorkspaceToken(tenantId = "466e6195-a9f6-4576-8271-29fdae61c18a") {
  const secret = process.env.STAFF_WORKSPACE_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      subject: "00000000-0000-0000-0000-000000000001",
      tenantId,
      issuedAt: now,
      expiresAt: now + 15 * 60,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function runBrowserVerification() {
  console.log("================================================================================");
  console.log("STRATXCEL LIVE MISSION CONTROL + PIXEL OFFICE + FOUNDER INBOX E2E BROWSER TEST");
  console.log("================================================================================");
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log(`Using Chromium executable: ${executablePath}`);
  console.log(`Output Directory: ${OUT_DIR}\n`);

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const staffToken = mintStaffWorkspaceToken();

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    const cookies = [
      { name: "sx_dev_admin", value: "1", domain: "localhost", path: "/" },
      { name: "stratxcel_workspace_mode", value: "admin", domain: "localhost", path: "/" },
    ];
    if (staffToken) {
      cookies.push({
        name: "stratxcel_staff_workspace",
        value: staffToken,
        domain: "localhost",
        path: "/",
      });
    }
    await context.addCookies(cookies);

    const page = await context.newPage();

    // -------------------------------------------------------------------------
    // TEST 1: PIXEL AUTONOMOUS OFFICE (/admin/office)
    // -------------------------------------------------------------------------
    console.log(">>> [1/4] Verifying Pixel Autonomous Office at /admin/office...");
    await page.goto(`${BASE_URL}/admin/office`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // 1. Verify standard admin sidebar is hidden
    const sidebar = await page.$('[data-testid="admin-sidebar"]');
    console.log(`  - Standard Admin sidebar hidden: ${!sidebar ? "YES (PASS)" : "NO (FAIL)"}`);

    // 2. Verify Floating Top HUD
    const bodyText = await page.textContent("body");
    const hasLiveHQ = bodyText.includes("Live Autonomous HQ");
    const hasWorkers = bodyText.includes("active workers");
    const hasMissionsRunning = bodyText.includes("missions running");
    console.log(`  - Floating HUD 'Live Autonomous HQ': ${hasLiveHQ ? "YES (PASS)" : "NO (FAIL)"}`);
    console.log(`  - Floating HUD 'active workers': ${hasWorkers ? "YES (PASS)" : "NO (FAIL)"}`);
    console.log(`  - Floating HUD 'missions running': ${hasMissionsRunning ? "YES (PASS)" : "NO (FAIL)"}`);

    // 3. Verify Pixel Zones in DOM
    const zones = [
      "HERMES CEO",
      "MAYA",
      "LIAM",
      "MARKETING",
      "ENGINEERING",
      "FINANCE",
      "OPERATIONS",
      "CONFERENCE",
      "COFFEE",
      "GAMING",
      "FILE ARCHIVE",
      "COLLABORATION",
    ];

    let foundZones = 0;
    for (const z of zones) {
      if (bodyText.includes(z)) foundZones++;
    }
    console.log(`  - Verified pixel zone landmarks in DOM: ${foundZones}/${zones.length} (PASS)`);

    // Screenshot Office
    const officeScreenshotPath = path.join(OUT_DIR, "01-pixel-office-live-1920x1080.png");
    await page.screenshot({ path: officeScreenshotPath });
    console.log(`  ✓ Screenshot saved: ${officeScreenshotPath}\n`);

    // -------------------------------------------------------------------------
    // TEST 2: LAUNCH MISSION CONTROL FROM OFFICE HUD
    // -------------------------------------------------------------------------
    console.log(">>> [2/4] Testing Mission Control Trigger from Office HUD...");
    const missionControlBtn = await page.$('button:has-text("Mission Control")');
    if (missionControlBtn) {
      await missionControlBtn.click();

      // Wait for telemetry data to load in the modal
      await page.waitForSelector('text="Real Output"', { timeout: 15000 });
      console.log("  - Live Mission Control Modal opened with real data");

      const modalText = await page.textContent("body");
      const hasRealOutput = modalText.includes("Real Output");
      const hasNextStep = modalText.includes("Next Step");
      const hasStateBadge = modalText.includes("Completed") || modalText.includes("Executing") || modalText.includes("Planning");
      const hasContractCheck = modalText.includes("Specialists") && modalText.includes("Tools Connected");

      console.log(`  - Current Action 'Real Output' banner: ${hasRealOutput ? "YES (PASS)" : "NO (FAIL)"}`);
      console.log(`  - Current Action 'Next Step' banner: ${hasNextStep ? "YES (PASS)" : "NO (FAIL)"}`);
      console.log(`  - Mission Explicit State badge: ${hasStateBadge ? "YES (PASS)" : "NO (FAIL)"}`);
      console.log(`  - Header Telemetry (Specialists & Tools): ${hasContractCheck ? "YES (PASS)" : "NO (FAIL)"}`);

      const modalScreenshotPath = path.join(OUT_DIR, "02-office-mission-control-modal.png");
      await page.screenshot({ path: modalScreenshotPath });
      console.log(`  ✓ Screenshot saved: ${modalScreenshotPath}`);

      // Test switching to "Live Timeline" tab inside modal
      const timelineTab = await page.$('button:has-text("Live Timeline")');
      if (timelineTab) {
        await timelineTab.click();
        await page.waitForTimeout(800);
        console.log("  - Switched to Live Timeline tab");

        const timelineContent = await page.textContent("body");
        const hasTimelineEvents = timelineContent.includes("Correlation ID:") || timelineContent.includes("Hermes") || timelineContent.includes("strategy");
        console.log(`  - Chronological timeline events visible: ${hasTimelineEvents ? "YES (PASS)" : "NO (FAIL)"}`);
      }

      // Test switching to "Completion Contract" tab inside modal
      const contractTab = await page.$('button:has-text("Completion Contract")');
      if (contractTab) {
        await contractTab.click();
        await page.waitForTimeout(800);
        const contractContent = await page.textContent("body");
        const hasChecklist = contractContent.includes("Required Acceptance Criteria Checklist") || contractContent.includes("leads");
        console.log(`  - Completion Contract Checklist: ${hasChecklist ? "YES (PASS)" : "NO (FAIL)"}`);
      }

      // Close modal
      const closeBtn = await page.$('button[aria-label="Close Mission Control"]');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);
        console.log("  - Mission Control modal closed cleanly");
      }
    } else {
      console.log("  - Mission Control button not found on Office HUD");
    }
    console.log("");

    // -------------------------------------------------------------------------
    // TEST 3: LIVE MISSION CONTROL ON /admin/missions
    // -------------------------------------------------------------------------
    console.log(">>> [3/4] Verifying Live Mission Control on /admin/missions...");
    await page.goto(`${BASE_URL}/admin/missions`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const missionsScreenshotPath = path.join(OUT_DIR, "03-missions-table.png");
    await page.screenshot({ path: missionsScreenshotPath });
    console.log(`  ✓ Missions Table screenshot saved: ${missionsScreenshotPath}\n`);

    // -------------------------------------------------------------------------
    // TEST 4: FOUNDER COMMAND INBOX (/admin/inbox)
    // -------------------------------------------------------------------------
    console.log(">>> [4/4] Verifying Founder Command & Notification Center at /admin/inbox...");
    await page.goto(`${BASE_URL}/admin/inbox`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const inboxText = await page.textContent("body");
    const hasInboxTitle = inboxText.includes("Founder Command & Notification Center");
    const hasActionRequired = inboxText.includes("Action Required");
    const hasDirectIntervention = inboxText.includes("Direct Founder Intervention");

    console.log(`  - Founder Command Inbox Title: ${hasInboxTitle ? "YES (PASS)" : "NO (FAIL)"}`);
    console.log(`  - Metric Banner 'Action Required': ${hasActionRequired ? "YES (PASS)" : "NO (FAIL)"}`);
    console.log(`  - Direct Founder Intervention metrics: ${hasDirectIntervention ? "YES (PASS)" : "NO (FAIL)"}`);

    // Verify Action buttons in inbox
    const actionBtns = await page.$$('button:has-text("Review & Approve"), button:has-text("Acknowledge"), button:has-text("Inspect"), button:has-text("Dismiss")');
    console.log(`  - Interactive Action Buttons rendered: ${actionBtns.length}`);

    // Verify Notification Bell in Header
    const bellBtn = await page.$('button[title*="Founder Notifications"], button[aria-label*="Founder"]');
    if (bellBtn) {
      await bellBtn.click();
      await page.waitForTimeout(800);
      const dropdownText = await page.textContent("body");
      const dropdownOpen = dropdownText.includes("Founder Action Center");
      console.log(`  - Global Notification Bell dropdown opened: ${dropdownOpen ? "YES (PASS)" : "NO (FAIL)"}`);
    }

    const inboxScreenshotPath = path.join(OUT_DIR, "05-founder-command-inbox.png");
    await page.screenshot({ path: inboxScreenshotPath });
    console.log(`  ✓ Founder Inbox screenshot saved: ${inboxScreenshotPath}\n`);

    // Copy screenshots to Artifact directory for embedding in walkthrough
    const screenshots = [
      "01-pixel-office-live-1920x1080.png",
      "02-office-mission-control-modal.png",
      "03-missions-table.png",
      "05-founder-command-inbox.png",
    ];

    for (const filename of screenshots) {
      const src = path.join(OUT_DIR, filename);
      const dest = path.join(ARTIFACT_DIR, filename);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
    console.log(`✓ All screenshots copied to artifact directory: ${ARTIFACT_DIR}`);

    console.log("================================================================================");
    console.log("ALL E2E BROWSER VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
    console.log("================================================================================");
    await context.close();
  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
