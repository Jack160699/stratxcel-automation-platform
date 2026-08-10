import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260811030000_social_package_autopilot_live_db_hardening.sql"),
  "utf8"
);

function run() {
  // Obsolete two-column uniqueness must be dropped
  assert.ok(
    migration.includes("social_autopilot_queue_items_authorization_id_package_seque_key"),
    "must drop obsolete authorization_id+package_sequence constraint"
  );
  assert.ok(
    migration.includes("UNIQUE (authorization_id, package_sequence)"),
    "must scan for obsolete two-column unique definition"
  );

  // Period-aware uniqueness preserved
  assert.ok(
    migration.includes("social_autopilot_queue_items_period_sequence_key"),
    "must preserve period-aware unique index"
  );
  assert.ok(
    migration.includes("(authorization_id, period_number, package_sequence)"),
    "period index must include period_number"
  );

  // Covering indexes for FK hot-paths
  for (const index of [
    "social_autopilot_authorizations_brand_profile_id_idx",
    "social_autopilot_authorizations_entitlement_id_idx",
    "social_autopilot_authorizations_subscription_id_idx",
    "social_autopilot_queue_items_account_id_idx",
    "social_autopilot_queue_items_content_master_id_idx",
    "social_autopilot_queue_items_publishing_job_id_idx",
    "social_autopilot_queue_items_tenant_id_idx",
    "social_autopilot_queue_items_variant_id_idx",
  ]) {
    assert.ok(migration.includes(index), `missing index ${index}`);
  }

  assert.ok(migration.includes("create index if not exists"), "indexes must be idempotent");

  console.log("package-autopilot-live-db-hardening.test.ts: ALL PASS");
}

run();
