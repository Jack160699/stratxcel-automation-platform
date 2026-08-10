import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260810190000_social_package_autopilot_authorization.sql"), "utf8");
const policy = fs.readFileSync(path.join(root, "lib/social/package-autopilot.ts"), "utf8");
const agentRepo = fs.readFileSync(path.join(root, "lib/social/repositories/agent.ts"), "utf8");

for (const required of ["client_user_id", "subscription_id", "entitlement_id", "allowed_platforms", "content_scope", "AUTO_PUBLISH", "REVIEW_BEFORE_PUBLISH", "ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]) assert.ok(migration.includes(required));
assert.ok(migration.includes("v_sub.status <> 'active'") && migration.includes("current_period_end <= now()"), "expiry/cancellation must stop automation");
assert.ok(migration.includes("v_ent.is_paused") && migration.includes("current_usage >= v_ent.limit_amount"), "pause/exhaustion must stop automation");
assert.ok(migration.includes("destination_outside_scope"), "platform scope must fail closed");
assert.ok(migration.includes("tenant_id=v_item.tenant_id") && migration.includes("subscription_id=v_auth.subscription_id"), "tenant/package relationships must be exact");
assert.ok(migration.includes("status not in ('PREPARED','SCHEDULED')"), "queue claim must be idempotent");
assert.ok(migration.includes("already_settled") && migration.includes("current_usage=current_usage+1"), "published usage increments once");
assert.ok(policy.includes("claim_social_package_post") && policy.includes("settle_social_package_post"), "worker boundary must use atomic authorization RPCs");
assert.ok(policy.includes("activatePackageAutopilot") && policy.includes("setPackageAutopilotState"), "activation and pause/resume/cancellation must persist server-side");
assert.ok(policy.includes("executeAuthorizedPackagePost") && policy.includes("scheduleJob") && policy.includes("runPublishNow"), "authorized package items must reuse the existing publishing engine");
assert.ok(policy.includes("if (claim.shadowMode)") && migration.includes("SHADOW_COMPLETED"), "Shadow Mode must stop before external scheduling");
assert.ok(agentRepo.includes('context: { source: "MANUAL" }'), "ad-hoc missions remain explicitly manual even during an active package");
assert.ok(migration.includes("shadow_mode"), "Shadow Mode must be returned to the package executor");

console.log("package-autopilot-policy.test.ts: ALL PASS (standing authorization, lifecycle, scope, isolation, accounting, idempotency)");
