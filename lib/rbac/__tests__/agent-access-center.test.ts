import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

function run() {
  const team = read("app","api","admin","whatsapp-agent","team","route.ts");
  const status = read("app","api","admin","whatsapp-agent","status","route.ts");
  const access = read("packages","agent-core","src","principals","repository.ts");
  const migration = read("supabase","migrations","20260809120000_shared_agent_brain.sql");
  assert.match(team, /requirePlatformStaff\(user\.id, \["platform_owner"\]\)/, "only platform owner may manage team Agent access");
  assert.match(team, /platform_staff_users/, "managed identities must come from the legitimate platform staff roster");
  assert.doesNotMatch(team, /normalizedPhone\s*:\s*body/, "API must not accept arbitrary privileged phone bindings");
  assert.match(access, /requested\.filter\(\(permission\) => ceiling\.has\(permission\)/, "profile permissions must be intersected with role ceiling");
  assert.match(access, /Department is deliberately absent/, "department must grant no authority");
  assert.match(status, /getOwnWhatsAppPrincipalStatus/, "status must use caller-scoped privacy-safe phone lookup");
  assert.doesNotMatch(status, /WHATSAPP_TOKEN|SERVICE_ROLE_KEY|CHANNEL_SECRET|HMAC/, "status response must not expose secret fields");
  assert.equal((migration.match(/enable row level security/g) ?? []).length, 2);
  assert.match(migration, /revoke all on public\.platform_staff_agent_access from public, anon, authenticated/);
  console.log("agent-access-center.test.ts: ALL PASS");
}
run();
