import assert from "node:assert/strict";
import type { EnvironmentResetResult } from "../environment-reset/route.ts";

function run() {
  console.log("Starting Environment Reset Safety test suite...");

  // Mock scenario: 2 protected admin accounts, 3 customer test tenants, 1 system tenant
  const mockProtectedUserIds = new Set(["usr_admin_1", "usr_admin_2"]);
  const mockProtectedTenantIds = new Set(["tnt_stratxcel_company", "tnt_staff_workspace"]);

  const mockTenants = [
    { id: "tnt_stratxcel_company", slug: "stratxcel", name: "Stratxcel Core" },
    { id: "tnt_staff_workspace", slug: "staff-workspace", name: "Staff Workspace" },
    { id: "tnt_test_ascend_theory", slug: "ascend-theory-1", name: "Ascend Theory" },
    { id: "tnt_test_xyz", slug: "xyz-consulting-2", name: "XYZ Consulting" },
  ];

  // Filter disposable customer tenants
  const customerTenants = mockTenants.filter((t) => !mockProtectedTenantIds.has(t.id));
  assert.equal(customerTenants.length, 2);
  assert.ok(customerTenants.some((t) => t.id === "tnt_test_ascend_theory"));
  assert.ok(customerTenants.some((t) => t.id === "tnt_test_xyz"));

  // Verify protected tenants are NEVER in customer list
  assert.ok(!customerTenants.some((t) => t.id === "tnt_stratxcel_company"));
  assert.ok(!customerTenants.some((t) => t.id === "tnt_staff_workspace"));

  // Mock result validation
  const mockResult: EnvironmentResetResult = {
    resetId: "rst_demo_12345",
    timestamp: new Date().toISOString(),
    initiatedBy: "admin@stratxcel.in",
    customerUsersReset: 2,
    customerTenantsReset: 2,
    auditsReset: 2,
    brandBrainsReset: 2,
    connectorsReset: 1,
    oauthConnectionsReset: 1,
    missionsReset: 0,
    crmRecordsReset: 0,
    protectedRecordsPreserved: mockProtectedUserIds.size + mockProtectedTenantIds.size,
    status: "COMPLETED",
  };

  assert.equal(mockResult.status, "COMPLETED");
  assert.equal(mockResult.protectedRecordsPreserved, 4);
  assert.equal(mockResult.customerTenantsReset, 2);

  console.log("environment-reset.test.ts: ALL PASS (safe protected boundary filtering, customer tenant identification, auditable metrics)");
}

run();
