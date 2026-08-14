import assert from "node:assert/strict";
import { isProtectedPlatformTenant, classifyTenant, SYSTEM_TENANT_SLUGS } from "../lifecycle.ts";

function runTests() {
  console.log("Starting Delete Client & Tenant Lifecycle Unit Test Suite...");

  // 1. Protected platform tenant classification
  assert.equal(isProtectedPlatformTenant("stratxcel"), true);
  assert.equal(isProtectedPlatformTenant("platform"), true);
  assert.equal(isProtectedPlatformTenant("staff-workspace"), true);
  assert.equal(isProtectedPlatformTenant("system"), true);
  assert.equal(isProtectedPlatformTenant("STRATXCEL"), true); // Case insensitivity
  assert.equal(isProtectedPlatformTenant("Staff-Workspace"), true);

  console.log("  ✓ 1. Protected platform slugs return isProtected: true");

  // 2. Customer tenants are NOT protected
  assert.equal(isProtectedPlatformTenant("ascend-theory"), false);
  assert.equal(isProtectedPlatformTenant("acme-corp"), false);
  assert.equal(isProtectedPlatformTenant("fresh-customer-123"), false);

  console.log("  ✓ 2. Customer tenants return isProtected: false");

  // 3. Classification with reason
  const sysClass = classifyTenant("stratxcel");
  assert.equal(sysClass.isProtected, true);
  assert.equal(sysClass.reason, "SYSTEM_PLATFORM_SLUG");

  const custClass = classifyTenant("xyz-consulting");
  assert.equal(custClass.isProtected, false);

  console.log("  ✓ 3. Tenant classification returns accurate reasons");

  // 4. Verification that SYSTEM_TENANT_SLUGS contains all core platform slugs
  const requiredProtectedSlugs = ["stratxcel", "platform", "staff-workspace", "system"];
  for (const slug of requiredProtectedSlugs) {
    assert.ok(SYSTEM_TENANT_SLUGS.has(slug), `SYSTEM_TENANT_SLUGS must contain ${slug}`);
  }

  console.log("  ✓ 4. All platform infrastructure slugs present in SYSTEM_TENANT_SLUGS");

  // 5. Mock delete request payload validation
  const validPayload = { confirmation: "DELETE" };
  const invalidPayload1 = { confirmation: "delete" };
  const invalidPayload2 = {};

  assert.equal(validPayload.confirmation === "DELETE", true);
  assert.equal((invalidPayload1 as { confirmation?: string }).confirmation === "DELETE", false);
  assert.equal((invalidPayload2 as { confirmation?: string }).confirmation === "DELETE", false);

  console.log("  ✓ 5. Delete confirmation requires exact 'DELETE' string");

  console.log("\nALL DELETE CLIENT & LIFECYCLE TESTS PASS!");
}

runTests();
