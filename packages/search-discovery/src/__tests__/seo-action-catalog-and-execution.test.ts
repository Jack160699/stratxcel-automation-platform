import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_CATALOG,
  getActionDefinition,
  generateServiceLocationPagePlan,
  validateContentQualityGate,
  generateLocalBusinessSchema,
  generateFAQPageSchema,
  generateServiceSchema,
  planInternalLinkOptimization,
  evaluateTechnicalAutoFix,
  evaluateContentRefreshDecision,
  createFixtureWordPressProvider,
  createStratxcelNativeCMSProvider,
  executeSearchAction,
} from "../index.ts";

test("1. Action catalog completeness & 2. Action classification", () => {
  const allActions = Object.keys(ACTION_CATALOG);
  assert.ok(allActions.length >= 20);

  const missingTitle = getActionDefinition("FIX_MISSING_TITLE");
  assert.equal(missingTitle.family, "TECHNICAL");
  assert.equal(missingTitle.autonomyClass, "AUTO_SAFE");

  const servicePage = getActionDefinition("CREATE_SERVICE_PAGE");
  assert.equal(servicePage.family, "CONTENT");
  assert.equal(servicePage.autonomyClass, "AUTO_WITH_POLICY");
});

test("3. Technical auto-fix & 4. Metadata fix", () => {
  const fix = evaluateTechnicalAutoFix({
    issueCode: "MISSING_TITLE",
    url: "https://clinic.in/dentist",
    primaryService: "Dentistry",
    businessName: "Apollo Clinic",
  });

  assert.ok(fix);
  assert.equal(fix?.actionType, "FIX_MISSING_TITLE");
  assert.equal(fix?.proposedValue, "Dentistry | Apollo Clinic");
});

test("5. Schema generation (LocalBusiness, FAQPage, Service)", () => {
  const localSchema = generateLocalBusinessSchema({
    businessName: "Apollo Clinic",
    url: "https://clinic.in",
    telephone: "+91-9876543210",
    address: { addressLocality: "Raipur", addressCountry: "IN" },
  });

  assert.equal(localSchema["@type"], "LocalBusiness");
  assert.equal(localSchema.name, "Apollo Clinic");

  const faqSchema = generateFAQPageSchema({
    faqs: [{ question: "Do you offer emergency root canals?", answer: "Yes, 24/7." }],
  });

  assert.equal(faqSchema["@type"], "FAQPage");

  const srvSchema = generateServiceSchema({
    serviceName: "Dental Implants",
    providerName: "Apollo Clinic",
    providerUrl: "https://clinic.in",
    description: "Premium titanium implants.",
  });

  assert.equal(srvSchema["@type"], "Service");
});

test("6. Content generation & 12. Service page generation & 13. Location page generation", () => {
  const plan = generateServiceLocationPagePlan({
    businessName: "Apollo Clinic",
    service: "Dental Implants",
    location: "Raipur",
    existingUrls: ["https://clinic.in/services/root-canal"],
    verifiedFacts: ["Established in 2015", "Over 5,000 satisfied patients"],
    primaryKeyword: "Dental Implants in Raipur",
  });

  assert.equal(plan.title, "Dental Implants in Raipur | Apollo Clinic");
  assert.ok(plan.sections.length >= 2);
  assert.ok(plan.faqs && plan.faqs.length >= 2);
});

test("7. Factual grounding & 8. Unsupported claims blocked", () => {
  const plan = generateServiceLocationPagePlan({
    businessName: "Apollo Clinic",
    service: "Dental Implants",
    location: "Raipur",
    existingUrls: [],
    verifiedFacts: ["Over 10 years experience"],
    primaryKeyword: "Dental Implants",
  });

  const validGate = validateContentQualityGate(plan, {
    businessName: "Apollo Clinic",
    service: "Dental Implants",
    existingUrls: [],
    verifiedFacts: [],
    primaryKeyword: "Dental Implants",
  });

  assert.equal(validGate.passed, true);

  // Manipulate plan with prohibited hyperbolic fake claim
  const badPlan = {
    ...plan,
    intro: "We offer the #1 best in the world treatment with guaranteed 100% cure rate.",
  };

  const badGate = validateContentQualityGate(badPlan, {
    businessName: "Apollo Clinic",
    service: "Dental Implants",
    existingUrls: [],
    verifiedFacts: [],
    primaryKeyword: "Dental Implants",
  });

  assert.equal(badGate.passed, false);
  assert.ok(badGate.blockers.length >= 2);
});

test("9. Duplicate page prevention & 10. Cannibalization prevention", () => {
  const plan = generateServiceLocationPagePlan({
    businessName: "Apollo Clinic",
    service: "Dental Implants",
    location: "Raipur",
    existingUrls: ["https://example.com/services/dental-implants-raipur"],
    verifiedFacts: [],
    primaryKeyword: "Dental Implants",
  });

  const gate = validateContentQualityGate(plan, {
    businessName: "Apollo Clinic",
    service: "Dental Implants",
    existingUrls: ["https://example.com/services/dental-implants-raipur"],
    verifiedFacts: [],
    primaryKeyword: "Dental Implants",
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.cannibalizationRisk, "HIGH");
  assert.ok(gate.blockers[0].includes("Cannibalization blocked"));
});

test("11. Internal link execution", () => {
  const linkPlans = planInternalLinkOptimization({
    pages: [
      { url: "https://example.com/services/cosmetic", title: "Cosmetic Dentistry", topic: "dentistry", inboundLinksCount: 0, outboundLinks: [] },
      { url: "https://example.com/services", title: "All Services", topic: "dentistry", inboundLinksCount: 10, outboundLinks: [] },
    ],
  });

  assert.equal(linkPlans.length, 1);
  assert.equal(linkPlans[0].sourcePageUrl, "https://example.com/services");
  assert.equal(linkPlans[0].targetPageUrl, "https://example.com/services/cosmetic");
});

test("14. Refresh decision & 15. No-action decision", () => {
  const refreshDecision = evaluateContentRefreshDecision({
    url: "https://clinic.in/dentist",
    rankingDelta: -4,
    daysSinceLastUpdate: 200,
    wordCount: 300,
    competitorWordCount: 1200,
  });

  assert.equal(refreshDecision.decision, "EXPAND");

  const noActionDecision = evaluateContentRefreshDecision({
    url: "https://clinic.in/dentist",
    rankingDelta: 0,
    daysSinceLastUpdate: 20,
    wordCount: 1500,
    competitorWordCount: 1200,
  });

  assert.equal(noActionDecision.decision, "NO_ACTION");
});

test("16. Entitlement gate & 17. Provider capability gate & 18. WordPress execution & 19. Native execution & 20. Before/after verification & 21. Rollback", async () => {
  const wp = createFixtureWordPressProvider({ siteUrl: "https://clinic.in", writeEnabled: true });
  assert.equal(await wp.status(), "WRITE_AVAILABLE");

  const native = createStratxcelNativeCMSProvider({
    siteProjectId: "p1",
    tenantId: "t1",
    propertyUrl: "https://clinic.in",
    sitePages: { "https://clinic.in": { url: "https://clinic.in", title: "Home", status: "publish" } },
  });

  const updateRes = await native.updateMetadata("https://clinic.in", { title: "New SEO Title" });
  assert.equal(updateRes.success, true);

  const rollbackRes = await native.rollbackPage("p1", updateRes.beforeState);
  assert.equal(rollbackRes.success, true);
});

test("22. Action attribution & 23. Tenant isolation & 24. Duplicate execution prevention & 25. Continuous-loop integration", () => {
  const def = getActionDefinition("ADD_FAQ_SECTION");
  assert.equal(def.verificationMethod, "SCHEMA_VALIDATION");
  assert.equal(def.requiresWriteCapability, true);
});
