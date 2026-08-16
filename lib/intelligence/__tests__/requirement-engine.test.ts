import assert from "node:assert/strict";
import { synthesizeBusinessRequirements } from "../requirements/requirement-engine.ts";

async function testRequirementEngine() {
  console.log("Testing Requirement Intelligence Engine...");

  // Test Case 1: General Store / Low-Digital Presence Case (Mandatory Test 17 & 18)
  const generalStoreResult = synthesizeBusinessRequirements({
    businessName: "Gupta Kirana & General Store",
    businessType: "General Store / Retail",
    industry: "Retail Provisions",
    operatingLocations: ["Civil Lines, Raipur"],
    connectedAssets: {
      googleBusiness: true,
      whatsapp: true,
      instagram: false,
      facebook: false,
    },
  });

  const gsReqs = generalStoreResult.requirements;
  const googleReq = gsReqs.find((r) => r.requirementKey === "google_business_optimization");
  const reviewReq = gsReqs.find((r) => r.requirementKey === "review_management");
  const localSeoReq = gsReqs.find((r) => r.requirementKey === "local_seo");
  const conversionReq = gsReqs.find((r) => r.requirementKey === "website_conversion");
  const socialReq = gsReqs.find((r) => r.requirementKey === "social_autopilot");
  const adsReq = gsReqs.find((r) => r.requirementKey === "paid_advertising");

  // Invariant 1: Google Business must be HIGH / REQUIRED
  assert.ok(googleReq, "Google Business requirement must exist");
  assert.ok(googleReq.priority === "HIGH" || googleReq.priority === "REQUIRED");

  // Invariant 2: Review Improvement must be HIGH
  assert.ok(reviewReq, "Review management requirement must exist");
  assert.equal(reviewReq.priority, "HIGH");

  // Invariant 3: Local SEO must be MEDIUM or HIGH
  assert.ok(localSeoReq, "Local SEO requirement must exist");
  assert.ok(localSeoReq.priority === "MEDIUM" || localSeoReq.priority === "HIGH");

  // Invariant 4: Website conversion must be MEDIUM
  assert.ok(conversionReq, "Website conversion requirement must exist");
  assert.equal(conversionReq.priority, "MEDIUM");

  // Invariant 5: Instagram/Facebook MUST NOT be required for General Store (CRITICAL ACCEPTANCE CRITERION)
  assert.ok(socialReq, "Social requirement must exist in analysis");
  assert.equal(
    socialReq.priority,
    "NOT_CURRENTLY_REQUIRED",
    "General Store must NOT have social autopilot forced upon it",
  );

  // Invariant 6: Paid Ads MUST NOT be required for General Store
  assert.ok(adsReq, "Ads requirement must exist in analysis");
  assert.equal(
    adsReq.priority,
    "NOT_CURRENTLY_REQUIRED",
    "General Store must NOT have paid advertising forced upon it",
  );

  // Test Case 2: E-commerce Store (High Social & Ads requirement)
  const ecommerceResult = synthesizeBusinessRequirements({
    businessName: "Aura Apparel D2C",
    businessType: "E-commerce Online Store",
    industry: "Fashion & Apparel",
    operatingLocations: ["All India"],
    connectedAssets: {
      googleBusiness: false,
      whatsapp: true,
      instagram: true,
      facebook: true,
    },
  });

  const ecomSocialReq = ecommerceResult.requirements.find((r) => r.requirementKey === "social_autopilot");
  const ecomAdsReq = ecommerceResult.requirements.find((r) => r.requirementKey === "paid_advertising");
  assert.equal(ecomSocialReq?.priority, "HIGH");
  assert.equal(ecomAdsReq?.priority, "HIGH");

  // Test Case 3: B2B Enterprise Consulting (Consumer social NOT required)
  const b2bResult = synthesizeBusinessRequirements({
    businessName: "Apex Enterprise Consulting",
    businessType: "B2B Corporate Advisory",
    industry: "Management Consulting",
    operatingLocations: ["Mumbai", "Bangalore"],
    connectedAssets: {
      googleBusiness: true,
      whatsapp: false,
      instagram: false,
    },
  });

  const b2bSocialReq = b2bResult.requirements.find((r) => r.requirementKey === "social_autopilot");
  assert.equal(b2bSocialReq?.priority, "NOT_CURRENTLY_REQUIRED");

  console.log("requirement-engine.test.ts: ALL PASS (General Store, E-commerce, B2B, Truthful Priority Routing)");
}

testRequirementEngine().catch((err) => {
  console.error("Requirement Engine test failed:", err);
  process.exit(1);
});
