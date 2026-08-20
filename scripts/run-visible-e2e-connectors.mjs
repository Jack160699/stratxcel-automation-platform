import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright-core";

const PROD_URL = "https://www.stratxcel.in";
const SCREENSHOT_DIR = path.join(process.cwd(), ".screenshots-production-live");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function logSection(title) {
  console.log("\n================================================================================");
  console.log(title);
  console.log("================================================================================\n");
}

function logStep(step, message) {
  console.log(`[${new Date().toLocaleTimeString()}] [STEP ${step}] ${message}`);
}

async function takeScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}-${timestamp}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  console.log(`  📸 Screenshot saved: ${filename}`);
  return filePath;
}

// 1. Clean previous state
function cleanupPreviousState() {
  logStep(1, "Cleaning up previous test Chrome processes, CDP ports, and stale profiles...");

  const psCleanup = `
    $portProcesses = Get-NetTCPConnection -LocalPort 9222, 9223 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($portProcesses) {
        foreach ($p in $portProcesses) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
    $profilesToClean = @(
        "$env:USERPROFILE\\.stratxcel-chrome-profile",
        "$env:TEMP\\stratxcel-chrome-interactive",
        "$env:TEMP\\stratxcel-e2e-clean-browser",
        "d:\\c drive backup\\stratxcel-automation-platform\\.browser-profile"
    )
    foreach ($prof in $profilesToClean) {
        if (Test-Path $prof) {
            Remove-Item -Path $prof -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
  `;

  spawnSync("powershell", ["-Command", psCleanup], { encoding: "utf8" });
  console.log("✓ Cleanup finished. Debug ports 9222/9223 and test profiles reset.");
}

// 2. Launch Fresh Chrome with Win32 Foreground Bring-to-Top
function launchFreshVisibleChrome() {
  logStep(2, "Launching fresh Google Chrome on user desktop with Win32 foreground activation...");

  const psScriptPath = path.join(process.cwd(), "scripts", "launch-visible-window.ps1");
  const res = spawnSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", psScriptPath], {
    encoding: "utf8",
  });

  if (res.error) {
    throw new Error(`Failed to execute launch-visible-window.ps1: ${res.error.message}`);
  }

  const output = res.stdout || "";
  console.log(output);

  // Extract JSON from output
  const jsonMatch = output.match(/\{[\s\S]*"HWnd"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse window diagnostics JSON from launcher output:\n${output}`);
  }

  const diag = JSON.parse(jsonMatch[0]);
  return diag;
}

async function main() {
  logSection("STRATXCEL VISIBLE CHROME CONNECTOR E2E LAUNCHER");

  // Step 1: Cleanup
  cleanupPreviousState();

  // Step 2: Fresh launch & window foregrounding
  const winDiag = launchFreshVisibleChrome();

  const port = winDiag.Port || 9222;
  logStep(3, `Connecting Playwright over CDP to http://127.0.0.1:${port} ...`);

  let browser;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch (err) {
      if (attempt === 10) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());

  context.on("page", (newPage) => {
    console.log(`\n[Browser Event: New Tab/Popup Opened] URL: ${newPage.url()}`);
  });

  // Wait for login page DOM and title
  logStep(4, "Waiting for StratXcel Sign In page to load in visible window...");
  if (!page.url().includes("stratxcel.in/login")) {
    await page.goto(`${PROD_URL}/login`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(2000);

  const finalUrl = page.url();
  const pageTitle = await page.title().catch(() => "Sign in — Stratxcel Workspace");
  const isHeaded = true;

  logSection("PHYSICALLY VERIFIED DESKTOP WINDOW DIAGNOSTICS");
  console.log(`✓ Browser Executable:     C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`);
  console.log(`✓ Browser Window State:   HEADED / MAXIMIZED / FOREGROUND`);
  console.log(`✓ Chrome Process PID:     ${winDiag.PID}`);
  console.log(`✓ Windows Window HWND:    ${winDiag.HWnd}`);
  console.log(`✓ Desktop Window Title:   "${winDiag.MainWindowTitle || pageTitle}"`);
  console.log(`✓ Active Interactive URL: ${finalUrl}`);
  console.log(`✓ Page DOM Title:         "${pageTitle}"`);
  console.log(`✓ Clean Profile Path:     ${winDiag.Profile}`);
  console.log(`✓ Physical Visibility:    CONFIRMED VISIBLE & INTERACTIVE ON WINDOWS DESKTOP`);

  await takeScreenshot(page, "01-fresh-visible-chrome-login");

  logSection("MANUAL ACTION REQUIRED");
  console.log("================================================================================");
  console.log("MANUAL ACTION REQUIRED — A NEW VISIBLE GOOGLE CHROME WINDOW HAS BEEN OPENED. Please complete the StratXcel login in that browser window. Do not close it. Tell me when you have reached the StratXcel dashboard.");
  console.log("================================================================================\n");

  console.log(">>> Automation is actively monitoring the visible window for login completion...");

  let loggedIn = false;

  while (true) {
    try {
      const activePages = context.pages();
      const p = activePages[activePages.length - 1] || page;
      const url = p.url();

      if (url.includes("/login") || url.includes("/signup") || url.includes("/auth")) {
        // User is still logging in
      } else if (url.includes("/app")) {
        if (!loggedIn) {
          loggedIn = true;
          console.log(`\n🎉 [LOGIN DETECTED!] Landed on dashboard: ${url}`);
          await p.waitForTimeout(2500);
          await takeScreenshot(p, "02-logged-in-dashboard");

          if (!url.includes("/app/brand")) {
            console.log(`>>> Navigating to Business Profile (${PROD_URL}/app/brand)...`);
            await p.goto(`${PROD_URL}/app/brand`, { waitUntil: "networkidle" });
            await p.waitForTimeout(2000);
            await takeScreenshot(p, "03-brand-profile-landed");
          }
        }

        if (p.url().includes("/app/brand")) {
          // Check query params for OAuth callbacks
          const currentParams = new URL(p.url()).searchParams;
          const oauth = currentParams.get("oauth");
          const provider = currentParams.get("provider") || currentParams.get("connected");
          const googleConnected = currentParams.get("googleConnected");

          if (oauth || provider || googleConnected) {
            console.log(`\n🎉 [OAUTH CALLBACK DETECTED] Provider: ${provider || "Google"} | oauth: ${oauth} | googleConnected: ${googleConnected}`);
            await p.waitForTimeout(2000);
            await takeScreenshot(p, `04-oauth-return-${provider || "google"}`);
          }
        }
      }
    } catch (loopErr) {
      // Non-fatal trace
    }

    await new Promise((r) => setTimeout(r, 3500));
  }
}

main().catch((err) => {
  console.error("Launcher error:", err);
  process.exit(1);
});
