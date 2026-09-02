import assert from "node:assert/strict";
import { runWebsiteIntelligencePipeline } from "../../../../lib/intelligence/website-intelligence.ts";
import { synthesizeBusinessRequirements } from "../../../../lib/intelligence/requirements/requirement-engine.ts";
import { generateTailoredCustomerPlans } from "../../../../lib/commercial/plan-engine.ts";
import { ValueLedgerService } from "../../../../lib/reporting/value-ledger.ts";
import { handleWhatsAppCopilotMessage, type CopilotContext } from "../../../whatsapp/src/copilot/copilot-agent.ts";
import { MonthlyRenewalEngine } from "../../../../lib/billing/monthly-cycle.ts";
import { getAgentDefinition } from "../../../hermes/src/registry/agent-registry.ts";

/**
 * ValueLedgerService is now real, Postgres-backed (value-ledger.ts's own
 * header comment -- fixed from an in-memory Map, Update 60). Stays
 * isolated from any live database via the same constructor injection
 * point the real service supports.
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
                  return { order() { return Promise.resolve({ data: afterSecond, error: null }); } };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function testAutonomousGrowthOperatingSystemE2E() {
  console.log("================================================================================");
  console.log("STARTING STRATXCEL AUTONOMOUS GROWTH OS MASTER E2E INTEGRATION JOURNEY");
  console.log("================================================================================");

  // STEP 1 & 2: Business Owner enters website & creates identity
  const websiteUrl = "https://national-grocery.in";
  const tenantId = "tenant-e2e-national-grocery";

  console.log("\n[Step 1 & 2] Ingesting business website & identity...");
  const mockHtml = `
    <!DOCTYPE html><html><head>
      <title>National Grocery & Daily Mart</title>
      <meta name="description" content="Quality fresh provisions and household goods in Raipur." />
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "GeneralStore",
        "name": "National Grocery Mart",
        "address": "Main Road, Pandri, Raipur, Chhattisgarh",
        "openingHours": "Mo-Su 07:30-22:00"
      }
      </script>
    </head><body>
      <h1>National Grocery Mart</h1>
      <p>Serving families since 2012 with fresh grains, pulses, dairy, and essentials.</p>
      <h2>Services</h2>
      <ul><li>Same-day home delivery</li><li>Fresh local dairy</li><li>Monthly grocery bundles</li></ul>
      <a href="https://wa.me/917711223344">Order on WhatsApp</a>
    </body></html>
  `;
  const mockFetcher = async () => new Response(mockHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const mockResolver = async () => [{ address: "104.21.5.10", family: 4 }];

  // STEP 3, 4, 5: Intelligent Crawl + Normalization (Zero-Hallucination Evidence)
  console.log("[Step 3, 4, 5] Crawling website & extracting verified business facts...");
  const webIntelligence = await runWebsiteIntelligencePipeline(websiteUrl, {
    fetcher: mockFetcher as any,
    resolver: mockResolver as any,
  });

  assert.equal(webIntelligence.identity.businessName.value, "National Grocery Mart");
  assert.equal(webIntelligence.identity.businessName.confidence, "HIGH");
  assert.ok(webIntelligence.business.businessType.value.includes("General Store"));
  assert.equal(webIntelligence.conversion.whatsapp.value, "https://wa.me/917711223344");

  // Facts Rule Verification: Missing facts MUST be UNKNOWN
  assert.equal(webIntelligence.audience.targetAudience.value, "UNKNOWN");

  // STEP 6, 7, 8: Brand Brain & Free Audit Funnel
  console.log("[Step 6, 7, 8] Creating Brand Brain and generating free personalized audit...");
  const brandBrainContent = {
    business_name: webIntelligence.identity.businessName.value,
    industry: webIntelligence.business.industry.value,
    business_type: webIntelligence.business.businessType.value,
    website_url: websiteUrl,
    whatsapp_number: webIntelligence.conversion.whatsapp.value,
    locations: webIntelligence.business.locations.value,
  };
  assert.equal(brandBrainContent.business_name, "National Grocery Mart");

  // STEP 9: Requirement Intelligence (General Store Heuristic)
  console.log("[Step 9] Requirement Intelligence synthesizing actual business needs...");
  const requirementSynthesis = synthesizeBusinessRequirements({
    tenantId,
    businessName: brandBrainContent.business_name,
    businessType: brandBrainContent.business_type,
    industry: brandBrainContent.industry,
    operatingLocations: brandBrainContent.locations,
    websiteIntelligence: webIntelligence,
    connectedAssets: {
      googleBusiness: true,
      whatsapp: true,
      instagram: false,
      facebook: false,
    },
  });

  assert.ok(requirementSynthesis.highPriorityCount >= 2);
  const socialReq = requirementSynthesis.requirements.find((r) => r.requirementKey === "social_autopilot");
  assert.equal(
    socialReq?.priority,
    "NOT_CURRENTLY_REQUIRED",
    "General Store MUST NOT have unneeded social autopilot forced upon it",
  );

  // STEP 10, 11, 12: Service Mapping, Deterministic Cost Brain & Plan Generation
  console.log("[Step 10, 11, 12] Generating Recommended Premium Plan and Standard Alternative...");
  const planProposal = generateTailoredCustomerPlans(
    brandBrainContent.business_name,
    requirementSynthesis,
    { tenantId, cycleMonth: "2026-08" },
  );

  assert.equal(planProposal.recommendedPremiumPlan.tier, "Premium");
  assert.equal(planProposal.standardAlternativePlan.tier, "Standard");
  assert.ok(
    planProposal.recommendedPremiumPlan.monthlyPriceRupees >
      planProposal.standardAlternativePlan.monthlyPriceRupees,
  );
  assert.ok(planProposal.tradeoffs.qualityDifferences.length > 0);

  // STEP 13, 14: Payment & Server-Side Entitlement Snapshot
  console.log("[Step 13, 14] Simulating customer checkout & snapshotting active entitlements...");
  const activePlanSnapshot = {
    planId: "plan-e2e-premium-01",
    tenantId,
    tier: planProposal.recommendedPremiumPlan.tier,
    title: planProposal.recommendedPremiumPlan.title,
    monthlyPriceRupees: planProposal.recommendedPremiumPlan.monthlyPriceRupees,
    entitledServices: planProposal.recommendedPremiumPlan.items.map((i) => i.serviceKey),
    status: "ACTIVE",
    cycleMonth: "2026-08",
  };

  // STEP 15 & 16: Hermes Orchestrator + Workforce Execution
  console.log("[Step 15 & 16] Hermes orchestrating missions and delegating to Workforce...");
  const orchestratorDef = getAgentDefinition("stratxcel-orchestrator");
  assert.ok(orchestratorDef);
  assert.equal(orchestratorDef.category, "CORE");

  const ledger = new ValueLedgerService(createFakeLedgerSupabase());
  // handleWhatsAppCopilotMessage's ASK_TODAYS_WORK handler always reads
  // real wall-clock "today" (new Date().toISOString().slice(0, 7)), never
  // a caller-supplied cycleMonth -- so these two deliverables, which the
  // WhatsApp check below reads back, must be recorded under whatever month
  // the test is actually running in, not a fixed "2026-08" (a real,
  // pre-existing, date-hardcoded fragility found while re-verifying this
  // test after the ValueLedgerService persistence fix -- unrelated to that
  // fix itself, but caught in the same pass). Every other cycleMonth in
  // this file (plan/entitlement snapshots, the 26th-report simulation) is
  // an explicit, caller-controlled input and correctly stays "2026-08".
  const currentMonthForCopilot = new Date().toISOString().slice(0, 7);

  // Execute Task 1: Google Business Profile Optimization
  await ledger.recordDeliverable({
    tenantId,
    cycleMonth: currentMonthForCopilot,
    serviceKey: "google_business_optimization",
    deliverableTitle: "Google Business Category & Catalog Sync",
    deliverableSummary: "Updated primary retail categories and synced 24 weekly household essential products.",
    resultMetric: "Search Impressions",
    resultValue: "+38%",
  });

  // Execute Task 2: Review Management Campaign
  await ledger.recordDeliverable({
    tenantId,
    cycleMonth: currentMonthForCopilot,
    serviceKey: "review_management",
    deliverableTitle: "WhatsApp Review Collection Campaign",
    deliverableSummary: "Dispatched automated post-purchase review invites to recent customers.",
    resultMetric: "New 5-Star Reviews",
    resultValue: "+14",
  });

  // STEP 17 & 18: Value Ledger Verification & WhatsApp Daily Reporting
  console.log("[Step 17 & 18] Customer receives daily update on WhatsApp...");
  const copilotCtx: CopilotContext = {
    tenantId,
    businessName: brandBrainContent.business_name,
    activePlan: activePlanSnapshot,
    ledger,
  };

  const todaysWorkResponse = await handleWhatsAppCopilotMessage("What did you do today?", copilotCtx);
  assert.equal(todaysWorkResponse.intent, "ASK_TODAYS_WORK");
  assert.ok(todaysWorkResponse.replyText.includes("Google Business Category & Catalog Sync"));

  // STEP 19: Customer Copilot Interaction & Entitlement Safety
  console.log("[Step 19] Customer asks questions and requests commands via Copilot...");
  const planInfoResponse = await handleWhatsAppCopilotMessage("How much am I paying and what is included?", copilotCtx);
  assert.equal(planInfoResponse.intent, "ASK_CURRENT_PLAN");
  assert.ok(planInfoResponse.replyText.includes(activePlanSnapshot.monthlyPriceRupees.toLocaleString("en-IN")));
  assert.ok(planInfoResponse.replyText.includes(activePlanSnapshot.title));

  // Test unentitled command safety
  const unentitledPostResponse = await handleWhatsAppCopilotMessage("Create an ad campaign on Instagram", copilotCtx);
  assert.equal(unentitledPostResponse.actionTaken?.type, "UPGRADE_REQUIRED");

  // STEP 20, 21, 22: 26th Monthly Report & Adaptive Recalculation
  console.log("[Step 20, 21, 22] Executing 26th Monthly Work & Value Report + Next Month Adaptation...");
  const renewalEngine = new MonthlyRenewalEngine();

  const monthlyRecap = await renewalEngine.execute26thMonthlyReport({
    tenantId,
    businessName: brandBrainContent.business_name,
    businessType: brandBrainContent.business_type,
    industry: brandBrainContent.industry,
    operatingLocations: brandBrainContent.locations,
    currentPlanMrpRupees: activePlanSnapshot.monthlyPriceRupees,
    cycleMonth: currentMonthForCopilot,
    ledger,
  });

  assert.equal(monthlyRecap.valueReport.totalDeliverablesCompleted, 2);
  assert.ok(monthlyRecap.adaptation.proposedPlan.recommendedPremiumPlan);

  // Check 26th Idempotency
  const recapDuplicate = await renewalEngine.execute26thMonthlyReport({
    tenantId,
    businessName: brandBrainContent.business_name,
    businessType: brandBrainContent.business_type,
    industry: brandBrainContent.industry,
    operatingLocations: brandBrainContent.locations,
    currentPlanMrpRupees: activePlanSnapshot.monthlyPriceRupees,
    cycleMonth: currentMonthForCopilot,
    ledger,
  });
  assert.equal(monthlyRecap.generatedAt, recapDuplicate.generatedAt);

  console.log("\n================================================================================");
  console.log("SUCCESS: FULL E2E JOURNEY COMPLETED 100% WITH ALL INVARIANTS PRESERVED!");
  console.log("================================================================================");
}

testAutonomousGrowthOperatingSystemE2E().catch((err) => {
  console.error("E2E Integration test failed:", err);
  process.exit(1);
});
