import { runSSM } from "file:///C:/Users/shriyansh chandrakar/.gemini/antigravity-ide/brain/084fe9fe-34cc-47a8-94bd-f5f965c413b4/scratch/ssm-helper.mjs";
import fs from "node:fs";

console.log("Retrieving production Meta and Social keys from EC2...");
const inv = runSSM([
  "grep -h -E '^(SOCIAL_TOKEN_ENCRYPTION_KEY|META_APP_ID|META_APP_SECRET|META_INSTAGRAM_APP_ID|META_INSTAGRAM_APP_SECRET|META_THREADS_APP_ID|META_THREADS_APP_SECRET|META_WEBHOOK_VERIFY_TOKEN|SOCIAL_OAUTH_STATE_SECRET)=' /opt/stratxcel-automation-platform/.env.* | sort -u || true",
]);

const lines = inv.StandardOutputContent.split("\n");
let envLocal = fs.readFileSync(".env.local", "utf8");

for (const line of lines) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  const key = match[1];
  const value = match[2].trim().replace(/^['"]|['"]$/g, "");
  if (!value || value === "[SENSITIVE]") continue;

  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(envLocal)) {
    envLocal = envLocal.replace(regex, `${key}="${value}"`);
  } else {
    envLocal += `\n${key}="${value}"`;
  }
  console.log(`Updated key in .env.local: ${key} (len ${value.length})`);
}

fs.writeFileSync(".env.local", envLocal, "utf8");
console.log("Successfully synchronized Meta keys to .env.local!");
