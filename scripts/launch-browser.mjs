import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_PROFILE = process.env.USERPROFILE || "C:\\Users\\shriyansh chandrakar";
const PROFILE_DIR = path.join(USER_PROFILE, ".stratxcel-e2e-profile");

console.log("Preparing profile directory:", PROFILE_DIR);
try {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
} catch (e) {}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const args = [
  `--remote-debugging-port=9222`,
  `--user-data-dir=${PROFILE_DIR}`,
  "--new-window",
  "--start-maximized",
  "--no-first-run",
  "--no-default-browser-check",
  "https://www.stratxcel.in/login",
];

console.log("Launching visible Google Chrome with args:", args.join(" "));

const proc = spawn(CHROME_PATH, args, {
  detached: true,
  stdio: "ignore",
});
proc.unref();

console.log("Spawned Chrome with PID:", proc.pid);

async function checkPort() {
  for (let i = 1; i <= 20; i++) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get("http://127.0.0.1:9222/json/version", (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch {
              resolve(null);
            }
          });
        });
        req.on("error", () => resolve(null));
      });

      if (ok) {
        console.log(`✓ CDP Port 9222 active and responding! Browser: ${ok.Browser}`);
        return true;
      }
    } catch {}
  }
  return false;
}

const success = await checkPort();
if (!success) {
  console.error("Failed to connect to CDP port 9222 after launch.");
  process.exit(1);
} else {
  console.log("Ready for CDP Playwright connection!");
}
