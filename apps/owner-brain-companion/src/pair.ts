import readline from "node:readline/promises";
import { loadConfig, saveConfig } from "./config.ts";

/**
 * Pairing is device-initiated but owner-authorized: the owner creates a
 * pending device + one-time pairing code from the admin UI's Privacy
 * Control Center (createPendingDeviceAction), then types the deviceId +
 * code here. The server never accepts a pairing request it didn't
 * originate — see completeDevicePairing's PENDING_PAIRING status check.
 */
export async function runPair(): Promise<void> {
  const config = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("Pair this device with your Stratxcel Operating Brain.");
  console.log(`API base URL: ${config.apiBaseUrl} (set OWNER_BRAIN_API_BASE_URL to change)`);
  const deviceId = (await rl.question("deviceId (from the admin UI): ")).trim();
  const pairingCode = (await rl.question("one-time pairing code: ")).trim();
  rl.close();

  const res = await fetch(`${config.apiBaseUrl}/api/admin/operating-brain/devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, pairingCode }),
  });
  const body = (await res.json().catch(() => ({}))) as { bearerToken?: string; error?: string };

  if (!res.ok || !body.bearerToken) {
    console.error(`Pairing failed: ${body.error ?? `HTTP ${res.status}`}`);
    process.exitCode = 1;
    return;
  }

  config.deviceId = deviceId;
  config.bearerToken = body.bearerToken;
  saveConfig(config);
  console.log("Paired. Run `npm start` to begin tracking (visible in this console at all times).");
}
