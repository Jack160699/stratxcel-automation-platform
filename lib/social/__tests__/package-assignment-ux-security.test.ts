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

  console.log("package-assignment-ux-security.test.ts: ALL PASS");
}

run();
