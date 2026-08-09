import { activeWindow } from "get-windows";
import { loadConfig } from "./config.ts";
import { applyConsent, type RawWindowInfo } from "./consent.ts";
import { enqueue, flushQueue, queueDepth } from "./queue.ts";

const POLL_INTERVAL_MS = 10_000;
const FLUSH_INTERVAL_MS = 60_000;

interface OpenSession {
  appName: string;
  windowTitle: string | null;
  startedAt: number;
}

let openSession: OpenSession | null = null;
let stopped = false;

function closeSession() {
  if (!openSession) return;
  const durationSeconds = Math.round((Date.now() - openSession.startedAt) / 1000);
  if (durationSeconds >= 5) {
    // Sub-5-second focus flicks (alt-tab passthrough) aren't a meaningful "session" and are just noise.
    enqueue({
      type: "app_session",
      occurredAt: new Date(openSession.startedAt).toISOString(),
      appName: openSession.appName,
      windowTitle: openSession.windowTitle ?? undefined,
      durationSeconds,
    });
  }
  openSession = null;
}

async function pollOnce() {
  const config = loadConfig();
  if (config.paused) {
    if (openSession) closeSession();
    return;
  }

  const win = await activeWindow().catch(() => null);
  if (!win) {
    if (openSession) closeSession();
    return;
  }

  const raw: RawWindowInfo = { appName: win.owner?.name ?? "unknown", windowTitle: win.title ?? "" };
  const consented = applyConsent(raw, config.consent);
  if (!consented) {
    if (openSession) closeSession();
    return;
  }

  if (!openSession || openSession.appName !== consented.appName) {
    closeSession();
    openSession = { appName: consented.appName, windowTitle: consented.windowTitle, startedAt: Date.now() };
  }
}

/**
 * The required "visible collection indicator": this process only ever
 * runs in a foreground console window the owner started themselves (no
 * background service, no silent auto-start without the manual step
 * documented in README.md) — this line is the running proof it's active,
 * printed every poll so it can never silently keep collecting unnoticed.
 */
function printStatus() {
  const config = loadConfig();
  const state = config.paused ? "PAUSED" : openSession ? `tracking: ${openSession.appName}` : "tracking (no focused window)";
  process.stdout.write(`\r[owner-brain-companion] ${state} — queued: ${queueDepth()}          `);
}

export async function runTracker(): Promise<void> {
  const config = loadConfig();
  if (!config.bearerToken) {
    console.error("Not paired. Run `npm run pair` first.");
    process.exitCode = 1;
    return;
  }

  console.log("Owner Brain Companion started. This console window IS the collection indicator — closing it stops all tracking.");
  console.log(`Consent: collectActiveApp=${config.consent.collectActiveApp} collectWindowTitle=${config.consent.collectWindowTitle}`);
  console.log("Press Ctrl+C to stop.\n");

  process.on("SIGINT", () => {
    stopped = true;
    closeSession();
    console.log("\nStopping — flushing remaining queue…");
    flushQueue().finally(() => process.exit(0));
  });

  let lastFlush = 0;
  while (!stopped) {
    await pollOnce();
    printStatus();
    if (Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
      lastFlush = Date.now();
      const result = await flushQueue();
      if (result.error) process.stdout.write(`\n[sync error, will retry] ${result.error}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
