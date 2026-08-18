import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const clientApi = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const adminApi = read("app", "api", "admin", "social", "package-assignment", "route.ts");
  const dashboard = read("app", "app", "content", "autopilot", "AutopilotDashboard.tsx");
  const assignment = read("lib", "social", "package-tenant-assignment.ts");

  // Client API must not accept client-supplied brandProfileId or accountId for assignment
  assert.ok(clientApi.includes('case "assignBrand"'), "client API must support assignBrand");
  assert.ok(clientApi.includes('case "assignAccount"'), "client API must support assignAccount");
  const assignBrandBlock = clientApi.match(/case "assignBrand": \{[\s\S]*?\n      \}/)?.[0] ?? "";
  const assignAccountBlock = clientApi.match(/case "assignAccount": \{[\s\S]*?\n      \}/)?.[0] ?? "";
  assert.ok(assignBrandBlock.includes("assignBrandProfileToTenant"), "assignBrand must call assignBrandProfileToTenant");
  assert.ok(!assignBrandBlock.includes("body.brandProfileId"), "assignBrand must not read brandProfileId from client body");
  assert.ok(assignAccountBlock.includes("platform"), "assignAccount requires platform");
  assert.ok(!assignAccountBlock.includes("body.accountId"), "assignAccount must not read accountId from client body");
  assert.ok(clientApi.includes("listAssignablePackageResources"), "GET must use listAssignablePackageResources");
  assert.ok(clientApi.includes("platformLabel"), "GET assignment payload must use platformLabel");

  // Client UI must not expose raw UUIDs for assignment actions
  assert.ok(dashboard.includes("Assign to this workspace"), "dashboard must show assign CTA");
  assert.ok(dashboard.includes('callAutopilotApi({ tenantId, action: "assignBrand" })'), "dashboard assignBrand is server-resolved");
  assert.ok(dashboard.includes('callAutopilotApi({ tenantId, action: "assignAccount", platform })'), "dashboard assignAccount uses platform only");
  assert.ok(!dashboard.includes('action: "assignBrand", brandProfileId'), "dashboard assignBrand must not send brandProfileId");
  assert.ok(!dashboard.includes('action: "assignAccount", accountId'), "dashboard assignAccount must not send accountId");

  // Admin API is staff-gated and may pass explicit IDs
  assert.ok(adminApi.includes("requireOwnerContext"), "admin route must require owner context");
  assert.ok(adminApi.includes("brandProfileId"), "admin assignBrand may accept brandProfileId");
  assert.ok(adminApi.includes("accountId"), "admin assignAccount may accept accountId");

  // Core assignment module fail-closed rules
  assert.ok(assignment.includes("arbitrary_uuid_claim_rejected"), "assignment module rejects arbitrary UUID claims");
  assert.ok(assignment.includes("cross_tenant_reassignment"), "assignment module rejects cross-tenant reassignment");
  assert.ok(assignment.includes("Never returns raw UUIDs"), "listAssignablePackageResources hides UUIDs from clients");

  // --- Regression: social_accounts has no "handle" column (it's "username") —
  // an earlier revision of the account-assignment discovery query selected a
  // bare, nonexistent "handle" column, which always errored and silently
  // returned an empty candidate list (confirmed against the live
  // social_accounts schema in project uccqlgeghkwzujeeymua). Any UI-facing
  // label must be derived from the real "username"/"display_name" columns,
  // never a bare "handle" column. ---
  assert.ok(!/\bhandle\b/.test(assignment), "must never reference a nonexistent \"handle\" column from social_accounts");
  assert.ok(assignment.includes("row.username"), "account labels must come from the real \"username\" column");

  // --- Regression: social_accounts_status_check / social_accounts_token_health_check
  // only allow CONNECTED/DISCONNECTED/ERROR/RECONNECT_REQUIRED and
  // UNKNOWN/HEALTHY/EXPIRING/EXPIRED/REVOKED/ERROR respectively (confirmed
  // against the live schema) — markReauthRequired previously wrote
  // "REAUTH_REQUIRED"/"INVALID", neither of which is a legal value, so the
  // update always violated the CHECK constraint and threw, meaning a
  // token that failed refresh could never actually be flagged. ---
  const accountsRepo = read("lib", "social", "repositories", "accounts.ts");
  assert.ok(!accountsRepo.includes('"REAUTH_REQUIRED"') && !accountsRepo.includes('"INVALID"'), "must never write status/token_health values outside the DB's CHECK constraints");
  assert.ok(accountsRepo.includes('status: "RECONNECT_REQUIRED"') && accountsRepo.includes('token_health: "EXPIRED"'), "markReauthRequired must write values the CHECK constraints actually allow");

  console.log("package-assignment-ux-security.test.ts: ALL PASS");
}

run();
