import assert from "node:assert/strict";
import {
  classifyTenantForDeletion,
  isProtectedPlatformTenant,
  deleteCustomerTenantData,
  SYSTEM_TENANT_SLUGS,
} from "../lifecycle.ts";

async function runTests() {
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
      update: () => createChain(table),
      insert: async () => ({ error: null }),
    }),
    rpc: async () => ({
      data: null,
      error: { message: "function delete_customer_tenant_v1 does not exist" },
    }),
  } as any;

  // Verify deletion fails closed without false success
  const failResult = await deleteCustomerTenantData(mockFailingService, "tnt_fail", "admin@stratxcel.in");
  assert.equal(failResult.ok, false);
  assert.match(failResult.error ?? "", /Client deletion failed|Foreign key/);
  console.log("  ✓ 4. Mandatory deletion failure is FAIL-CLOSED (no silent swallow, exact error reported)");

  // 5. Mock schema cache missing RPC falling back to successful client cascade with promo_redemptions & audit_orders
  const tablesDeleted: string[] = [];
  const tablesUpdated: string[] = [];

  const createSuccessChain = (table: string) => {
    const chain: any = {
      eq: () => chain,
      in: () => chain,
      neq: () => chain,
      maybeSingle: async () => {
        if (table === "tenants") {
          return {
            data: { id: "tnt_success", slug: "ascend-theory", name: "Ascend Theory" },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      then: (resolve: any) => {
        tablesDeleted.push(table);
        return resolve({ data: [], error: null });
      },
    };
    return chain;
  };

  const mockSchemaCacheService = {
    from: (table: string) => ({
      select: () => createSuccessChain(table),
      delete: () => createSuccessChain(table),
      update: () => {
        tablesUpdated.push(table);
        return createSuccessChain(table);
      },
      insert: async () => ({ error: null }),
    }),
    rpc: async () => ({
      data: null,
      error: { message: "Could not find the function public.delete_customer_tenant_v1(p_actor, p_tenant_id) in the schema cache." },
    }),
  } as any;

  const successResult = await deleteCustomerTenantData(mockSchemaCacheService, "tnt_success", "admin@stratxcel.in");
  assert.equal(successResult.ok, true);
  assert.equal(successResult.deletedTenantId, "tnt_success");
  assert.ok(tablesUpdated.includes("audit_orders"), "audit_orders promo_redemption_id must be nullified first");
  assert.ok(tablesDeleted.includes("promo_redemptions"), "promo_redemptions must be deleted");
  assert.ok(tablesDeleted.includes("audit_orders"), "audit_orders must be deleted");
  assert.ok(tablesDeleted.includes("tenants"), "tenants must be deleted");
  console.log("  ✓ 5. Schema cache RPC fallback executes fail-closed cascade with promo_redemptions & audit_orders cleanly");

  // 6. Direct RPC success path verification
  const mockRpcSuccessService = {
    from: (table: string) => ({
      select: () => createSuccessChain(table),
    }),
    rpc: async (fn: string) => {
      if (fn === "delete_customer_tenant_v1") {
        return {
          data: { ok: true, deleted_tenant_id: "tnt_rpc_success", slug: "rpc-customer" },
          error: null,
        };
      }
      return { data: null, error: { message: "Unknown RPC" } };
    },
  } as any;

  const rpcResult = await deleteCustomerTenantData(mockRpcSuccessService, "tnt_rpc_success", "admin@stratxcel.in");
  assert.equal(rpcResult.ok, true);
  assert.equal(rpcResult.deletedTenantId, "tnt_rpc_success");
  console.log("  ✓ 6. Direct delete_customer_tenant_v1 RPC execution succeeds atomically");

  // 7. Protected platform workspace rejection before DB execution
  const createProtectedChain = (table: string) => {
    const chain: any = {
      eq: () => chain,
      in: () => chain,
      neq: () => chain,
      maybeSingle: async () => {
        if (table === "tenants") {
          return {
            data: { id: "tnt_stratxcel", slug: "stratxcel", name: "Stratxcel Platform" },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  const mockProtectedService = {
    from: (table: string) => ({
      select: () => createProtectedChain(table),
    }),
  } as any;

  const protectedResult = await deleteCustomerTenantData(mockProtectedService, "tnt_stratxcel", "admin@stratxcel.in");
  assert.equal(protectedResult.ok, false);
  assert.match(protectedResult.error ?? "", /protected/i);
  console.log("  ✓ 7. Protected system workspace (stratxcel) cannot be deleted");

  console.log("\nALL DELETE CLIENT & LIFECYCLE TESTS PASS!");
}

void runTests();
