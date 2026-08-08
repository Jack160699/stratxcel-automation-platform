// Run with: node --experimental-strip-types lib/whatsapp/__tests__/whatsapp-shadow-safety.test.ts
//
// Static safety checks for the verified-bot shadow/parity bridge. Does not
// re-test Phase B4's already-hardened outbound gates — this only adds the
// new legacy-source checks on top of them.
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
  // --- 1. Zero-send guarantee: unconditional, no migration-mode escape hatch ---
  const sendSource = readCode("packages", "whatsapp", "src", "outbound.ts");
  assert.ok(/binding\.source === "legacy_verified_bot"/.test(sendSource), "must block sends for the legacy-sourced binding");
  const bindingBlockIdx = sendSource.indexOf('binding.source === "legacy_verified_bot"');
  const adapterCallIdx = sendSource.indexOf("createWhatsAppAdapter(supabase)");
  assert.ok(bindingBlockIdx > -1 && adapterCallIdx > -1 && bindingBlockIdx < adapterCallIdx, "legacy-source block must run before the adapter is ever created");
  assert.equal(/getWhatsAppMigrationMode/.test(sendSource), false, "the send choke point must not read migration mode at all — the block must be unconditional, not toggled by it");
  assert.equal(/cutover/i.test(sendSource), false, "no code path in the choke point may special-case 'cutover' to unlock a send this task");

  // --- 2. Shadow ingestion never has the physical ability to send ---------
  for (const f of ["ingest.ts", "parity.ts", "backfill.ts"]) {
    const src = readCode("packages", "whatsapp", "src", "legacy-bridge", f);
    assert.equal(/sendOutboundWhatsAppMessage|createWhatsAppAdapter|sendTemplateMessage|adapter\.sendMessage/.test(src), false, `${f} must not import or call anything capable of sending`);
  }

  // --- 3. Ingestion route: authenticated, never trusts client tenant ------
  const routeSource = readCode("app", "api", "internal", "whatsapp", "legacy-shadow", "route.ts");
  assert.ok(/verifyLegacyShadowRequest\(/.test(routeSource), "route must verify signature/timestamp/nonce before doing anything else");
  assert.equal(/body\.tenantId|body\.tenant_id/.test(routeSource), false, "route must never read a tenant id from the request body");
  assert.equal(/body\.phoneBindingId/.test(routeSource), false, "route must never read a binding id from the request body");

  // --- 4. Binding never activated for real routing by the bridge itself ---
  const bindingSource = readCode("packages", "whatsapp", "src", "legacy-bridge", "binding.ts");
  assert.ok(/inbound_enabled:\s*false/.test(bindingSource) && /outbound_enabled:\s*false/.test(bindingSource), "legacy binding must always be created/updated with inbound/outbound disabled");

  // --- 5. Readiness never invents a default sample-size/mismatch threshold ---
  const readinessSource = readCode("packages", "whatsapp", "src", "legacy-bridge", "readiness.ts");
  assert.ok(/"not_configured"/.test(readinessSource), "unset thresholds must surface as not_configured, never silently defaulted");
  assert.equal(/=== true &&[\s\S]{0,40}=== true/.test(readinessSource) === true, true, "READY_FOR_REVIEW must require both thresholds to be explicitly true, not just present");

  // --- 6. Migration: additive only, hardened RPC, single-legacy-binding guard ---
  const migrationSource = read("supabase", "migrations", "20260808250000_whatsapp_shadow_parity.sql");
  assert.equal(/drop\s+table/i.test(migrationSource), false, "migration must not drop any table");
  assert.equal(migrationSource.includes("reconcile_and_fulfill_razorpay_payment_v4"), false, "must not touch the payment orchestrator");
  assert.equal(/create or replace function public\.record_whatsapp_message/.test(migrationSource), false, "must not redefine Phase B4's hardened message RPC");
  assert.ok(/create or replace function public\.ingest_legacy_whatsapp_shadow_event/.test(migrationSource), "ingest RPC must be defined");
  assert.ok(/revoke all on function public\.ingest_legacy_whatsapp_shadow_event[\s\S]{0,120}from public, anon, authenticated/.test(migrationSource), "ingest RPC must revoke public/anon/authenticated");
  assert.ok(/grant execute on function public\.ingest_legacy_whatsapp_shadow_event[\s\S]{0,120}to service_role/.test(migrationSource), "ingest RPC must be service_role-only");
  assert.ok(/set search_path = public, pg_temp/.test(migrationSource), "ingest RPC must set an explicit search_path");
  assert.ok(/whatsapp_phone_bindings_single_legacy_idx/.test(migrationSource), "at most one legacy_verified_bot binding must be DB-enforced");
  assert.ok(/whatsapp_shadow_events_source_idx/.test(migrationSource), "shadow-event idempotency must be a real unique index");
  assert.ok(/whatsapp_parity_records_tenant_legacy_idx/.test(migrationSource), "parity records must be deduped per legacy event, not just app-level best-effort");

  for (const table of ["whatsapp_shadow_events", "whatsapp_parity_records", "whatsapp_migration_imports"]) {
    assert.ok(new RegExp(`alter table ${table} enable row level security;`).test(migrationSource), `${table}: RLS must be enabled`);
  }

  console.log("whatsapp-shadow-safety.test.ts: ALL PASS");
}

run();
