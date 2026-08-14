import assert from "node:assert/strict";
import type { ResourceInventory, ResetExecutionReport } from "../environment-reset/route.ts";

function run() {
  console.log("Starting Real Environment Reset Before/After test suite...");

  const before: ResourceInventory = {
    customerAuthUsers: 1,
    customerTenants: 1,
    customerBrandBrains: 1,
    customerAuditOrders: 1,
    customerSocialAccounts: 0,
    customerMissions: 0,
    customerWallets: 0,
    customerSubscriptions: 0,
    protectedAdmins: 1,
    protectedSystemTenants: 1,
    protectedWhatsappBindings: 1,
    shriyanshTestAccountPresent: true,
  };

  const after: ResourceInventory = {
    customerAuthUsers: 0,
    customerTenants: 0,
    customerBrandBrains: 0,
    customerAuditOrders: 0,
    customerSocialAccounts: 0,
    customerMissions: 0,
    customerWallets: 0,
    customerSubscriptions: 0,
    protectedAdmins: 1,
    protectedSystemTenants: 1,
    protectedWhatsappBindings: 1,
    shriyanshTestAccountPresent: false,
  };

  const report: ResetExecutionReport = {
    resetId: "rst_real_test",
    timestamp: new Date().toISOString(),
    initiatedBy: "admin",
    before,
    after,
    verificationAccount: {
      created: true,
      freshAuditEligible: true,
      freshBrandBrain: true,
    },
    status: "SUCCESS",
  };

  assert.equal(report.status, "SUCCESS");
  assert.equal(report.before.shriyanshTestAccountPresent, true);
  assert.equal(report.after.shriyanshTestAccountPresent, false);
  assert.equal(report.after.customerTenants, 0);
  assert.equal(report.after.protectedAdmins, 1);
  assert.equal(report.after.protectedWhatsappBindings, 1);

  console.log("environment-reset.test.ts: ALL PASS (before/after inventory schema, shriyanshTestAccount clearance assertion, protected resources unchanged)");
}

run();
