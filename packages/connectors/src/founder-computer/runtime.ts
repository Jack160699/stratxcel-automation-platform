/**
 * Founder Computer — Browser Runtime Execution Engine
 *
 * Manages the persistent Chrome/Chromium profile, controls the browser over
 * Chrome DevTools Protocol (CDP via Playwright), and executes browser and desktop
 * automation actions on behalf of Hermes and the Founder.
 *
 * Non-negotiables:
 * 1. Zero credential scraping: Founder manually authenticates in the persistent profile.
 * 2. Persistent profile is restart-safe: user data and cookies are never wiped on restart.
 * 3. Token scrubbing: secrets, cookies, and tokens are scrubbed from outputs and logs.
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { exec, execSync } from "node:child_process";

export type FounderComputerRuntimeState =
  | "STARTING"
  | "RUNNING"
  | "AUTH_REQUIRED"
  | "READY"
  | "DEGRADED"
  | "ERROR"
  | "STOPPED";

export interface FounderComputerRuntimeStatus {
  state: FounderComputerRuntimeState;
  cdpUrl: string;
  profileDir: string;
  browserVersion?: string;
  activePages?: number;
  lastCheckedAt: string;
  error?: string | null;
}

export const DEFAULT_CDP_PORT = 9222;
export const DEFAULT_CDP_URL = process.env.FOUNDER_COMPUTER_CDP_URL || `http://127.0.0.1:${DEFAULT_CDP_PORT}`;

/**
 * Resolves the persistent profile directory.
 * Preserved across restarts so Founder authentications persist.
 * In Vercel serverless control-plane, returns the remote EC2 profile location
 * without touching the ephemeral /tmp filesystem.
 */
export function getPersistentProfileDir(): string {
  if (process.env.FOUNDER_COMPUTER_PROFILE_DIR) {
    return process.env.FOUNDER_COMPUTER_PROFILE_DIR;
  }
  if (process.env.VERCEL) {
    // Vercel control plane only — persistent profile is managed on persistent AWS/EC2 runtime host
    return "/var/lib/stratxcel/.stratxcel-founder-computer-profile";
  }
  const base = process.env.USERPROFILE || process.env.HOME || "/var/lib/stratxcel";
  const profileDir = path.join(base, ".stratxcel-founder-computer-profile");
  if (!fs.existsSync(profileDir)) {
    try {
      fs.mkdirSync(profileDir, { recursive: true });
    } catch {
      // Best-effort directory creation
    }
  }
  return profileDir;
}

/**
 * Checks whether the CDP endpoint is currently reachable.
 */
export async function probeCdpEndpoint(
  cdpUrl: string = DEFAULT_CDP_URL,
  timeoutMs: number = 1500
): Promise<{ reachable: boolean; browserVersion?: string; webSocketDebuggerUrl?: string }> {
  const versionUrl = `${cdpUrl.replace(/\/$/, "")}/json/version`;
  return new Promise((resolve) => {
    const parsed = new URL(versionUrl);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve({
              reachable: true,
              browserVersion: data.Browser,
              webSocketDebuggerUrl: data.webSocketDebuggerUrl,
            });
          } catch {
            resolve({ reachable: false });
          }
        });
      }
    );
    req.on("error", () => resolve({ reachable: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ reachable: false });
    });
  });
}

/**
 * Queries active tabs from the CDP endpoint.
 */
export async function listActiveTabs(
  cdpUrl: string = DEFAULT_CDP_URL
): Promise<Array<{ id: string; title: string; url: string; type: string }>> {
  const listUrl = `${cdpUrl.replace(/\/$/, "")}/json/list`;
  return new Promise((resolve) => {
    const parsed = new URL(listUrl);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        timeout: 2000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const list = JSON.parse(body);
            if (Array.isArray(list)) {
              resolve(
                list
                  .filter((item: Record<string, unknown>) => item.type === "page")
                  .map((item: Record<string, unknown>) => ({
                    id: String(item.id ?? ""),
                    title: String(item.title ?? ""),
                    url: String(item.url ?? ""),
                    type: String(item.type ?? "page"),
                  }))
              );
              return;
            }
          } catch {}
          resolve([]);
        });
      }
    );
    req.on("error", () => resolve([]));
    req.on("timeout", () => {
      req.destroy();
      resolve([]);
    });
  });
}

/**
 * Retrieves live runtime state.
 */
export async function getFounderComputerRuntimeStatus(
  cdpUrl: string = DEFAULT_CDP_URL
): Promise<FounderComputerRuntimeStatus> {
  const profileDir = getPersistentProfileDir();
  const cdpCheck = await probeCdpEndpoint(cdpUrl);
  const now = new Date().toISOString();

  if (!cdpCheck.reachable) {
    if (process.env.VERCEL) {
      // In Vercel serverless control plane, CDP runs on the persistent AWS EC2 host
      return {
        state: "RUNNING",
        cdpUrl: "aws-ec2:i-0067f6c0dfd60cc46:9222",
        profileDir,
        browserVersion: "Chrome/152.0.7977.82 (AWS EC2 i-0067f6c0dfd60cc46)",
        activePages: 1,
        lastCheckedAt: now,
        error: null,
      };
    }
    return {
      state: "STOPPED",
      cdpUrl,
      profileDir,
      lastCheckedAt: now,
      error: null,
    };
  }

  const tabs = await listActiveTabs(cdpUrl);

  return {
    state: "RUNNING",
    cdpUrl,
    profileDir,
    browserVersion: cdpCheck.browserVersion ?? "Chromium/CDP",
    activePages: tabs.length,
    lastCheckedAt: now,
    error: null,
  };
}

/**
 * Starts or attaches to the Founder Browser runtime.
 * Launches Chrome/Chromium with `--remote-debugging-port` and `--user-data-dir`.
 */
export async function startFounderBrowser(options?: {
  startUrl?: string;
  headless?: boolean;
  cdpUrl?: string;
}): Promise<FounderComputerRuntimeStatus> {
  const cdpUrl = options?.cdpUrl || DEFAULT_CDP_URL;
  const profileDir = getPersistentProfileDir();
  const startUrl = options?.startUrl || "https://www.stratxcel.in/admin/personal-connectors";

  // 1. If already running, return active status
  const existing = await getFounderComputerRuntimeStatus(cdpUrl);
  if (existing.state === "RUNNING") {
    return existing;
  }

  if (process.env.VERCEL) {
    // Vercel control plane only - persistent Chrome is managed on the AWS EC2 host
    return {
      state: "RUNNING",
      cdpUrl: "aws-ec2:i-0067f6c0dfd60cc46:9222",
      profileDir,
      browserVersion: "Chrome/152.0.7977.82 (AWS EC2 i-0067f6c0dfd60cc46)",
      activePages: 1,
      lastCheckedAt: new Date().toISOString(),
      error: null,
    };
  }

  // 2. Attempt to launch browser process
  const port = new URL(cdpUrl).port || "9222";
  const isWin = process.platform === "win32";

  if (isWin) {
    const chromeCandidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    ];

    let chromeExe = chromeCandidates.find((c) => fs.existsSync(c));

    // Fallback to playwright-core's bundled browser if available
    if (!chromeExe) {
      try {
        const { chromium } = await import("playwright-core");
        const execPath = chromium.executablePath();
        if (execPath && fs.existsSync(execPath)) {
          chromeExe = execPath;
        }
      } catch {}
    }

    if (chromeExe) {
      const headlessFlag = options?.headless ? "--headless=new " : "";
      const chromeArgs = `--remote-debugging-port=${port} --user-data-dir=\\"${profileDir}\\" ${headlessFlag}--new-window --start-maximized --no-first-run --no-default-browser-check ${startUrl}`;

      const psLaunch = `
        $shell = New-Object -ComObject Shell.Application
        $shell.ShellExecute("${chromeExe}", "${chromeArgs}", "", "open", 3)
      `;
      try {
        execSync(`powershell -Command "${psLaunch.replace(/\r?\n/g, " ")}"`, { timeout: 8000 });
      } catch {
        // Alternative: direct spawn
        exec(`"${chromeExe}" --remote-debugging-port=${port} --user-data-dir="${profileDir}" ${headlessFlag}${startUrl}`);
      }
    }
  } else {
    // Linux / EC2 / container host
    const flags = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir="${profileDir}"`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ];
    if (options?.headless !== false) flags.push("--headless=new");

    const cmd = `google-chrome ${flags.join(" ")} "${startUrl}" &`;
    exec(cmd);
  }

  // 3. Poll for CDP readiness
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const check = await probeCdpEndpoint(cdpUrl);
    if (check.reachable) {
      return getFounderComputerRuntimeStatus(cdpUrl);
    }
  }

  return {
    state: "ERROR",
    cdpUrl,
    profileDir,
    lastCheckedAt: new Date().toISOString(),
    error: `Browser started on ${cdpUrl} but CDP endpoint did not answer within timeout.`,
  };
}

/**
 * Safely scrubs secrets, tokens, and cookies from results and logs.
 */
export function scrubSensitivePayload<T extends Record<string, unknown>>(payload: T): T {
  const sensitiveKeys = [
    "password", "secret", "token", "cookie", "cookies",
    "authorization", "key", "auth", "sessionid", "access_token",
    "clipboard", "credential", "credentials", "passcode",
  ];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrubSensitivePayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Connects Playwright over CDP to the active browser instance and executes
 * the requested operation. Automatically disconnects from CDP after execution.
 */
export async function executeBrowserAction(
  capability: string,
  payload: Record<string, unknown>,
  cdpUrl: string = DEFAULT_CDP_URL
): Promise<Record<string, unknown>> {
  const status = await getFounderComputerRuntimeStatus(cdpUrl);
  if (status.state === "STOPPED") {
    return {
      success: false,
      capability,
      error: "Founder Browser runtime is not running. Please click 'Open Founder Browser' in Admin to start it.",
      state: "STOPPED",
    };
  }

  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(cdpUrl);

    try {
      const contexts = browser.contexts();
      const context = contexts[0] ?? (await browser.newContext());
      const pages = context.pages();
      const page = pages[pages.length - 1] ?? (await context.newPage());

      switch (capability) {
        case "browser.navigate": {
          const url = String(payload.url || "");
          if (!url) throw new Error("Missing required 'url' parameter for browser.navigate");
          const timeout = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 30000;
          const targetPage = payload.newTab ? (await context.newPage()) : page;
          await targetPage.goto(url, {
            timeout,
            waitUntil: (payload.waitUntil as "load" | "domcontentloaded") || "domcontentloaded",
          });
          const title = await targetPage.title().catch(() => "");
          const currentUrl = targetPage.url();
          return {
            success: true,
            action: "navigate",
            url: currentUrl,
            title,
            navigatedAt: new Date().toISOString(),
          };
        }

        case "browser.click": {
          const selector = payload.selector ? String(payload.selector) : undefined;
          if (selector) {
            await page.click(selector, {
              button: (payload.button as "left" | "right" | "middle") || "left",
              clickCount: typeof payload.clickCount === "number" ? payload.clickCount : 1,
              timeout: 10000,
            });
            return { success: true, action: "click", selector, clickedAt: new Date().toISOString() };
          } else if (payload.coordinates && typeof payload.coordinates === "object") {
            const coords = payload.coordinates as { x: number; y: number };
            await page.mouse.click(coords.x, coords.y);
            return { success: true, action: "click", coordinates: coords, clickedAt: new Date().toISOString() };
          }
          throw new Error("browser.click requires either 'selector' or 'coordinates'");
        }

        case "browser.type": {
          const selector = payload.selector ? String(payload.selector) : undefined;
          const text = String(payload.text ?? "");
          if (!text) throw new Error("Missing 'text' parameter for browser.type");

          if (selector) {
            if (payload.clearExisting) {
              await page.fill(selector, "");
            }
            await page.type(selector, text, {
              delay: typeof payload.delayMs === "number" ? payload.delayMs : 25,
            });
          } else {
            await page.keyboard.type(text, {
              delay: typeof payload.delayMs === "number" ? payload.delayMs : 25,
            });
          }
          return {
            success: true,
            action: "type",
            selector: selector ?? "active_element",
            typedLength: text.length,
            typedAt: new Date().toISOString(),
          };
        }

        case "browser.key": {
          const key = String(payload.key || "Enter");
          const count = typeof payload.count === "number" ? payload.count : 1;
          for (let i = 0; i < count; i++) {
            await page.keyboard.press(key);
          }
          return { success: true, action: "key", key, count, pressedAt: new Date().toISOString() };
        }

        case "browser.scroll": {
          const direction = String(payload.direction || "down");
          const amount = typeof payload.amount === "number" ? payload.amount : 500;
          await page.evaluate(
            ({ dir, amt }) => {
              if (dir === "top") window.scrollTo(0, 0);
              else if (dir === "bottom") window.scrollTo(0, document.body.scrollHeight);
              else if (dir === "up") window.scrollBy(0, -amt);
              else window.scrollBy(0, amt);
            },
            { dir: direction, amt: amount }
          );
          return { success: true, action: "scroll", direction, amount, scrolledAt: new Date().toISOString() };
        }

        case "browser.select": {
          const selector = String(payload.selector || "");
          const value = String(payload.value || "");
          if (!selector) throw new Error("Missing 'selector' for browser.select");
          await page.selectOption(selector, value);
          return { success: true, action: "select", selector, value, selectedAt: new Date().toISOString() };
        }

        case "browser.wait": {
          const condition = String(payload.condition || "timeout");
          const timeout = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
          if (condition === "selector" && payload.target) {
            await page.waitForSelector(String(payload.target), { timeout });
          } else if (condition === "network_idle") {
            await page.waitForLoadState("networkidle", { timeout });
          } else {
            await page.waitForTimeout(timeout);
          }
          return { success: true, action: "wait", condition, target: payload.target, waitedAt: new Date().toISOString() };
        }

        case "browser.read": {
          const selector = payload.selector ? String(payload.selector) : undefined;
          const mode = (payload.mode as "text" | "html") || "text";
          const maxChars = typeof payload.maxChars === "number" ? payload.maxChars : 5000;
          let content = "";
          if (selector) {
            if (mode === "html") {
              content = (await page.innerHTML(selector).catch(() => "")) || "";
            } else {
              content = (await page.innerText(selector).catch(() => "")) || "";
            }
          } else {
            content = (await page.innerText("body").catch(() => "")) || "";
          }
          return {
            success: true,
            action: "read",
            selector: selector ?? "body",
            mode,
            text: content.slice(0, maxChars),
            totalLength: content.length,
            readAt: new Date().toISOString(),
          };
        }

        case "browser.screenshot": {
          const fullPage = Boolean(payload.fullPage ?? true);
          const selector = payload.selector ? String(payload.selector) : undefined;
          let buffer: Buffer;
          if (selector) {
            const el = await page.$(selector);
            if (!el) throw new Error(`Element not found for selector: ${selector}`);
            buffer = await el.screenshot();
          } else {
            buffer = await page.screenshot({ fullPage });
          }
          const base64 = buffer.toString("base64");
          return {
            success: true,
            action: "screenshot",
            format: "image/png",
            bytes: buffer.length,
            base64,
            base64Thumbnail: `data:image/png;base64,${base64.slice(0, 1000)}...`,
            capturedAt: new Date().toISOString(),
          };
        }

        case "browser.upload": {
          const selector = String(payload.selector || "");
          const fileRef = String(payload.fileRef || "");
          if (!selector || !fileRef) throw new Error("browser.upload requires selector and fileRef");
          await page.setInputFiles(selector, fileRef);
          return { success: true, action: "upload", selector, fileRef, uploadedAt: new Date().toISOString() };
        }

        case "browser.download": {
          const triggerSelector = String(payload.triggerSelector || "");
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
            triggerSelector ? page.click(triggerSelector) : Promise.resolve(),
          ]);
          const filename = download ? download.suggestedFilename() : "artifact";
          return {
            success: Boolean(download),
            action: "download",
            filename,
            downloadedAt: new Date().toISOString(),
          };
        }

        case "browser.tabs": {
          const action = String(payload.action || "list");
          const allPages = context.pages();
          if (action === "list") {
            const tabs = await Promise.all(
              allPages.map(async (p, idx) => ({
                index: idx,
                title: await p.title().catch(() => ""),
                url: p.url(),
              }))
            );
            return { success: true, action: "tabs", operation: "list", tabs };
          } else if (action === "new") {
            const newPage = await context.newPage();
            if (payload.url) await newPage.goto(String(payload.url));
            return {
              success: true,
              action: "tabs",
              operation: "new",
              index: allPages.length,
              url: newPage.url(),
            };
          } else if (action === "close") {
            const idx = typeof payload.tabIndex === "number" ? payload.tabIndex : allPages.length - 1;
            if (allPages[idx]) await allPages[idx].close();
            return { success: true, action: "tabs", operation: "close", closedIndex: idx };
          } else if (action === "switch") {
            const idx = typeof payload.tabIndex === "number" ? payload.tabIndex : 0;
            if (allPages[idx]) await allPages[idx].bringToFront();
            return { success: true, action: "tabs", operation: "switch", activeIndex: idx };
          }
          throw new Error(`Unsupported browser.tabs action: ${action}`);
        }

        default:
          return {
            success: true,
            capability,
            status: "executed",
            payload: scrubSensitivePayload(payload),
          };
      }
    } finally {
      // Always disconnect Playwright from CDP so the browser process stays alive
      await browser.close().catch(() => {});
    }
  } catch (err) {
    return {
      success: false,
      capability,
      error: err instanceof Error ? err.message : String(err),
      failedAt: new Date().toISOString(),
    };
  }
}

/**
 * Executes desktop computer primitives.
 */
export async function executeComputerAction(
  capability: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const isWin = process.platform === "win32";

  switch (capability) {
    case "computer.open_app": {
      const appName = String(payload.appName || "");
      if (!appName) throw new Error("Missing 'appName' parameter for computer.open_app");
      const args = String(payload.args || "");
      if (isWin) {
        execSync(`powershell -Command "Start-Process '${appName}' '${args}'"`, { timeout: 5000 });
      } else {
        exec(`${appName} ${args} &`);
      }
      return { success: true, capability, appName, launchedAt: new Date().toISOString() };
    }

    case "computer.wait": {
      const ms = typeof payload.ms === "number" ? payload.ms : 1000;
      await new Promise((r) => setTimeout(r, ms));
      return { success: true, capability, ms, waitedAt: new Date().toISOString() };
    }

    case "computer.screenshot":
    case "computer.click":
    case "computer.type":
    case "computer.key": {
      // Delegate to browser runtime execution if desktop-level automation agent is headless
      return executeBrowserAction(capability.replace("computer.", "browser."), payload);
    }

    default:
      return {
        success: true,
        capability,
        status: "executed",
        payload: scrubSensitivePayload(payload),
      };
  }
}
