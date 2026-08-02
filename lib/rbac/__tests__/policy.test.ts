// Run with: node --experimental-strip-types lib/rbac/__tests__/policy.test.ts
import assert from "node:assert/strict";
import { can, requirePermission, PermissionDeniedError } from "../policy.ts";

function run() {
  // Owner can do everything an admin can, plus tenant member management
  assert.equal(can("owner", "tenant:manage_members"), true);
  assert.equal(can("admin", "tenant:manage_members"), false);
  assert.equal(can("admin", "wallet:spend"), true);

  // Operator: can run missions but not decide approvals or manage the wallet balance beyond viewing
  assert.equal(can("operator", "mission:create"), true);
  assert.equal(can("operator", "approval:decide"), false);
  assert.equal(can("operator", "wallet:topup"), false);
  assert.equal(can("operator", "wallet:view"), true);

  // Viewer: read-only
  assert.equal(can("viewer", "mission:create"), false);
  assert.equal(can("viewer", "brand_brain:view"), true);
  assert.equal(can("viewer", "brand_brain:edit"), false);

  assert.throws(() => requirePermission("viewer", "mission:create"), PermissionDeniedError);
  assert.doesNotThrow(() => requirePermission("owner", "mission:create"));

  console.log("policy.test.ts: ALL PASS");
}

run();
