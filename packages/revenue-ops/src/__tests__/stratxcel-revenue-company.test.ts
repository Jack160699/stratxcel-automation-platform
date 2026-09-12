import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STRATXCEL_CANONICAL_OFFERS,
  validateStratXcelPricing,
  getStratXcelBusinessBrain,
} from "../../../workforce-core/src/catalogue/stratxcel-business-brain.ts";
import { BusinessDiagnosisEngine } from "../business-diagnosis.ts";
import { OpportunityScoringEngine } from "../opportunity-scorer.ts";
import { WhatsAppSalesEngine } from "../whatsapp-sales-engine.ts";
import { ContinuousRevenueEngine } from "../../../workforce-core/src/company-ops/continuous-revenue-engine.ts";

describe("StratXcel Autonomous Revenue Company — Canonical Catalog & Pricing Engine", () => {
  it("Test 1: Enforces canonical pricing floor for Normal Website (₹3,000)", () => {
    const validResult = validateStratXcelPricing("NORMAL_WEBSITE", 3000);
    assert.equal(validResult.isValid, true);
    assert.equal(validResult.canonicalOffer?.startingPriceInr, 3000);

    // Rejects below floor
    const invalidResult = validateStratXcelPricing("NORMAL_WEBSITE", 2500);
    assert.equal(invalidResult.isValid, false);
    assert.match(invalidResult.reason!, /violates StratXcel policy/);
  });

  it("Test 2: Enforces canonical pricing floor for Premium Detailed Website (₹5,000)", () => {
    const valid = validateStratXcelPricing("PREMIUM_DETAILED_WEBSITE", 5000);
    assert.equal(valid.isValid, true);

    const invalid = validateStratXcelPricing("PREMIUM_DETAILED_WEBSITE", 4000);
    assert.equal(invalid.isValid, false);
  });

  it("Test 3: Enforces canonical pricing floor for Customized Business Website (₹10,000)", () => {
    const valid = validateStratXcelPricing("CUSTOMIZED_WEBSITE", 10000);
    assert.equal(valid.isValid, true);

    const invalid = validateStratXcelPricing("CUSTOMIZED_WEBSITE", 8000);
    assert.equal(invalid.isValid, false);
  });

  it("Test 4: Enforces strict SEO policy: Minimum 3 months commitment required", () => {
    // 1-month standalone SEO must be rejected
    const oneMonthResult = validateStratXcelPricing("SEO", 5000, 1);
    assert.equal(oneMonthResult.isValid, false);
    assert.match(oneMonthResult.reason!, /Minimum commitment is 3 months/);

    // 2-month standalone SEO must be rejected
    const twoMonthResult = validateStratXcelPricing("SEO", 5000, 2);
    assert.equal(twoMonthResult.isValid, false);

    // 3-month commitment at ₹5,000/mo is valid
    const validResult = validateStratXcelPricing("SEO", 5000, 3);
    assert.equal(validResult.isValid, true);
  });

  it("Test 5: Complex custom website requires consultation", () => {
    const consultationResult = validateStratXcelPricing("COMPLEX_CUSTOM_WEBSITE", 0);
    assert.equal(consultationResult.isValid, true);
    assert.equal(consultationResult.canonicalOffer?.isConsultationRequired, true);
  });

  it("Test 6: Hermes is strictly forbidden from inventing non-existent offers", () => {
    const unknownResult = validateStratXcelPricing("SUPER_AI_SECRET_PACKAGE", 10000);
    assert.equal(unknownResult.isValid, false);
    assert.match(unknownResult.reason!, /Hermes must never invent offerings/);
  });
});

describe("StratXcel 17-Dimension Business Diagnosis Engine", () => {
  const diagnosisEngine = new BusinessDiagnosisEngine();

  it("Test 7: Optical Shop diagnosis recommends Google Maps + Normal Site and rules out Complex Web App", () => {
    const report = diagnosisEngine.diagnose({
      businessName: "Chashma Point Optical Care",
      category: "optical_shop",
      location: { city: "Raipur", state: "Chhattisgarh" },
      webPresence: "none",
      gmbStatus: "few_reviews",
      gmbReviewCount: 12,
      gmbRating: 4.0,
      hasSocial: false,
      leadCaptureMechanism: "phone_only",
      primaryStatedPain: "Walk-in customers dropping",
    });

    assert.equal(report.dimensions.length, 17);
    const recommendedKeys = report.recommendedServices.map((r) => r.offerKey);
    assert.ok(recommendedKeys.includes("GOOGLE_BUSINESS_MAPS_GROWTH"));
    assert.ok(recommendedKeys.includes("NORMAL_WEBSITE"));

    // Complex custom site should be explicitly marked unrecommended
    const unrecommendedKeys = report.unrecommendedServices.map((u) => u.offerKey);
    assert.ok(unrecommendedKeys.includes("COMPLEX_CUSTOM_WEBSITE"));
  });

  it("Test 8: Gym with active website rules out website redesign and recommends Social Media + Lead Funnel", () => {
    const report = diagnosisEngine.diagnose({
      businessName: "Pulse Fitness & Crossfit Studio",
      category: "gym_fitness",
      location: { city: "Raipur", state: "Chhattisgarh" },
      webPresence: "good",
      websiteUrl: "https://pulsefitnessraipur.in",
      socialActivity: "dormant",
      daysSinceLastPost: 45,
      leadCaptureMechanism: "phone_only",
    });

    const recommendedKeys = report.recommendedServices.map((r) => r.offerKey);
    assert.ok(recommendedKeys.some((k) => k.includes("SOCIAL_MEDIA")));

    // Website rebuild should be ruled out
    const unrecommendedKeys = report.unrecommendedServices.map((u) => u.offerKey);
    assert.ok(unrecommendedKeys.includes("NORMAL_WEBSITE"));
  });

  it("Test 9: Industrial Manufacturer diagnosis recommends Custom Site + SEO and rules out minimal 3-page site", () => {
    const report = diagnosisEngine.diagnose({
      businessName: "Bhilai Steel City Engineering Works",
      category: "industrial_manufacturing",
      location: { city: "Bhilai", state: "Chhattisgarh" },
      webPresence: "outdated",
      estimatedMonthlyRevenueInr: 2500000,
    });

    const recommendedKeys = report.recommendedServices.map((r) => r.offerKey);
    assert.ok(recommendedKeys.includes("CUSTOMIZED_WEBSITE"));
    assert.ok(recommendedKeys.includes("SEO"));

    // SEO recommendation has minimum commitment
    const seoRec = report.recommendedServices.find((r) => r.offerKey === "SEO");
    assert.equal(seoRec?.minimumCommitmentMonths, 3);

    // Cheap 3-page site is unrecommended
    const unrecommendedKeys = report.unrecommendedServices.map((u) => u.offerKey);
    assert.ok(unrecommendedKeys.includes("NORMAL_WEBSITE"));
  });
});

describe("StratXcel 10-Dimension Opportunity Scoring Engine", () => {
  const scoringEngine = new OpportunityScoringEngine();

  it("Test 10: High-fit prospect in Raipur with verified phone achieves TIER_1_HOT score", () => {
    const result = scoringEngine.score({
      businessName: "Dr. Agrawal Eye & Dental Care Clinic",
      category: "clinic_healthcare",
      location: { city: "Raipur", state: "Chhattisgarh" },
      hasVerifiedPhone: true,
      hasOwnerPhone: true,
      phone: "+91-771-2423900",
      urgencySignal: "high",
      competitorPressure: "high",
    });

    assert.equal(result.dimensionalBreakdown.length, 10);
    assert.ok(result.totalScore >= 80, `Expected score >= 80, got ${result.totalScore}`);
    assert.equal(result.tier, "TIER_1_HOT");
    assert.ok(result.explainableAuditRationale.includes("TIER_1_HOT"));
  });

  it("Test 11: Disqualifies lead with missing phone and low commercial urgency", () => {
    const result = scoringEngine.score({
      businessName: "Unknown Dormant Shop",
      category: "general_smb",
      location: { city: "Unknown City" },
      hasVerifiedPhone: false,
      hasOwnerPhone: false,
      urgencySignal: "low",
      apparentBudgetComfort: "low",
    });

    assert.ok(result.totalScore < 60);
    assert.ok(result.tier === "TIER_3_COOL" || result.tier === "DISQUALIFIED");
  });
});

describe("Human-Natural WhatsApp Sales Engine", () => {
  const salesEngine = new WhatsAppSalesEngine();

  it("Test 12: Detects conversational language accurately (Hindi, Hinglish, English)", () => {
    assert.equal(salesEngine.detectLanguage("नमस्ते, मुझे वेबसाइट के बारे में बताएं"), "hindi");
    assert.equal(salesEngine.detectLanguage("Kitna kharcha hoga normal website ka bhai?"), "hinglish");
    assert.equal(salesEngine.detectLanguage("Please share the pricing for website development"), "english");
  });

  it("Test 13: Detects 7 psychological conversational states accurately", () => {
    assert.equal(salesEngine.detectPsychologicalState("Kitna kharcha hoga? Koi discount hai?"), "PRICE_FOCUSED");
    assert.equal(salesEngine.detectPsychologicalState("Payment link bhej dijiye, start karte hain"), "READY");
    assert.equal(salesEngine.detectPsychologicalState("Abhi car drive kar raha hoon, baad me baat karte hain"), "BUSY");
    assert.equal(salesEngine.detectPsychologicalState("Pehle kisi agency ne fraud kiya tha, koi guarantee hai?"), "HESITANT");
    assert.equal(salesEngine.detectPsychologicalState("Ye SEO kya hota hai? Samajh nahi aaya"), "CONFUSED");
    assert.equal(salesEngine.detectPsychologicalState("Aapke kuch sample websites ya portfolio dekhna hai"), "INTERESTED");
    assert.equal(salesEngine.detectPsychologicalState("Aap log kya karte hain?"), "CURIOUS");
  });

  it("Test 14: PRICE_FOCUSED response gives canonical starting price without fabricated discounts", () => {
    const response = salesEngine.generateResponse({
      leadId: "lead_test_01",
      businessName: "Chashma Point",
      category: "optical_shop",
      location: { city: "Raipur" },
      currentOfferKey: "NORMAL_WEBSITE",
      lastInboundMessage: "Kitna kharcha hoga?",
    });

    assert.equal(response.detectedState, "PRICE_FOCUSED");
    assert.ok(response.messageText.includes("₹3,000"));
    assert.ok(!response.messageText.includes("50% off") && !response.messageText.includes("special deal for you"));
  });

  it("Test 15: READY response includes secure Razorpay payment link", () => {
    const response = salesEngine.generateResponse({
      leadId: "lead_test_02",
      businessName: "Pulse Fitness",
      category: "gym_fitness",
      location: { city: "Raipur" },
      currentOfferKey: "SOCIAL_MEDIA_STANDARD",
      lastInboundMessage: "Payment link bhejo, shuru karte hain",
      razorpayPaymentUrl: "https://rzp.io/l/stratxcel-growth",
    });

    assert.equal(response.detectedState, "READY");
    assert.equal(response.isPaymentLinkIncluded, true);
    assert.ok(response.messageText.includes("https://rzp.io/l/stratxcel-growth"));
  });

  it("Test 16: Timing engine respects rush hours for restaurants (skips lunch rush)", () => {
    // 1:30 PM (13:30) IST is lunch service rush for restaurants
    const dateLunch = new Date("2026-09-11T08:00:00Z"); // 08:00 UTC = 13:30 IST
    const timing = salesEngine.evaluateTiming("restaurant_cafe", dateLunch);
    assert.equal(timing.isAllowed, false);
    assert.match(timing.reason, /rush hour detected/i);
  });
});

describe("StratXcel Continuous Autonomous Revenue Engine", () => {
  it("Test 17: Executes full autonomous revenue cycle under directive 'GROW STRATXCEL REVENUE'", async () => {
    const engine = new ContinuousRevenueEngine(null, "466e6195-a9f6-4576-8271-29fdae61c18a");
    const result = await engine.runAutonomousCycle({
      tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
      standingDirective: "GROW STRATXCEL REVENUE",
      offerCategory: "STRATXCEL_CORE",
      maxLeadsPerCycle: 4,
    });

    assert.ok(result.steps.length >= 8);
    assert.equal(result.standingDirective, "GROW STRATXCEL REVENUE");
    assert.ok(result.discoveredCount > 0);
    assert.ok(result.qualifiedCount > 0);
    assert.ok(result.revenueProjectedInr > 0);
    assert.ok(result.learningsRecorded >= 1);
  });
});
