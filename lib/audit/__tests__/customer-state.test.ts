import assert from "node:assert/strict";
import {
  auditIntakeMissingFields,
  deriveAuditCustomerState,
  hasValidAuditReport,
  isAuditIntakeComplete,
  normalizeAuditDeliveryReport,
  type AuditStateOrder,
} from "../customer-state.ts";

const completeLegacyIntake = {
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

const completeBrandBrainIntake = {
  business_name: "Gupta Garments",
  industry: null,
  website_url: null,
  deep_dive_answers: {
    intakeMeta: { questionnaireVersion: "brand_brain_v1" },
    businessDescription: "Women's clothing shop",
    businessReach: "city",
    location: "Bhilai, Chhattisgarh",
    majorProducts: "Sarees\nKurtis\nBridal wear",
    priorityOffering: "Bridal wear",
    customerSegments: ["women", "families"],
    reasonsChosen: ["trusted_locally", "better_quality"],
    discoveryChannels: ["walk_ins", "instagram", "referrals"],
    purchaseChannels: ["shop_office", "whatsapp"],
    biggestProblem: "not_enough_customers",
  },
  goals_answers: {
    primaryGoal: "more_customers",
    successDefinition: "More regular store visits and 50 new enquiries a month",
  },
};

const report = {
  executiveSummary: "Acme has strong referrals but needs a repeatable conversion system.",
  strengths: ["Clear positioning"],
  priorityRisks: ["Lead follow-up is inconsistent"],
  actionPlan: ["Implement a weekly pipeline review"],
};

// Legacy paid Audit rows remain compatible after the new questionnaire ships.
assert.equal(isAuditIntakeComplete(completeLegacyIntake), true);
assert.deepEqual(auditIntakeMissingFields({ ...completeLegacyIntake, industry: "" }), ["industry"]);

// New Brand Brain intake deliberately does not require jargon-heavy industry
// classification, a website, or a known competitor.
assert.equal(isAuditIntakeComplete(completeBrandBrainIntake), true);
assert.deepEqual(auditIntakeMissingFields({
  ...completeBrandBrainIntake,
  deep_dive_answers: { ...completeBrandBrainIntake.deep_dive_answers, priorityOffering: "" },
}), ["priorityOffering"]);
assert.deepEqual(auditIntakeMissingFields({
  ...completeBrandBrainIntake,
  deep_dive_answers: { ...completeBrandBrainIntake.deep_dive_answers, businessReach: "local_area", location: "" },
}), ["location"]);
assert.equal(isAuditIntakeComplete({
  ...completeBrandBrainIntake,
  deep_dive_answers: { ...completeBrandBrainIntake.deep_dive_answers, businessReach: "online_anywhere", location: "" },
}), true);

assert.equal(hasValidAuditReport(report), true);
assert.equal(hasValidAuditReport({ executiveSummary: "Summary only" }), false);
assert.deepEqual(normalizeAuditDeliveryReport({ ...report, strengths: ["  Clear positioning  ", ""] })?.strengths, ["Clear positioning"]);

const rich = normalizeAuditDeliveryReport({
  ...report,
  overallHealth: { score: 72, explanation: "Solid local trust, weak online conversion." },
  categoryScores: {
    brandPositioning: { score: 80, explanation: "Clear niche", evidenceSourceIds: ["src_1"] },
    websiteConversion: { score: null, explanation: "No website evidence", evidenceSourceIds: [] },
    discoverabilitySeo: { score: 40, explanation: "Thin local SEO", evidenceSourceIds: ["src_1"] },
    socialContent: { score: 55, explanation: "Irregular posting", evidenceSourceIds: ["src_2"] },
    leadGeneration: { score: null, explanation: "Not enough data", evidenceSourceIds: [] },
    trustReputation: { score: 70, explanation: "Good reviews", evidenceSourceIds: ["src_1"] },
    customerJourney: { score: 50, explanation: "WhatsApp handoff is manual", evidenceSourceIds: [] },
    automationOperations: { score: null, explanation: "Not enough data", evidenceSourceIds: [] },
  },
  growthProblems: ["Inconsistent follow-up"],
  quickWins30Days: ["Add a WhatsApp reply template"],
  ownerActions: ["Track missed calls for one week"],
  stratxcelSupport: [{
    recommendation: "Set up a simple enquiry tracker",
    capability: "Operations automation",
    why: "Stops leads from falling through after store hours",
  }],
  plan: {
    days1To30: ["Fix reply speed"],
    days31To60: ["Improve Google profile"],
    days61To90: ["Add a basic offer funnel"],
  },
  researchLimitations: ["No official website to verify"],
  scores: {
    overall: 72,
    digitalPresence: null,
    brandClarity: 80,
    growthReadiness: 50,
    conversionReadiness: null,
  },
});
assert.equal(rich?.overallHealth?.score, 72);
assert.equal(rich?.categoryScores?.websiteConversion.score, null);
assert.deepEqual(rich?.plan, {
  days30: ["Fix reply speed"],
  days60: ["Improve Google profile"],
  days90: ["Add a basic offer funnel"],
});
assert.deepEqual(rich?.researchLimitations, ["No official website to verify"]);
assert.deepEqual(rich?.limitations, ["No official website to verify"]);
assert.equal(rich?.scores?.digitalPresence, null);
assert.equal(rich?.scores?.conversionReadiness, null);
assert.equal(rich?.ownerActions?.[0], "Track missed calls for one week");

const order = (status: AuditStateOrder["status"], extra: Partial<AuditStateOrder> = {}): AuditStateOrder => ({
  ...completeBrandBrainIntake,
  status,
  ...extra,
});

assert.equal(deriveAuditCustomerState(null), "NOT_STARTED");
assert.equal(deriveAuditCustomerState(order("pending_payment")), "PAYMENT_PENDING");
assert.equal(deriveAuditCustomerState(order("paid", {
  deep_dive_answers: { ...completeBrandBrainIntake.deep_dive_answers, businessDescription: "" },
})), "INTAKE_REQUIRED");
assert.equal(deriveAuditCustomerState(order("paid")), "READY_FOR_EXECUTION");
assert.equal(deriveAuditCustomerState(order("in_review")), "PROCESSING");
assert.equal(deriveAuditCustomerState(order("completed", { report_data: report })), "DELIVERED");
assert.equal(deriveAuditCustomerState(order("completed", { report_data: {} })), "NEEDS_ATTENTION");
assert.equal(deriveAuditCustomerState(order("refunded")), "CLOSED");

console.log("customer-state.test.ts: ALL PASS (legacy + Brand Brain intake, report validity, canonical customer states)");
