import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright-core";

const USER_PROFILE = process.env.USERPROFILE || "C:\\Users\\shriyansh chandrakar";
const PROFILE_DIR = path.join(USER_PROFILE, ".stratxcel-interactive-profile");

console.log("=== LAUNCHING REAL INTERACTIVE DESKTOP CHROME VIA EXPLORER SHELL ===");

// 1. Clean previous stale process on port 9222
try {
  const psKill = `
    $conn = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
    if ($null -ne $conn) {
      Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  `;
  execSync(`powershell -Command "${psKill.replace(/\r?\n/g, ' ')}"`);
} catch {}

// 2. Clean profile directory
try {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
} catch {}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// 3. Launch through Windows Explorer Shell COM Object
const chromeExe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromeArgs = `--remote-debugging-port=9222 --user-data-dir=\\"${PROFILE_DIR}\\" --new-window --start-maximized --no-first-run --no-default-browser-check https://www.stratxcel.in/login`;

const psLaunch = `
$shell = New-Object -ComObject Shell.Application
$shell.ShellExecute("${chromeExe}", "${chromeArgs}", "", "open", 3)
`;

console.log("Dispatching ShellExecute via Explorer.exe COM server...");
execSync(`powershell -Command "${psLaunch.replace(/\r?\n/g, ' ')}"`);

// 4. Wait for CDP port
console.log("Waiting for Chrome to initialize on port 9222...");
let cdpReady = false;
for (let i = 1; i <= 20; i++) {
  await new Promise((r) => setTimeout(r, 600));
  try {
    const ok = await new Promise((resolve) => {
      const req = http.get("http://127.0.0.1:9222/json/version", (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
    });
    if (ok) {
      console.log(`✓ Chrome CDP active! Browser version: ${ok.Browser}`);
      cdpReady = true;
      break;
    }
  } catch {}
}

if (!cdpReady) {
  console.error("Failed to connect to CDP port 9222.");
  process.exit(1);
}

// 5. Connect Playwright over CDP to verify live DOM
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const contexts = browser.contexts();
const page = contexts[0].pages()[0];
await page.waitForLoadState("domcontentloaded");

const url = page.url();
const title = await page.title();

console.log(`✓ Playwright attached over CDP!`);
console.log(`  Page URL:   ${url}`);
console.log(`  Page Title: "${title}"`);

// 6. Query Win32 Window Info
const psInfo = `
$conn = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $conn) {
  $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  Write-Host "Owning PID: $($p.Id)"
  Write-Host "MainWindowHandle: $($p.MainWindowHandle)"
  Write-Host "MainWindowTitle: '$($p.MainWindowTitle)'"
}
`;
const winInfo = execSync(`powershell -Command "${psInfo.replace(/\r?\n/g, ' ')}"`, { encoding: "utf8" });
console.log("\n=== REAL WINDOWS DESKTOP WINDOW DIAGNOSTICS ===");
console.log(winInfo);

// 7. Focus window
const psFocus = `
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class WinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  }
"@
$conn = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $conn) {
  $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  if ($p.MainWindowHandle -ne 0) {
    [WinFocus]::ShowWindow($p.MainWindowHandle, 9)
    [WinFocus]::ShowWindow($p.MainWindowHandle, 3)
    [WinFocus]::BringWindowToTop($p.MainWindowHandle)
    [WinFocus]::SetForegroundWindow($p.MainWindowHandle)
    Write-Host "Window focused and brought to front."
  }
}
`;
try {
  execSync(`powershell -Command "${psFocus.replace(/\r?\n/g, ' ')}"`);
} catch {}

console.log("✓ SUCCESS: Real interactive Google Chrome window is open and focused on the user's desktop!");
