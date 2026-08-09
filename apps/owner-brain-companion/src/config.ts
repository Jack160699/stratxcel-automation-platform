import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * All local state lives in one JSON file under the OS's per-user app-data
 * directory — never in the repo, never committed. This file's bearerToken
 * is the device's own credential (issued once at pairing time by
 * completeDevicePairing on the server, see lib/owner-brain/repositories/
 * desktop-devices.ts) — losing it means re-pairing, not a security
 * disaster, since the server can revoke it independently at any time from
 * the admin UI's Privacy Control Center regardless of what's on disk here.
 */
export interface CompanionConfig {
  apiBaseUrl: string;
  deviceId: string | null;
  bearerToken: string | null;
  paused: boolean;
  consent: {
    /** If false, no app-tracking signals are collected at all — only manual "remember" notes. */
    collectActiveApp: boolean;
    /** If false, app_session signals report only the app name, never the window title (which can contain document names, URLs, chat contents in the title bar). */
    collectWindowTitle: boolean;
  };
}

const DEFAULT_CONFIG: CompanionConfig = {
  apiBaseUrl: process.env.OWNER_BRAIN_API_BASE_URL || "https://www.stratxcel.in",
  deviceId: null,
  bearerToken: null,
  paused: false,
  consent: { collectActiveApp: true, collectWindowTitle: false },
};

function configDir(): string {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(base, "stratxcel-owner-brain-companion");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function loadConfig(): CompanionConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CompanionConfig): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

/** "device revoke" from the device's own side — wipes the local pairing entirely. Server-side revoke (Privacy Control Center) is independent and always wins even if this never runs. */
export function clearPairing(): void {
  const config = loadConfig();
  config.deviceId = null;
  config.bearerToken = null;
  saveConfig(config);
}

export function queueFilePath(): string {
  return path.join(configDir(), "offline-queue.jsonl");
}
