import assert from "node:assert/strict";
import {
  auditIntakeMissingFields,
  deriveAuditCustomerState,
  hasValidAuditReport,
  isAuditIntakeComplete,
  normalizeAuditDeliveryReport,
  type AuditStateOrder,
} from "../customer-state.ts";

const completeIntake = {
  business_name: "Acme",
  industry: "Services",
  website_url: "https://acme.example",
  deep_dive_answers: {
    idealCustomers: "SMBs",
    majorProducts: "Advisory",
    competitors: "Local firms",
    leadSources: "Referrals",
    differentiation: "Fast implementation",
  },
  goals_answers: {
    successDefinition: "A repeatable pipeline",
    biggestObstacle: "Inconsistent follow-up",
    topPriorities: "CRM, content, conversion",
  },
};

const report = {
  executiveSummary: "Acme has strong referrals but needs a repeatable conversion system.",
  strengths: ["Clear positioning"],
  priorityRisks: ["Lead follow-up is inconsistent"],
  actionPlan: ["Implement a weekly pipeline review"],
};

assert.equal(isAuditIntakeComplete(completeIntake), true);
assert.deepEqual(auditIntakeMissingFields({ ...completeIntake, industry: "" }), ["industry"]);
assert.equal(hasValidAuditReport(report), true);
assert.equal(hasValidAuditReport({ executiveSummary: "Summary only" }), false);
assert.deepEqual(normalizeAuditDeliveryReport({ ...report, strengths: ["  Clear positioning  ", ""] })?.strengths, ["Clear positioning"]);

const order = (status: AuditStateOrder["status"], extra: Partial<AuditStateOrder> = {}): AuditStateOrder => ({
  ...completeIntake,
  status,
  ...extra,
});

assert.equal(deriveAuditCustomerState(null), "NOT_STARTED");
assert.equal(deriveAuditCustomerState(order("pending_payment")), "PAYMENT_PENDING");
assert.equal(deriveAuditCustomerState(order("paid", { industry: "" })), "INTAKE_REQUIRED");
assert.equal(deriveAuditCustomerState(order("paid")), "READY_FOR_EXECUTION");
assert.equal(deriveAuditCustomerState(order("in_review")), "PROCESSING");
assert.equal(deriveAuditCustomerState(order("completed", { report_data: report })), "DELIVERED");
assert.equal(deriveAuditCustomerState(order("completed", { report_data: {} })), "NEEDS_ATTENTION");
assert.equal(deriveAuditCustomerState(order("refunded")), "CLOSED");

console.log("customer-state.test.ts: ALL PASS (intake contract, report validity, canonical customer states)");
