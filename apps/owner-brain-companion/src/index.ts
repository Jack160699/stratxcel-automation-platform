import { loadConfig, saveConfig, clearPairing } from "./config.ts";
import { runPair } from "./pair.ts";
import { runTracker } from "./tracker.ts";
import { runRemember } from "./remember.ts";
import { queueDepth } from "./queue.ts";

const [, , command, ...rest] = process.argv;

async function main() {
  switch (command) {
    case "pair":
      await runPair();
      break;
    case "start":
      await runTracker();
      break;
    case "remember":
      await runRemember(rest.join(" ") || undefined);
      break;
    case "pause": {
      const config = loadConfig();
      config.paused = true;
      saveConfig(config);
      console.log("Paused. Collection stops immediately; the running `start` process (if any) picks this up on its next poll.");
      break;
    }
    case "resume": {
      const config = loadConfig();
      config.paused = false;
      saveConfig(config);
      console.log("Resumed.");
      break;
    }
    case "unpair":
      clearPairing();
      console.log("Local pairing cleared. Also revoke this device from the admin UI's Privacy Control Center — clearing it here alone does not invalidate the server-side token.");
      break;
    case "status": {
      const config = loadConfig();
      console.log(`Paired: ${Boolean(config.bearerToken)}`);
      console.log(`Paused: ${config.paused}`);
      console.log(`Consent: collectActiveApp=${config.consent.collectActiveApp} collectWindowTitle=${config.consent.collectWindowTitle}`);
      console.log(`Queued signals not yet synced: ${queueDepth()}`);
      break;
    }
    default:
      console.log(
        [
          "Owner Brain Companion — usage:",
          "  npm run pair       Pair this device (needs a deviceId + one-time code from the admin UI)",
          "  npm start          Start tracking (foreground — the open console IS the collection indicator)",
          "  npm run pause      Pause collection without unpairing",
          "  npm run resume     Resume collection",
          "  npm run remember -- \"text\"   Save a manual note immediately",
          "  npm run status     Show pairing/consent/queue state",
          "  npm run unpair     Clear local pairing (also revoke server-side from the admin UI)",
        ].join("\n")
      );
  }
}

main();
