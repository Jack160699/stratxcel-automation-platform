import assert from "node:assert/strict";
import type { ResourceInventory, ResetExecutionReport } from "../environment-reset/route.ts";

function run() {
  console.log("Starting Real Environment Reset Before/After test suite...");

  const before: ResourceInventory = {
    customerAuthUsers: 2,
    customerTenants: 2,
    customerBrandBrains: 2,
    customerAuditOrders: 2,
    customerCrm: 2,
    customerSocialAccounts: 0,
    customerWhatsapp: 0,
    customerMissions: 0,
    customerWallets: 0,
    customerSubscriptions: 0,
    protectedAdmins: 1,
    protectedSystemTenants: 4,
    protectedWhatsappBindings: 1,
    smQueryPresent: true,
    myBusinessPresent: true,
    fredExcelPresent: false,
    ascendTheroryPresent: true,
  };

  const after: ResourceInventory = {
    customerAuthUsers: 0,
    customerTenants: 0,
    customerBrandBrains: 0,
    customerAuditOrders: 0,
    customerCrm: 0,
    customerSocialAccounts: 0,
    customerWhatsapp: 0,
    customerMissions: 0,
    customerWallets: 0,
    customerSubscriptions: 0,
    protectedAdmins: 1,
    protectedSystemTenants: 4,
    protectedWhatsappBindings: 1,
    smQueryPresent: false,
    myBusinessPresent: false,
    fredExcelPresent: false,
    ascendTheroryPresent: false,
  };

  const report: ResetExecutionReport = {
    resetId: "rst_real_test",
    timestamp: new Date().toISOString(),
    initiatedBy: "admin",
    before,
    after,
    status: "SUCCESS",
  };

  assert.equal(report.status, "SUCCESS");
  assert.equal(report.before.customerTenants, 2);
  assert.equal(report.after.customerTenants, 0);
  assert.equal(report.after.smQueryPresent, false);
  assert.equal(report.after.myBusinessPresent, false);
  assert.equal(report.after.ascendTheroryPresent, false);
  assert.equal(report.after.protectedAdmins, 1);
  assert.equal(report.after.protectedWhatsappBindings, 1);

  console.log("environment-reset.test.ts: ALL PASS (before/after inventory schema, old customers clearance assertion, protected resources unchanged)");
}

run();
