import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const PROD_URL = "https://www.stratxcel.in";
const USER_PROFILE = process.env.USERPROFILE || "C:\\Users\\shriyansh chandrakar";
const PROFILE_DIR = path.join(USER_PROFILE, ".stratxcel-e2e-headed-profile");
const SCREENSHOT_DIR = path.join(process.cwd(), ".screenshots-production-live");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

async function takeScreenshot(page, name) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}-${ts}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  log(`📸 Screenshot saved: ${filename}`);
  return filePath;
}

// Update durable progress file
function recordProgress(connector, stage, status, details = "") {
  const progressFile = path.join(process.cwd(), "docs", "STRATXCEL_E2E_LIVE_PROGRESS.md");
  const entry = `- **[${new Date().toLocaleTimeString()}] [${connector.toUpperCase()}] [${stage}]**: ${status} ${details ? `(${details})` : ""}\n`;
  try {
    fs.appendFileSync(progressFile, entry);
  } catch {}
}

async function runAutonomousE2E() {
  log("================================================================================");
  log("STRATXCEL AUTONOMOUS PRODUCTION CONNECTOR E2E RUNNER");
  log("Target: " + PROD_URL);
  log("Profile: " + PROFILE_DIR);
  log("================================================================================\n");

  log("1. Spawning Maximized Visible Chrome Window on User Desktop...");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    viewport: null,
    args: [
      "--start-maximized",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const pages = context.pages();
  const page = pages[0] || (await context.newPage());

  context.on("page", (newPage) => {
    log(`[Browser Event: New Tab/Popup] URL: ${newPage.url()}`);
  });

  log("2. Navigating to StratXcel Login Page...");
  await page.goto(`${PROD_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await takeScreenshot(page, "01-login-screen");

  // Step 3: Check Authentication
  let url = page.url();
  if (url.includes("/login") || url.includes("/signup") || url.includes("/auth")) {
    log("\n================================================================================");
    log("MANUAL ACTION REQUIRED — Please complete the StratXcel login in the visible browser.");
    log("I will take over automatically after you reach the dashboard.");
    log("================================================================================\n");

    while (true) {
      await page.waitForTimeout(2000);
      const activePages = context.pages();
      const p = activePages[activePages.length - 1] || page;
      const cur = p.url();
      if (!cur.includes("/login") && !cur.includes("/signup") && !cur.includes("/auth") && cur.includes("stratxcel.in/app")) {
        log(`\n🎉 [LOGIN DETECTED!] Landed on authenticated workspace: ${cur}`);
        await takeScreenshot(p, "02-authenticated-workspace");
        break;
      }
    }
  }

  // Step 4: Land on Business Profile / Digital Presence
  const activePage = context.pages()[context.pages().length - 1] || page;
  if (!activePage.url().includes("/app/brand")) {
    log("Navigating to Business Profile (/app/brand)...");
    await activePage.goto(`${PROD_URL}/app/brand`, { waitUntil: "networkidle" });
    await activePage.waitForTimeout(2000);
  }
  await takeScreenshot(activePage, "03-brand-profile-presence");

  // Get tenant ID from DOM or API
  let tenantId = await activePage.evaluate(() => {
    // Check local storage or meta tags or window state
    const match = document.cookie.match(/active_tenant_id=([^;]+)/);
    return match ? match[1] : null;
  });

  log(`Tenant ID detected: ${tenantId || "resolving via status API..."}`);

  // Fetch status API
  const initialStatus = await activePage.evaluate(async (tid) => {
    try {
      const url = tid ? `/api/platform/integrations/status?tenantId=${encodeURIComponent(tid)}` : `/api/platform/integrations/status`;
      const res = await fetch(url);
      if (!res.ok) return { error: res.status, text: await res.text() };
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  }, tenantId);

  log(`Initial Digital Presence Summary:`);
  console.log(JSON.stringify(initialStatus, null, 2));

  if (initialStatus?.tenantId) {
    tenantId = initialStatus.tenantId;
  }

  recordProgress("SYSTEM", "LOGIN_AND_RESOLVE", "SUCCESS", `Tenant ID: ${tenantId}`);

  log("\n>>> Ready to systematically test connectors in the visible browser!");
  log(">>> Automation is actively monitoring the live session.\n");

  // Keep the runner active and monitoring
  while (true) {
    await activePage.waitForTimeout(3000);
    const curPages = context.pages();
    const curP = curPages[curPages.length - 1] || activePage;
    const curUrl = curP.url();

    // Check for provider OAuth prompts
    if (curUrl.includes("accounts.google.com")) {
      log(`[OAUTH IN PROGRESS: Google] URL: ${curUrl}`);
    } else if (curUrl.includes("facebook.com") || curUrl.includes("instagram.com")) {
      log(`[OAUTH IN PROGRESS: Meta] URL: ${curUrl}`);
    } else if (curUrl.includes("/app/brand") && (curUrl.includes("oauth=success") || curUrl.includes("googleConnected=1") || curUrl.includes("provider="))) {
      log(`🎉 [OAUTH RETURN DETECTED] Processing callback on /app/brand: ${curUrl}`);
      await curP.waitForTimeout(3000);
      await takeScreenshot(curP, "oauth-callback-landed");

      // Verify status again
      const updatedStatus = await curP.evaluate(async (tid) => {
        const res = await fetch(`/api/platform/integrations/status?tenantId=${encodeURIComponent(tid)}`);
        return await res.json();
      }, tenantId);

      log("Updated Connection State after OAuth return:");
      console.log(JSON.stringify(updatedStatus, null, 2));
    }
  }
}

runAutonomousE2E().catch((err) => {
  console.error("Fatal runner error:", err);
  process.exit(1);
});
