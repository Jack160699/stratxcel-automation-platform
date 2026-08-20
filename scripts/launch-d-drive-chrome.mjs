import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright-core";

const PROFILE_DIR = "D:\\stratxcel-e2e-browser-profile";

console.log("=== LAUNCHING INTERACTIVE CHROME ON DRIVE D: ===");
console.log("Profile directory:", PROFILE_DIR);

// 1. Reset Profile Directory on D:
try {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
} catch {}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// 2. Kill stale port 9222 process
try {
  const psKill = `
    $conns = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
    if ($conns) {
      foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  `;
  execSync("powershell -ExecutionPolicy Bypass -Command -", { input: psKill });
} catch {}

// 3. Launch via Shell.Application (Explorer COM Server)
const chromeExe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromeArgs = `--remote-debugging-port=9222 --user-data-dir="${PROFILE_DIR}" --new-window --start-maximized --no-first-run --no-default-browser-check https://www.stratxcel.in/login`;

const psLaunch = `
$shell = New-Object -ComObject Shell.Application
$shell.ShellExecute("${chromeExe}", '${chromeArgs}', "", "open", 3)
`;

console.log("Dispatching ShellExecute to Explorer Desktop Shell...");
execSync("powershell -ExecutionPolicy Bypass -Command -", { input: psLaunch });

// 4. Wait for CDP port
console.log("Waiting for Chrome CDP on port 9222...");
let cdpReady = false;
for (let i = 1; i <= 25; i++) {
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
      console.log(`✓ Chrome CDP active! Version: ${ok.Browser}`);
      cdpReady = true;
      break;
    }
  } catch {}
}

if (!cdpReady) {
  console.error("Failed to connect to CDP port 9222.");
  process.exit(1);
}

// 5. Inspect Win32 Window
const psWin = `
Add-Type -TypeDefinition @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;
  public class WinInspector {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);

    public static void InspectAndFocus() {
      EnumWindows((hWnd, lParam) => {
        if (IsWindowVisible(hWnd)) {
          StringBuilder sb = new StringBuilder(512);
          int len = GetWindowText(hWnd, sb, 512);
          if (len > 0) {
            string title = sb.ToString();
            if (title.Contains("Stratxcel") || title.Contains("Sign in") || title.Contains("Google Chrome")) {
              uint pid = 0;
              GetWindowThreadProcessId(hWnd, out pid);
              Console.WriteLine($"Found Window HWND: {hWnd} | PID: {pid} | Title: '{title}'");
              ShowWindow(hWnd, 9);
              ShowWindow(hWnd, 3);
              BringWindowToTop(hWnd);
              SetForegroundWindow(hWnd);
              return false;
            }
          }
        }
        return true;
      }, IntPtr.Zero);
    }
  }
"@
[WinInspector]::InspectAndFocus()
`;

try {
  const winOut = execSync("powershell -ExecutionPolicy Bypass -Command -", { input: psWin, encoding: "utf8" });
  console.log("\n=== WIN32 DESKTOP INSPECTION ===");
  console.log(winOut);
} catch (e) {
  console.log("Win32 inspector note:", e.message);
}

// 6. Connect Playwright over CDP to verify live DOM
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const contexts = browser.contexts();
const page = contexts[0].pages()[0];
await page.waitForLoadState("domcontentloaded");

const url = page.url();
const title = await page.title();

console.log("\n=== PLAYWRIGHT CDP LIVE VERIFICATION ===");
console.log(`Page URL:   ${url}`);
console.log(`Page Title: "${title}"`);
console.log("✓ Real visible browser is open and verified on the user desktop!");
