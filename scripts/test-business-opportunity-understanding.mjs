/**
 * Comprehensive Test Suite for Business Opportunity Understanding Engine
 * Validates:
 * 1. 16-dimension autonomous inference from informal natural language
 * 2. Generalization to unseen business verticals without hardcoded playbooks
 * 3. Proper handling of unknowns (never invent information, generate research mandates)
 * 4. Multi-turn conversational state refinement
 * 5. Full Hermes CEO autonomous execution with grounded real-world lead discovery
 * 6. Intent decomposer routing to hermes.ceo_objective
 */

import assert from "node:assert/strict";
import {
  businessOpportunityUnderstanding,
  hermesExecutiveBrain,
  discoverGroundedLeads,
} from "../packages/workforce-core/src/index.ts";
import { decomposeNaturalLanguageIntent } from "../packages/connectors/src/resources/intent-decomposer.ts";

async function runTests() {
  console.log("================================================================================");
  console.log("HERMES CEO - BUSINESS OPPORTUNITY UNDERSTANDING ENGINE TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function record(title, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${title}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${title}`);
      console.error(err);
      failed++;
    }
  }

  async function recordAsync(title, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${title}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${title}`);
      console.error(err);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Canonical Solar Referral / Commission Statement
  // ---------------------------------------------------------------------------
  record("1. Understand Solar Commission Partnership (Inferred, not hardcoded)", () => {
    const statement = "My friend has opened a solar panel installation business. We get a commission for every customer we bring him. Start getting leads for him.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.commercialModel.type, "commission");
    assert.equal(analysis.partiesInvolved.externalParty.hasExternalParty, true);
    assert.equal(analysis.partiesInvolved.stratxcelRole, "lead_generation_partner");
    assert.equal(analysis.partiesInvolved.fulfillmentOwner, "external_partner");
    assert.ok(analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("solar"));
    assert.ok(analysis.operatingStrategy.requiredCapabilities.includes("lead_generation"));
    assert.ok(analysis.operatingStrategy.requiredCapabilities.includes("lead_qualification"));
    assert.ok(analysis.operatingStrategy.firstAction.toLowerCase().includes("research"));
    assert.ok(analysis.desiredOutcome.acceptanceCriteria.some(c => c.toLowerCase().includes("qualified")));
    console.log(`   Inferred Commercial Model: ${analysis.commercialModel.type}`);
    console.log(`   StratXcel Role: ${analysis.partiesInvolved.stratxcelRole}`);
    console.log(`   Monetization: ${analysis.commercialModel.monetizationMechanism}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Canonical Russia MBBS Admissions
  // ---------------------------------------------------------------------------
  record("2. Understand Russia MBBS Admissions Partnership", () => {
    const statement = "My friend runs an MBBS admissions business in Russia and we make money when students enroll. Help us grow it.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.partiesInvolved.externalParty.hasExternalParty, true);
    assert.equal(analysis.partiesInvolved.fulfillmentOwner, "external_partner");
    assert.ok(analysis.commercialModel.type === "commission" || analysis.commercialModel.type === "referral");
    assert.ok(
      analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("mbbs") ||
      analysis.businessConcept.offeringName.toLowerCase().includes("mbbs") ||
      analysis.businessConcept.offeringName.toLowerCase().includes("admissions")
    );
    assert.ok(analysis.businessConcept.industrySector.includes("Education") || analysis.businessConcept.industrySector.includes("Admissions"));
    assert.ok(analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("student") || analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("aspirant"));
    assert.ok(analysis.desiredOutcome.acceptanceCriteria.some(c => c.toLowerCase().includes("enrollment") || c.toLowerCase().includes("lead") || c.toLowerCase().includes("student")));
  });

  // ---------------------------------------------------------------------------
  // TEST 3: SaaS Monetization (Internal Product, not external friend)
  // ---------------------------------------------------------------------------
  record("3. Understand Internal SaaS Product Monetization", () => {
    const statement = "We have a new SaaS product. Figure out how we can make money from it.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.partiesInvolved.externalParty.hasExternalParty, false);
    assert.equal(analysis.partiesInvolved.fulfillmentOwner, "stratxcel");
    assert.equal(analysis.commercialModel.type, "saas_subscription");
    assert.equal(analysis.partiesInvolved.stratxcelRole, "direct_seller");
    assert.ok(analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("saas") || analysis.businessConcept.offeringName.toLowerCase().includes("saas"));
    assert.ok(analysis.operatingStrategy.requiredCapabilities.includes("product_marketing") || analysis.operatingStrategy.requiredCapabilities.includes("crm_pipeline"));
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Referral Business with Incomplete Details (Handle Unknowns)
  // ---------------------------------------------------------------------------
  record("4. Referral Business with Unknown Details Triggers Research Mandates", () => {
    const statement = "My friend started a business. We can earn from referrals. See whether there is an opportunity.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.commercialModel.type, "referral");
    assert.equal(analysis.partiesInvolved.stratxcelRole, "referral_partner");
    assert.equal(analysis.desiredOutcome.intentCategory, "evaluate_opportunity");
    // Unknowns must be explicitly captured, not fabricated
    assert.ok(analysis.explicitUnknowns.length > 0);
    assert.ok(analysis.researchMandates.length > 0);
    const hasOfferingResearch = analysis.researchMandates.some(r => r.question.toLowerCase().includes("product") || r.question.toLowerCase().includes("offering") || r.area === "market_demand");
    assert.ok(hasOfferingResearch, "Should mandate research into what the business actually sells");
    console.log(`   Explicit Unknowns: ${analysis.explicitUnknowns.join(" | ")}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Customer Acquisition Intent ("Take care of it")
  // ---------------------------------------------------------------------------
  record("5. Partner Wants Customers ('Take care of it')", () => {
    const statement = "I found a company that wants customers. We can make money by bringing them business. Take care of it.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.partiesInvolved.stratxcelRole, "customer_acquisition_partner");
    assert.equal(analysis.partiesInvolved.fulfillmentOwner, "external_partner");
    assert.ok(analysis.operatingStrategy.requiredCapabilities.includes("lead_generation"));
    assert.ok(analysis.operatingStrategy.requiredCapabilities.includes("crm_pipeline"));
    assert.ok(analysis.explicitUnknowns.some(u => u.toLowerCase().includes("company") || u.toLowerCase().includes("offering") || u.toLowerCase().includes("product")));
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Highly Ambiguous Statement ("Make money from this opportunity")
  // ---------------------------------------------------------------------------
  record("6. High Ambiguity Statement Preserves Unknowns Without Hallucinating", () => {
    const statement = "I want to make money from this opportunity.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.desiredOutcome.intentCategory, "evaluate_opportunity");
    assert.ok(analysis.explicitUnknowns.length >= 2);
    assert.ok(analysis.operatingStrategy.verificationRequirements.length >= 2);
    // Does NOT claim to be solar or MBBS
    assert.ok(!analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("solar"));
    assert.ok(!analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("mbbs"));
  });

  // ---------------------------------------------------------------------------
  // TEST 7: UNSEEN VERTICAL 1 - Commercial Bakery Equipment in Ahmedabad (5% referral)
  // ---------------------------------------------------------------------------
  record("7. UNSEEN VERTICAL: Commercial Bakery Equipment in Ahmedabad (5% referral)", () => {
    const statement = "My friend sells commercial bakery equipment in Ahmedabad. We get 5% referral fee on any closed deal. Get buyers.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.commercialModel.type, "referral");
    assert.equal(analysis.commercialModel.commissionOrRevShareRate, "5%");
    assert.ok(analysis.targetMarket.targetGeography.includes("Ahmedabad"));
    assert.ok(analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("bakery"));
    assert.ok(
      analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("baker") ||
      analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("food") ||
      analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("kitchen") ||
      analysis.targetMarket.buyerPersona.toLowerCase().includes("bakery")
    );
    assert.equal(analysis.partiesInvolved.fulfillmentOwner, "external_partner");
    assert.equal(analysis.partiesInvolved.stratxcelRole, "referral_partner");
    console.log(`   Inferred Sold: ${analysis.businessConcept.productOrServiceDescription}`);
    console.log(`   Customer Segment: ${analysis.targetMarket.primaryCustomerSegment}`);
    console.log(`   Geography: ${analysis.targetMarket.targetGeography}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 8: UNSEEN VERTICAL 2 - Corporate IP Law Firm in Pune (15% rev share)
  // ---------------------------------------------------------------------------
  record("8. UNSEEN VERTICAL: Corporate IP Law Firm in Pune (15% rev share)", () => {
    const statement = "I met a boutique corporate IP law firm in Pune. They want tech startup clients for patent filings and offer 15% revenue share.";
    const analysis = businessOpportunityUnderstanding.understandOpportunity(statement);

    assert.equal(analysis.commercialModel.type, "revenue_share");
    assert.equal(analysis.commercialModel.commissionOrRevShareRate, "15%");
    assert.ok(analysis.targetMarket.targetGeography.includes("Pune"));
    assert.ok(analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("patent") || analysis.businessConcept.productOrServiceDescription.toLowerCase().includes("ip"));
    assert.ok(analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("tech") || analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("startup"));
    assert.equal(analysis.partiesInvolved.stratxcelRole, "revenue_share_partner");
    console.log(`   Inferred Sold: ${analysis.businessConcept.productOrServiceDescription}`);
    console.log(`   Customer Segment: ${analysis.targetMarket.primaryCustomerSegment}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Grounded Lead Discovery for Unseen Verticals (Zero Synthetic Data)
  // ---------------------------------------------------------------------------
  await recordAsync("9. Grounded Lead Discovery for Commercial Bakery and IP Law Verticals", async () => {
    const bakeryResult = await discoverGroundedLeads({
      tenantId: "test-tenant-bakery",
      missionId: "mission-bakery-01",
      offerCategory: "BAKERY_EQUIPMENT",
      geographyFilter: "Ahmedabad, Gujarat",
    });
    assert.ok(bakeryResult.leads.length >= 4);
    assert.ok(bakeryResult.leads.some(l => l.companyName.includes("Monginis")));
    assert.ok(bakeryResult.leads.some(l => l.companyName.includes("Havmor")));
    assert.ok(bakeryResult.leads.every(l => l.provenance.verificationStatus === "VERIFIED"));
    assert.ok(bakeryResult.leads.every(l => l.provenance.source.length > 0));

    const ipResult = await discoverGroundedLeads({
      tenantId: "test-tenant-ip",
      missionId: "mission-ip-01",
      offerCategory: "CORPORATE_IP_LAW",
      geographyFilter: "Pune, Maharashtra",
    });
    assert.ok(ipResult.leads.length >= 4);
    assert.ok(ipResult.leads.some(l => l.companyName.includes("Druva")));
    assert.ok(ipResult.leads.some(l => l.companyName.includes("Icertis")));
    assert.ok(ipResult.leads.every(l => l.provenance.verificationStatus === "VERIFIED"));
    assert.ok(ipResult.leads.every(l => l.provenance.source.length > 0));
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Multi-Turn Conversational State Refinement
  // ---------------------------------------------------------------------------
  record("10. Multi-Turn Conversational State Refinement (In-Place Evolution)", () => {
    // Turn 1: Initial statement
    let analysis = businessOpportunityUnderstanding.understandOpportunity(
      "My friend has opened a business. We can earn money by bringing him customers. Take care of it."
    );
    assert.ok(analysis.targetMarket.targetGeography.includes("Explicitly unstated"));

    // Turn 2: "Focus on Durg first."
    analysis = businessOpportunityUnderstanding.refineOpportunityWithFeedback(analysis, "Focus on Durg first.");
    assert.equal(analysis.targetMarket.targetGeography, "Durg");

    // Turn 3: "Don't spend much money."
    analysis = businessOpportunityUnderstanding.refineOpportunityWithFeedback(analysis, "Don't spend much money.");
    assert.ok(analysis.operatingStrategy.recommendedChannels.some(c => c.toLowerCase().includes("organic") || c.toLowerCase().includes("direct")));

    // Turn 4: "Leads are poor."
    analysis = businessOpportunityUnderstanding.refineOpportunityWithFeedback(analysis, "Leads are poor.");
    assert.ok(analysis.desiredOutcome.acceptanceCriteria.some(c => c.includes("85%")));

    // Turn 5: "Get serious commercial customers."
    analysis = businessOpportunityUnderstanding.refineOpportunityWithFeedback(analysis, "Get serious commercial customers.");
    assert.ok(
      analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("commercial") ||
      analysis.targetMarket.primaryCustomerSegment.toLowerCase().includes("enterprise")
    );

    // Turn 6: "Create whatever team you need."
    analysis = businessOpportunityUnderstanding.refineOpportunityWithFeedback(analysis, "Create whatever team you need.");
    assert.ok(analysis.operatingStrategy.requiredCapabilities.includes("agent.provision_specialist"));

    assert.equal(analysis.amendments.length, 5);
    console.log(`   Final Refined Geography: ${analysis.targetMarket.targetGeography}`);
    console.log(`   Final Strategy First Action: ${analysis.operatingStrategy.firstAction}`);
    console.log(`   Total Conversational Amendments: ${analysis.amendments.length}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 11: End-to-End Hermes Executive Brain Autonomous Execution on Unseen Vertical
  // ---------------------------------------------------------------------------
  await recordAsync("11. Hermes CEO Executes Objective on Unseen Vertical End-to-End", async () => {
    const directive = "My friend sells commercial bakery equipment in Ahmedabad. We get 5% referral fee on any closed deal. Get buyers.";
    const result = await hermesExecutiveBrain.executeExecutiveObjective({
      directive,
      targetQuantity: 10,
      tenantId: "tenant-bakery-01",
    });

    assert.ok(result.missionId);
    assert.ok(["COMPLETED", "IN_PROGRESS"].includes(result.status));
    assert.ok(result.opportunityAnalysis);
    assert.equal(result.opportunityAnalysis.commercialModel.type, "referral");
    assert.ok(result.leadsSummary.total >= 4);
    assert.ok(result.leadsSummary.qualified >= 4);
    assert.equal(result.revenueSummary.closedCents, 0); // Strict revenue truth (0 until closed customer pays)
    assert.ok(
      result.reasoning.nextActionAfterCompletion.toLowerCase().includes("qualif") ||
      result.reasoning.nextActionAfterCompletion.toLowerCase().includes("outreach") ||
      result.overallMessage.length > 0
    );
    console.log(`   Executed Mission: ${result.missionId}`);
    console.log(`   Discovered Grounded Leads: ${result.leadsSummary.total}`);
    console.log(`   CRM Records Created: ${result.leadsSummary.qualified}`);
    console.log(`   Status: ${result.status}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Intent Decomposer Routes All Opportunity Statements to hermes.ceo_objective
  // ---------------------------------------------------------------------------
  record("12. Intent Decomposer Generalization Test", () => {
    const statements = [
      "My friend has opened a solar panel installation business. We get a commission for every customer we bring him. Start getting leads for him.",
      "My friend runs an MBBS admissions business in Russia and we make money when students enroll. Help us grow it.",
      "We have a new SaaS product. Figure out how we can make money from it.",
      "My friend started a business. We can earn from referrals. See whether there is an opportunity.",
      "I found a company that wants customers. We can make money by bringing them business. Take care of it.",
      "I want to make money from this opportunity.",
      "My friend sells commercial bakery equipment in Ahmedabad. We get 5% referral fee on any closed deal. Get buyers.",
      "I met a boutique corporate IP law firm in Pune. They want tech startup clients for patent filings and offer 15% revenue share.",
      "Start growing this business.",
      "Find the best way for us to monetize this.",
    ];

    for (const stmt of statements) {
      const plan = decomposeNaturalLanguageIntent(stmt);
      assert.equal(plan.tasks[0]?.capabilityKey, "hermes.ceo_objective", `Failed to route: "${stmt}"`);
    }
  });

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
