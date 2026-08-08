// Run with: node --experimental-strip-types lib/whatsapp/__tests__/whatsapp-cutover-safety.test.ts
//
// Static safety checks for the "widen phone-binding source" prep migration.
// This task did not perform an actual Meta webhook cutover (blocked — see
// final report / Notion) — these checks only cover what WAS shipped:
// schema readiness so a *future*, owner-approved cutover isn't silently
// blocked by the shadow-only zero-send guarantee, without weakening that
// guarantee for the still-shadow-only binding.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const readCode = (...parts: string[]) =>
  fs
    .readFileSync(path.join(root, ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const migrationSource = read("supabase", "migrations", "20260808260000_whatsapp_migrated_bot_source.sql");
  assert.equal(/drop\s+table/i.test(migrationSource), false, "migration must not drop any table");
  assert.equal(/drop\s+column/i.test(migrationSource), false, "migration must not drop any column");
  assert.ok(migrationSource.includes("'native', 'legacy_verified_bot', 'migrated_verified_bot'"), "source constraint must be widened, not replaced with a narrower set");
  assert.ok(/whatsapp_phone_bindings_single_migrated_idx/.test(migrationSource), "at most one migrated_verified_bot binding must be DB-enforced");

  const sendSource = readCode("packages", "whatsapp", "src", "outbound.ts");
  assert.ok(/binding\.source === "legacy_verified_bot"/.test(sendSource), "the shadow-only block must remain exact and unconditional");
  assert.equal(/binding\.source === "migrated_verified_bot"/.test(sendSource), false, "a migrated (cutover) binding must NOT be specially blocked — it goes through the normal gates only");
  assert.equal(/getWhatsAppMigrationMode/.test(sendSource), false, "the choke point still must not branch on migration mode");

  const typesSource = readCode("packages", "whatsapp", "src", "phone-bindings", "types.ts");
  assert.ok(/"native"\s*\|\s*"legacy_verified_bot"\s*\|\s*"migrated_verified_bot"/.test(typesSource), "PhoneBindingSource must include all three values");

  console.log("whatsapp-cutover-safety.test.ts: ALL PASS");
}

run();
