import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfig, queueFilePath } from "./config.ts";

export interface DesktopSignal {
  id: string;
  type: "app_session" | "manual_note";
  occurredAt: string;
  appName?: string;
  windowTitle?: string;
  durationSeconds?: number;
  note?: string;
}

/** Appends one line per signal — durable across a crash/restart, unlike an in-memory array. Creates the config directory on first use (e.g. `remember` before the device has ever paired/saved config). */
export function enqueue(signal: Omit<DesktopSignal, "id">): void {
  const full: DesktopSignal = { id: crypto.randomUUID(), ...signal };
  const filePath = queueFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(full) + "\n", "utf8");
}

function readQueued(): DesktopSignal[] {
  try {
    const raw = fs.readFileSync(queueFilePath(), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as DesktopSignal;
        } catch {
          return null;
        }
      })
      .filter((s): s is DesktopSignal => s !== null);
  } catch {
    return [];
  }
}

function clearQueueFile(): void {
  fs.writeFileSync(queueFilePath(), "", "utf8");
}

/**
 * Sends up to 200 signals per request (matches the server's own batch
 * cap — see app/api/admin/operating-brain/devices/ingest/route.ts), only
 * clears the local file on a confirmed 2xx. A network failure leaves
 * everything queued for the next attempt — this is the "offline buffer"
 * requirement: the companion works (keeps recording locally) with no
 * network, and catches up once connectivity returns.
 */
export async function flushQueue(): Promise<{ sent: number; remaining: number; error?: string }> {
  const config = loadConfig();
  if (!config.bearerToken) return { sent: 0, remaining: 0, error: "not paired" };

  const all = readQueued();
  if (all.length === 0) return { sent: 0, remaining: 0 };

  const batch = all.slice(0, 200);
  const rest = all.slice(200);

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/admin/operating-brain/devices/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.bearerToken}` },
      body: JSON.stringify({ signals: batch }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: 0, remaining: all.length, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
  } catch (err) {
    return { sent: 0, remaining: all.length, error: err instanceof Error ? err.message : String(err) };
  }

  if (rest.length === 0) {
    clearQueueFile();
  } else {
    fs.writeFileSync(queueFilePath(), rest.map((s) => JSON.stringify(s)).join("\n") + "\n", "utf8");
  }
  return { sent: batch.length, remaining: rest.length };
}

export function queueDepth(): number {
  return readQueued().length;
}
