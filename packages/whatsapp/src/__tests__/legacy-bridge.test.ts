// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/legacy-bridge.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getWhatsAppMigrationMode } from "../legacy-bridge/mode.ts";
import { verifyLegacyShadowRequest } from "../legacy-bridge/auth.ts";
import { computeCutoverReadiness } from "../legacy-bridge/readiness.ts";
import { ingestLegacyShadowEvent } from "../legacy-bridge/ingest.ts";
import type { ServiceClient } from "../db.ts";
import type { LegacyShadowEventInput } from "../legacy-bridge/types.ts";

function testMode() {
  delete process.env.WHATSAPP_MIGRATION_MODE;
  assert.equal(getWhatsAppMigrationMode(), "shadow", "unset defaults to shadow");
  process.env.WHATSAPP_MIGRATION_MODE = "off";
  assert.equal(getWhatsAppMigrationMode(), "off");
  process.env.WHATSAPP_MIGRATION_MODE = "cutover";
  assert.equal(getWhatsAppMigrationMode(), "cutover");
  process.env.WHATSAPP_MIGRATION_MODE = "garbage";
  assert.equal(getWhatsAppMigrationMode(), "shadow", "invalid value falls back to safe default");
  delete process.env.WHATSAPP_MIGRATION_MODE;
  console.log("legacy-bridge mode.test: PASS");
}

function sign(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function testAuth() {
  delete process.env.WHATSAPP_LEGACY_SHADOW_SECRET;
  const bodyText = JSON.stringify({ a: 1 });
  const rawBody = Buffer.from(bodyText, "utf8");
  const now = Math.floor(Date.now() / 1000);

  // Unconfigured -> always rejected
  assert.equal(verifyLegacyShadowRequest({ rawBody, signatureHeader: sign("x", bodyText), timestamp: now, nonce: "nonce-aaaaaaaa" }).ok, false);

  process.env.WHATSAPP_LEGACY_SHADOW_SECRET = "test-secret";
  const good = verifyLegacyShadowRequest({ rawBody, signatureHeader: sign("test-secret", bodyText), timestamp: now, nonce: "nonce-bbbbbbbb" });
  assert.equal(good.ok, true, "valid signature/timestamp/fresh nonce must pass");

  // Replay of the exact same nonce must fail
  const replay = verifyLegacyShadowRequest({ rawBody, signatureHeader: sign("test-secret", bodyText), timestamp: now, nonce: "nonce-bbbbbbbb" });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "nonce_replayed");

  // Bad signature
  const bad = verifyLegacyShadowRequest({ rawBody, signatureHeader: sign("wrong-secret", bodyText), timestamp: now, nonce: "nonce-cccccccc" });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "signature_mismatch");

  // Stale timestamp
  const stale = verifyLegacyShadowRequest({
    rawBody,
    signatureHeader: sign("test-secret", bodyText),
    timestamp: now - 3600,
    nonce: "nonce-dddddddd",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "timestamp_out_of_window");

  delete process.env.WHATSAPP_LEGACY_SHADOW_SECRET;
  console.log("legacy-bridge auth.test: PASS");
}

function testReadiness() {
  delete process.env.WHATSAPP_CUTOVER_MIN_COMPARABLE_EVENTS;
  delete process.env.WHATSAPP_CUTOVER_MAX_MISMATCH_RATE;

  // No binding -> always NOT_READY regardless of anything else
  assert.equal(
    computeCutoverReadiness({ bindingConfigured: false, migrationMode: "shadow", comparableEventCount: 999999, mismatchCount: 0, workerHostAvailable: true, metaCredentialsConfigured: true }).readiness,
    "NOT_READY"
  );

  // mode off -> NOT_READY
  assert.equal(
    computeCutoverReadiness({ bindingConfigured: true, migrationMode: "off", comparableEventCount: 999999, mismatchCount: 0, workerHostAvailable: true, metaCredentialsConfigured: true }).readiness,
    "NOT_READY"
  );

  // Configured + shadow, but NO thresholds set -> can never reach READY_FOR_REVIEW no matter how good the numbers are
  const noThresholds = computeCutoverReadiness({
    bindingConfigured: true,
    migrationMode: "shadow",
    comparableEventCount: 1_000_000,
    mismatchCount: 0,
    workerHostAvailable: true,
    metaCredentialsConfigured: true,
  });
  assert.equal(noThresholds.readiness, "SHADOWING", "must never invent a default sample-size threshold");

  // Explicit thresholds set and met -> READY_FOR_REVIEW
  process.env.WHATSAPP_CUTOVER_MIN_COMPARABLE_EVENTS = "10";
  process.env.WHATSAPP_CUTOVER_MAX_MISMATCH_RATE = "0.1";
  const met = computeCutoverReadiness({
    bindingConfigured: true,
    migrationMode: "shadow",
    comparableEventCount: 50,
    mismatchCount: 1,
    workerHostAvailable: true,
    metaCredentialsConfigured: true,
  });
  assert.equal(met.readiness, "READY_FOR_REVIEW");

  // Same thresholds, but worker host still unavailable -> stays SHADOWING, never auto-READY
  const noWorker = computeCutoverReadiness({
    bindingConfigured: true,
    migrationMode: "shadow",
    comparableEventCount: 50,
    mismatchCount: 1,
    workerHostAvailable: false,
    metaCredentialsConfigured: true,
  });
  assert.equal(noWorker.readiness, "SHADOWING");

  delete process.env.WHATSAPP_CUTOVER_MIN_COMPARABLE_EVENTS;
  delete process.env.WHATSAPP_CUTOVER_MAX_MISMATCH_RATE;
  console.log("legacy-bridge readiness.test: PASS");
}

// --- Minimal fake Supabase client tailored to ingest.ts's exact call sequence ---
function fakeSupabase(opts: { binding: Record<string, unknown> | null; existingLead: Record<string, unknown> | null; rpcResult: Record<string, unknown> }) {
  const calls: { rpcArgs?: Record<string, unknown> } = {};
  const client = {
    from(table: string) {
      if (table === "whatsapp_phone_bindings") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.binding, error: null }) }) }) };
      }
      if (table === "crm_leads") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: opts.existingLead, error: null }) }) }) }) }),
          }),
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: "new-lead-id", tenant_id: (opts.binding as { tenant_id?: string } | null)?.tenant_id }, error: null }) }) }),
        };
      }
      if (table === "whatsapp_parity_records") {
        return { upsert: async () => ({ data: null, error: null }) };
      }
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "ingest_legacy_whatsapp_shadow_event");
      calls.rpcArgs = args;
      return { data: opts.rpcResult, error: null };
    },
  };
  return { client: client as unknown as ServiceClient, calls };
}

function baseEvent(overrides: Partial<LegacyShadowEventInput> = {}): LegacyShadowEventInput {
  return {
    event_id: "wamid.TEST123",
    event_type: "inbound_message",
    phone_number_id: "PHONE123",
    occurred_at: new Date().toISOString(),
    contact_phone: "+91 98765 43210",
    direction: "inbound",
    message_body: "hi",
    timestamp: Math.floor(Date.now() / 1000),
    nonce: "n",
    ...overrides,
  };
}

const binding = { id: "binding-1", tenant_id: "tenant-1", phone_number_id: "PHONE123", legacy_host: "bot.stratxcel.ai" };

async function testIngestPhoneMismatch() {
  process.env.WHATSAPP_MIGRATION_MODE = "shadow";
  const { client, calls } = fakeSupabase({ binding, existingLead: null, rpcResult: { success: true, shadow_event_id: "se-1" } });
  const outcome = await ingestLegacyShadowEvent(client, baseEvent({ phone_number_id: "SOME_OTHER_NUMBER" }));
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "phone_number_id_mismatch");
  assert.equal(calls.rpcArgs, undefined, "must never call the ingest RPC for an unmatched phone_number_id");
  console.log("legacy-bridge ingest.test (phone mismatch rejected): PASS");
}

async function testIngestModeOff() {
  process.env.WHATSAPP_MIGRATION_MODE = "off";
  const { client, calls } = fakeSupabase({ binding, existingLead: null, rpcResult: { success: true, shadow_event_id: "se-1" } });
  const outcome = await ingestLegacyShadowEvent(client, baseEvent());
  assert.equal(outcome.ok, true);
  assert.equal((outcome as { skipped: boolean }).skipped, true);
  assert.equal(calls.rpcArgs, undefined, "mode=off must never persist anything");
  delete process.env.WHATSAPP_MIGRATION_MODE;
  console.log("legacy-bridge ingest.test (mode off is a total no-op): PASS");
}

async function testIngestOwnerCommandIsolated() {
  process.env.WHATSAPP_MIGRATION_MODE = "shadow";
  const { client, calls } = fakeSupabase({ binding, existingLead: null, rpcResult: { success: true, shadow_event_id: "se-2" } });
  const outcome = await ingestLegacyShadowEvent(client, baseEvent({ is_owner_command: true, event_id: "wamid.OWNER1" }));
  assert.equal(outcome.ok, true);
  assert.equal(calls.rpcArgs?.p_lead_id, null, "owner command must never be attached to a lead");
  assert.equal(calls.rpcArgs?.p_mirror_message, false, "owner command must never be mirrored into the customer inbox");
  assert.equal(calls.rpcArgs?.p_event_type, "owner_command");
  console.log("legacy-bridge ingest.test (owner command isolated from CRM): PASS");
}

async function testIngestIdempotentReplay() {
  process.env.WHATSAPP_MIGRATION_MODE = "shadow";
  const { client } = fakeSupabase({ binding, existingLead: { id: "lead-x" }, rpcResult: { success: true, already_ingested: true, shadow_event_id: "se-3" } });
  const outcome = await ingestLegacyShadowEvent(client, baseEvent());
  assert.equal(outcome.ok, true);
  assert.equal((outcome as { alreadyIngested: boolean }).alreadyIngested, true);
  delete process.env.WHATSAPP_MIGRATION_MODE;
  console.log("legacy-bridge ingest.test (idempotent replay short-circuits): PASS");
}

async function main() {
  testMode();
  testAuth();
  testReadiness();
  await testIngestPhoneMismatch();
  await testIngestModeOff();
  await testIngestOwnerCommandIsolated();
  await testIngestIdempotentReplay();
  console.log("legacy-bridge.test.ts: ALL PASS");
}

main();
