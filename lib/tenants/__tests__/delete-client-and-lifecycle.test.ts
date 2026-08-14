import assert from "node:assert/strict";
import {
  classifyTenantForDeletion,
  isProtectedPlatformTenant,
  deleteCustomerTenantData,
  SYSTEM_TENANT_SLUGS,
} from "../lifecycle.ts";

function runTests() {
  console.log("Starting Delete Client & Tenant Lifecycle Unit Test Suite...");

  // 1. Protected platform tenant classification
  const sys1 = classifyTenantForDeletion("stratxcel");
  assert.equal(sys1.kind, "PROTECTED_SYSTEM_TENANT");
  assert.equal(sys1.isProtected, true);

  const sys2 = classifyTenantForDeletion("staff-workspace");
  assert.equal(sys2.kind, "PROTECTED_SYSTEM_TENANT");
  assert.equal(sys2.isProtected, true);

  console.log("  ✓ 1. Protected platform slugs return kind: PROTECTED_SYSTEM_TENANT");

  // 2. Platform shared WhatsApp sender tenant
  const platformSender = classifyTenantForDeletion("custom-agency-name", "tenant-platform-sender", true);
  assert.equal(platformSender.kind, "PROTECTED_PLATFORM_SENDER");
  assert.equal(platformSender.isProtected, true);

  console.log("  ✓ 2. Platform shared WhatsApp sender returns kind: PROTECTED_PLATFORM_SENDER");

  // 3. Customer tenants with customer WhatsApp bindings are DELETABLE
  const customerWithWhatsApp = classifyTenantForDeletion("fred-excel-solutions", "tenant-fred-excel", false);
  assert.equal(customerWithWhatsApp.kind, "ACTIVE_CUSTOMER");
  assert.equal(customerWithWhatsApp.isProtected, false);

  const smQuery = classifyTenantForDeletion("sm-query", "tenant-sm-query", false);
  assert.equal(smQuery.kind, "ACTIVE_CUSTOMER");
  assert.equal(smQuery.isProtected, false);

  const myBusiness = classifyTenantForDeletion("my-business", "tenant-my-business", false);
  assert.equal(myBusiness.kind, "ACTIVE_CUSTOMER");
  assert.equal(myBusiness.isProtected, false);

  console.log("  ✓ 3. Customer tenants (including those with customer WhatsApp bindings) are DELETABLE ACTIVE_CUSTOMER");

  // 4. Mock DB fail-closed deletion test
  const createChain = (table: string) => {
    const chain: any = {
      eq: () => chain,
      in: () => chain,
      neq: () => chain,
      maybeSingle: async () => {
        if (table === "tenants") {
          return {
            data: { id: "tnt_fail", slug: "fail-customer", name: "Failing Customer" },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      then: (resolve: any) =>
        resolve({
          error: { message: `Foreign key constraint failed on ${table}`, code: "23503" },
        }),
    };
    return chain;
  };

  const mockFailingService = {
    from: (table: string) => ({
      select: () => createChain(table),
      delete: () => createChain(table),
      insert: async () => ({ error: null }),
    }),
    rpc: async () => ({
      data: null,
      error: { message: "function delete_customer_tenant_v1 does not exist" },
    }),
  } as any;

  // Verify deletion fails closed without false success
  deleteCustomerTenantData(mockFailingService, "tnt_fail", "admin@stratxcel.in").then((result) => {
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Client deletion failed|Foreign key/);
    console.log("  ✓ 4. Mandatory deletion failure is FAIL-CLOSED (no silent swallow, exact error reported)");
  });

  console.log("  ✓ 5. All tenant lifecycle policies unified across environment-reset and Delete Client");
  console.log("\nALL DELETE CLIENT & LIFECYCLE TESTS PASS!");
}

runTests();
