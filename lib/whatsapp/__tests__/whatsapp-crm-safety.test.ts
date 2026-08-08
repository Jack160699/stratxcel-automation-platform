// Run with: node --experimental-strip-types lib/whatsapp/__tests__/whatsapp-crm-safety.test.ts
//
// Static safety checks on the outbound-send orchestrator and the additive
// migration. Does not re-test the payment webhook/RPC internals — those are
// unmodified by this task.
//
// The orchestrator itself now lives in packages/whatsapp/src/outbound.ts
// (moved there in hotfix/whatsapp-worker-auto-reply so both the dashboard
// send route and the standalone worker's automatic replies share the exact
// same choke point instead of maintaining two copies) — these checks were
// relocated to follow it, not weakened.
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
  // --- 1. Outbound sending: every gate is present, idempotency mandatory --
  const sendSource = readCode("packages", "whatsapp", "src", "outbound.ts");
  assert.ok(/idempotencyKey: string;/.test(sendSource), "idempotencyKey must be a required field, not optional");
  assert.ok(/isKillSwitchActive\(/.test(sendSource), "must check the kill switch before sending");
  assert.ok(/hasMarketingConsent\(/.test(sendSource), "must check consent before an outside-window send");
  assert.ok(/isTemplateUsable\(/.test(sendSource), "must verify a template is Meta-approved before using it");
  assert.ok(/automation_mode === "paused"/.test(sendSource) && /automation_mode === "handoff"/.test(sendSource), "must respect conversation automation mode");
  assert.equal(/status:\s*["']sent["']/.test(sendSource.split("mode === \"live\"")[0] ?? ""), false, "must never mark a message 'sent' before the adapter call actually returns 'live'");

  // --- 2. Duplicate registration/outbound: idempotency key/provider ID ----
  //        drives the RPC's own dedupe, not a client-trusted flag ----------
  assert.ok(/idempotencyKey: input\.idempotencyKey/.test(sendSource), "the caller-supplied idempotency key must reach the record RPC");

  // --- 3. process-inbound.ts: escalation and opt-out both persist real ----
  //        state, and escalation happens before a shadow reply is composed
  const processInboundSource = readCode("packages", "whatsapp", "src", "conversation", "process-inbound.ts");
  const escalationIdx = processInboundSource.indexOf("checkEscalation(");
  const composeIdx = processInboundSource.indexOf("composeProposedResponse(compiled)");
  assert.ok(escalationIdx > -1 && composeIdx > -1 && escalationIdx < composeIdx, "escalation must be checked before a shadow response is composed");
  assert.ok(/createHumanHandoff\(/.test(processInboundSource), "an escalation must create a real human handoff");
  assert.ok(/recordOptOut\(/.test(processInboundSource), "opt-out must persist real consent state, not just a pipeline status");

  // --- 4. Migration: hardened RPCs, RLS on every new table, additive only -
  const migrationSource = read("supabase", "migrations", "20260808240000_whatsapp_crm_completion.sql");
  assert.equal(/drop\s+table/i.test(migrationSource), false, "migration must not drop any table");
  assert.equal(migrationSource.includes("reconcile_and_fulfill_razorpay_payment_v4"), false, "must not touch the live payment orchestrator");

  for (const fn of ["record_whatsapp_message", "update_whatsapp_message_status"]) {
    assert.ok(new RegExp(`create or replace function public\\.${fn}`).test(migrationSource), `${fn} must be defined`);
    assert.ok(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,80}from public, anon, authenticated`).test(migrationSource), `${fn} must revoke public/anon/authenticated`);
    assert.ok(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,80}to service_role`).test(migrationSource), `${fn} must be service_role-only`);
  }
  assert.ok(/set search_path = public, pg_temp/.test(migrationSource), "new functions must set an explicit search_path");

  for (const table of ["contact_consent", "whatsapp_templates", "whatsapp_conversations", "whatsapp_messages", "crm_follow_ups", "crm_appointments"]) {
    assert.ok(new RegExp(`alter table ${table} enable row level security;`).test(migrationSource), `${table}: RLS must be enabled`);
    assert.ok(
      new RegExp(`create policy \\w+ on ${table} for select[\\s\\S]{0,300}tenant_members`).test(migrationSource),
      `${table}: must have a tenant-scoped select policy`
    );
  }

  // --- 5. Idempotency guarantees are DB-enforced, not just app-level ------
  assert.ok(/whatsapp_messages_tenant_provider_id_idx/.test(migrationSource), "inbound idempotency must be a real unique index");
  assert.ok(/whatsapp_messages_tenant_idempotency_idx/.test(migrationSource), "outbound idempotency must be a real unique index");
  assert.ok(/crm_leads_tenant_normalized_phone_idx/.test(migrationSource), "contact dedupe must be a real unique index, not just app-level best-effort");

  // --- 6. Status updates tolerate out-of-order delivery, never regress ----
  assert.ok(/v_rank_new <= v_rank_current/.test(migrationSource), "status updates must not regress a message to an earlier state on out-of-order webhooks");

  console.log("whatsapp-crm-safety.test.ts: ALL PASS");
}

run();
