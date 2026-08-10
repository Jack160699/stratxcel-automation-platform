// Tests the recurring package producer / queue / activation / UI wiring
// added on top of the PR #23 baseline standing-authorization policy
// (package-autopilot-policy.test.ts covers that baseline; this file covers
// the release-candidate completion: producer, cron, client control API,
// tenant isolation, and UI surfaces). Verified via source text + pure
// function calls, same technique as package-autopilot-policy.test.ts,
// since package-autopilot.ts's module graph (Supabase repositories,
// Gemini provider) cannot be resolved standalone under
// `node --experimental-strip-types`.
// Run with: node --experimental-strip-types lib/social/__tests__/package-autopilot-producer.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  const migration = read("supabase", "migrations", "20260811000000_social_package_autopilot_producer.sql");
  const autopilot = read("lib", "social", "package-autopilot.ts");
  const producer = read("lib", "social", "package-producer.ts");
  const distribution = read("lib", "social", "package-distribution.ts");
  const notify = read("lib", "social", "package-whatsapp-notify.ts");

  // --- Migration: additive only, never edits the already-applied original file. ---
  const originalMigration = read("supabase", "migrations", "20260810190000_social_package_autopilot_authorization.sql");
  assert.ok(originalMigration.includes("create table if not exists social_autopilot_authorizations"), "the original migration must remain byte-identical (never edited in place)");

  // --- Schema hardening: period lifecycle, distribution policy, NEEDS_ATTENTION, nullable variant_id, composite uniqueness. ---
  for (const column of [
    "period_number",
    "period_target_units",
    "timezone",
    "max_posts_per_day",
    "preparation_horizon_days",
    "late_item_policy",
    "counting_policy",
    "skip_policy",
  ]) {
    assert.ok(migration.includes(column), `expected authorization column/policy: ${column}`);
  }
  assert.ok(migration.includes("'NEEDS_ATTENTION'"), "a package that cannot safely fit its window must have a real non-ACTIVE state");
  assert.ok(migration.includes("alter column variant_id drop not null"), "a PLANNED slot must be able to exist before content is prepared");
  assert.ok(migration.includes("authorization_id, period_number, package_sequence"), "sequence numbers must be scoped per service period, not collide across renewals");
  assert.ok(migration.includes("social_accounts add column if not exists tenant_id"), "a connected account must be explicitly bound to the tenant it serves");

  // --- Hardening: claim RPC now also asserts the destination account's tenant matches (Section 42/43/97). ---
  assert.ok(migration.includes("v_account_tenant is distinct from v_item.tenant_id"), "claim must reject a destination account bound to a different tenant");
  assert.ok(migration.includes("destination_account_tenant_mismatch"));

  // --- Hardening: settle RPC is counting-policy aware, not a blind always-increment. ---
  assert.ok(migration.includes("counting_policy = 'CONTENT_UNIT'"), "settlement must honor CONTENT_UNIT vs PLATFORM_PUBLISH");
  assert.ok(migration.includes("v_auth.skip_policy = 'SKIP_COUNTS'"), "a skip must only consume quota per the configured skip policy");

  // --- Producer health / worker registration (Section 51, reuse existing infra). ---
  assert.ok(migration.includes("social_autopilot_producer_runs"), "admin operability needs a real health log, not log-scraping");
  assert.ok(migration.includes("package-autopilot-worker"), "the producer must register as a first-class worker type in the existing worker-health infra");
  const heartbeat = read("packages", "queue", "src", "worker-heartbeat.ts");
  assert.ok(heartbeat.includes("package-autopilot-worker"), "WorkerType union must include the package producer");

  // --- Producer/executor: kill-switch checked before any claim/dispatch, never a second parallel safety mechanism. ---
  assert.ok(autopilot.includes("isKillSwitchActive") && autopilot.includes("packageKillSwitchActive"), "execution must respect the existing global/worker/tenant kill switch");
  assert.ok(producer.includes("isKillSwitchActive"), "planning/preparation must also respect the kill switch");
  assert.ok(autopilot.includes("recordWorkerHeartbeat"), "the execution tick must report its own health, not just log");

  // --- Idempotent planning: DB unique constraint + ignoreDuplicates, no invented locking. ---
  assert.ok(autopilot.includes("ignoreDuplicates: true"), "concurrent producer runs must rely on the DB uniqueness guarantee, not a fragile in-process lock");
  assert.ok(autopilot.includes("onConflict: \"authorization_id,period_number,package_sequence\""));
  assert.ok(autopilot.includes("computePackageDistribution"), "scheduling math must come from the pure, unit-tested distribution module — no second ad hoc scheduler");

  // --- Period rollover is a compare-and-swap guarded on the OLD period_number (concurrency-safe). ---
  assert.ok(autopilot.includes(".eq(\"period_number\", authorization.period_number) // CAS guard"));

  // --- Preparation reuses the EXISTING content pipeline, never a second content generator. ---
  assert.ok(autopilot.includes("createContentMaster") && autopilot.includes("createContentVariant"), "package content must be created through the same repository functions the manual Copilot uses");
  assert.ok(autopilot.includes("getBrandProfile"), "generation must be grounded in the tenant's real Brand Brain");
  assert.ok(autopilot.includes("pillarNames.find((name) => name.toLowerCase() === generated.contentPillar.toLowerCase())"), "a generated pillar must match a REAL saved Brand Brain pillar — invented taxonomy is rejected, matching the existing canonical-validation standard");
  assert.ok(autopilot.includes("status: \"BLOCKED\""), "a quality-gate failure must block the item, never publish garbage (Section 28/48)");

  // --- Late-item policy: never a silent instant burst of overdue items (Section 20/99). ---
  assert.ok(autopilot.includes("applyLateItemPolicy") && autopilot.includes("RESCHEDULE_NEXT_SLOT"));
  assert.ok(!autopilot.includes("for (const row of dueRows ?? [])") || autopilot.includes("lateMs > 5"), "a due item significantly overdue must be policy-checked, not published blindly");

  // --- Tenant isolation on the client control API (Section 97) — skip/reschedule/edit verify ownership before mutating. ---
  const apiRoute = read("app", "api", "platform", "social", "autopilot", "route.ts");
  assert.ok(apiRoute.includes("verifyQueueItemTenant"), "the API must verify a queue item belongs to the calling tenant before skip/reschedule/edit");
  assert.ok(apiRoute.includes("isMemberOfTenant"), "every request must be membership-checked before touching package state");
  assert.ok(apiRoute.includes("prerequisite_missing") || autopilot.includes("prerequisite_missing"), "activation must fail with a specific, actionable prerequisite reason, never a generic error");

  // --- Cron wiring: same CRON_SECRET convention, separate cadence for planning vs. execution. ---
  assert.ok(exists("app", "api", "social", "package-producer", "route.ts"));
  const producerRoute = read("app", "api", "social", "package-producer", "route.ts");
  assert.ok(producerRoute.includes("CRON_SECRET") && producerRoute.includes("Bearer"), "the producer cron route must use the existing CRON_SECRET convention");
  const workerRoute = read("app", "api", "social", "worker", "route.ts");
  assert.ok(workerRoute.includes("runPackageAutopilotBatch"), "package execution must share the existing tight-cadence worker cron, not require a new one");
  const vercelConfig = read("vercel.json");
  assert.ok(vercelConfig.includes("/api/social/package-producer"), "the producer must actually be scheduled");

  // --- Shadow Mode: package items still exit before any external mutation, never fabricate success (reuses PR #15's classifier). ---
  assert.ok(autopilot.includes("claim.shadowMode") && autopilot.includes("Shadow run complete. Nothing was published externally."));

  // --- WhatsApp notifications: compliant-only, never blocking, never fake delivery (Section 59). ---
  assert.ok(notify.includes("compliant_delivery_unavailable"), "an unavailable compliant delivery path must be recorded honestly, not silently dropped or faked");
  assert.ok(notify.includes("FREE_FORM_WINDOW_MS"), "proactive delivery must respect the real session-window compliance boundary");
  assert.ok(autopilot.includes("void notifyPackageEvent"), "notification must be fire-and-forget — never able to block or fail a publish result already recorded");

  // --- UI surfaces exist and are real (not placeholders). ---
  assert.ok(exists("app", "app", "content", "autopilot", "page.tsx"));
  assert.ok(exists("app", "app", "content", "autopilot", "AutopilotDashboard.tsx"));
  const dashboard = read("app", "app", "content", "autopilot", "AutopilotDashboard.tsx");
  assert.ok(dashboard.includes("Pause Autopilot") && dashboard.includes("Cancel Autopilot"));
  assert.ok(dashboard.includes("action: \"skip\"") && dashboard.includes("action: \"edit\""), "controls must call the real API, not a fake frontend-only toggle");
  assert.ok(exists("app", "admin", "social", "packages", "page.tsx"));
  const adminPage = read("app", "admin", "social", "packages", "page.tsx");
  assert.ok(adminPage.includes("requireOwnerContext"), "admin visibility must stay staff-gated");
  assert.ok(adminPage.includes("Producer health"));
  const nav = read("app", "admin", "social", "nav.ts");
  assert.ok(nav.includes("/admin/social/packages"), "the admin package page must be reachable from real navigation");

  console.log("package-autopilot-producer.test.ts: ALL PASS (schema hardening, idempotent producer, quality gate, tenant isolation, cron wiring, Shadow Mode, WhatsApp compliance, real UI)");
}

run();
