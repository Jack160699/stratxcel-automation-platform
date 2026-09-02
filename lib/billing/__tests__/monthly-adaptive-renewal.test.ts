import assert from "node:assert/strict";
import { MonthlyRenewalEngine } from "../monthly-cycle.ts";
import { ValueLedgerService } from "../../reporting/value-ledger.ts";

/**
 * ValueLedgerService is now real, Postgres-backed (see value-ledger.ts's
 * own header comment -- fixed from an in-memory Map during the final
 * rescan, Update 60). This test stays isolated from any live database by
 * injecting a minimal in-memory fake through the same constructor
 * injection point the real service now supports, rather than relying on
 * "no constructor args = isolated in-memory instance" the way it did
 * before that fix.
 */
function createFakeLedgerSupabase() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    from(table: string) {
      if (table !== "value_ledger_entries") throw new Error(`unexpected table: ${table}`);
      return {
        insert(row: Record<string, unknown>) {
          rows.push(row);
          return Promise.resolve({ error: null });
        },
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              const afterFirst = rows.filter((r) => r[column] === value);
              return {
                eq(column2: string, value2: string) {
                  const afterSecond = afterFirst.filter((r) => r[column2] === value2);
                  return {
                    order() {
                      return Promise.resolve({ data: afterSecond, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function testMonthlyAdaptiveRenewalSuite() {
  console.log("Testing Monthly Adaptive Renewal & Lifecycle (Cases 21, 22, 27, 28, 29, 30)...");

  const engine = new MonthlyRenewalEngine();
  const ledger = new ValueLedgerService(createFakeLedgerSupabase());

  // Seed sample deliverable
  await ledger.recordDeliverable({
    tenantId: "tenant-renewal-1",
    cycleMonth: "2026-08",
    serviceKey: "google_business_optimization",
    deliverableTitle: "August Google Business Profile Audit & Refresh",
    deliverableSummary: "Completed baseline category alignment and 4 weekly photo updates.",
    resultMetric: "Total Views",
    resultValue: "+45%",
  });

  // Case 27: 26th Report Generation & Idempotency
  const recap1 = await engine.execute26thMonthlyReport({
    tenantId: "tenant-renewal-1",
    businessName: "Kalyan Electronics",
    businessType: "Local Retail Store",
    industry: "Consumer Electronics",
    operatingLocations: ["Raipur"],
    currentPlanMrpRupees: 4999,
    cycleMonth: "2026-08",
    ledger,
  });

  assert.ok(recap1.valueReport);
  assert.equal(recap1.valueReport.totalDeliverablesCompleted, 1);
  assert.ok(recap1.adaptation);

  // Re-run for same tenant and month — MUST be identical object / cached (IDEMPOTENCY)
  const recap2 = await engine.execute26thMonthlyReport({
    tenantId: "tenant-renewal-1",
    businessName: "Kalyan Electronics",
    businessType: "Local Retail Store",
    industry: "Consumer Electronics",
    operatingLocations: ["Raipur"],
    currentPlanMrpRupees: 4999,
    cycleMonth: "2026-08",
    ledger,
  });

  assert.equal(recap1.generatedAt, recap2.generatedAt, "26th Report must be idempotent (no duplicate reports)");
  console.log("  ✓ Case 27: Duplicate monthly report prevention & idempotency passed");

  // Case 21: Reduced Next-Month Requirements (Price Decrease)
  const decreaseRecap = await engine.execute26thMonthlyReport({
    tenantId: "tenant-reduced-1",
    businessName: "Kalyan Electronics Branch 2",
    businessType: "General Store / Retail",
    industry: "Retail Provisions",
    operatingLocations: ["Raipur"],
    currentPlanMrpRupees: 9999, // Current is high
    cycleMonth: "2026-08",
    requirementOverride: (base) => ({
      ...base,
      requirements: base.requirements.filter((r) => r.priority === "REQUIRED"), // only 1 core requirement
    }),
    ledger,
  });

  assert.equal(decreaseRecap.adaptation.changeType, "DECREASE");
  assert.ok(decreaseRecap.adaptation.priceDeltaRupees < 0);
  assert.ok(decreaseRecap.adaptation.explanation.whyItChanged.includes("maintenance mode"));
  console.log("  ✓ Case 21: Reduced next-month requirements (Price decrease with explanation) passed");

  // Case 22: Increased Next-Month Requirements (Price Increase with Explanation)
  const increaseRecap = await engine.execute26thMonthlyReport({
    tenantId: "tenant-increased-1",
    businessName: "Kalyan Electronics Scale",
    businessType: "E-commerce Online Store",
    industry: "Consumer Electronics",
    operatingLocations: ["All India"],
    currentPlanMrpRupees: 1999, // Current is low
    cycleMonth: "2026-08",
    ledger,
  });

  assert.equal(increaseRecap.adaptation.changeType, "INCREASE");
  assert.ok(increaseRecap.adaptation.priceDeltaRupees > 0);
  assert.ok(increaseRecap.adaptation.explanation.whatChanged.length > 0);
  assert.ok(increaseRecap.adaptation.explanation.expectedBenefit.length > 0);
  console.log("  ✓ Case 22: Increased next-month requirements (Price increase with explanation) passed");

  // Case 28: Grace Period Behavior (Days 1–3 if unpaid)
  const day2Status = engine.evaluateBillingStatus("tenant-renewal-1", 2, false);
  assert.equal(day2Status.state, "GRACE_PERIOD");
  assert.equal(day2Status.unpaid, true);
  console.log("  ✓ Case 28: Grace period behavior (Days 1-3) passed");

  // Case 29: Service Stop (Day 4 if unpaid)
  const day4Status = engine.evaluateBillingStatus("tenant-renewal-1", 4, false);
  assert.equal(day4Status.state, "SERVICE_STOPPED");
  assert.equal(day4Status.unpaid, true);
  console.log("  ✓ Case 29: Service stop (Day 4 if unpaid) passed");

  // Case 30: Renewal Window (Days 4–5 if paid)
  const day4PaidStatus = engine.evaluateBillingStatus("tenant-renewal-1", 4, true);
  assert.equal(day4PaidStatus.state, "RENEWED");
  assert.equal(day4PaidStatus.unpaid, false);
  console.log("  ✓ Case 30: Renewal window (Days 4-5) passed");

  console.log("monthly-adaptive-renewal.test.ts: ALL PASS");
}

testMonthlyAdaptiveRenewalSuite().catch((err) => {
  console.error("Monthly renewal test failed:", err);
  process.exit(1);
});
