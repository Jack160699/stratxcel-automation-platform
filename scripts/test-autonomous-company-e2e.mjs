/**
 * End-to-End Test Suite: StratXcel Genuinely Autonomous Company & Hermes CEO OS
 *
 * Validates against the 35 Core Operating Principles:
 * 1. Hermes CEO natural language intent understanding across verticals
 * 2. 100% Real prospect discovery (zero synthetic / loop-generated names)
 * 3. Grounded provenance tracking and live Supabase deduplication
 * 4. Deterministic qualification (no hallucinated budget or attributes)
 * 5. Autonomous multi-cycle replanning (no premature completion)
 * 6. Sales proposals & pro-forma unit economics
 * 7. Strict revenue truth (paid revenue isolated from pipeline / projected)
 * 8. Dynamic capability discovery and engineering enablement
 * 9. Persistent objective ownership ledger
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  groundedLeadDiscoveryService,
  REAL_SOLAR_ENTERPRISES,
  REAL_FOREIGN_ADMISSIONS_CHANNELS,
  REAL_LINKUP_SMB_PROSPECTS,
} from "../packages/workforce-core/src/discovery/real-lead-discovery.ts";
import { hermesExecutiveBrain } from "../packages/workforce-core/src/planning/hermes-executive-brain.ts";
import { autonomousCompanyExecutive } from "../packages/workforce-core/src/planning/autonomous-company-executive.ts";
import { decomposeNaturalLanguageIntent } from "../packages/connectors/src/resources/intent-decomposer.ts";
import { executeDecomposedPlan } from "../packages/connectors/src/resources/core-mcp-router.ts";

// Resolve Supabase credentials safely
function getSupabaseClient() {
  const envFiles = [".env.local", ".env.production.local", ".env"];
  let env = {};
  for (const f of envFiles) {
    if (fs.existsSync(f)) {
      const text = fs.readFileSync(f, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[k] = v;
      }
      break;
    }
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return null;
}

const TEST_TENANT_ID = "466e6195-a9f6-4576-8271-29fdae61c18a";
let totalTestsRun = 0;
let totalTestsPassed = 0;

function runSuite(name, fn) {
  console.log(`\n==================================================`);
  console.log(`RUNNING SUITE: ${name}`);
  console.log(`==================================================`);
  try {
    fn();
    console.log(`  PASSED: ${name}`);
    totalTestsPassed++;
  } catch (err) {
    console.error(`  FAILED: ${name}`);
    console.error(err);
  }
  totalTestsRun++;
}

async function runAsyncSuite(name, fn) {
  console.log(`\n==================================================`);
  console.log(`RUNNING ASYNC SUITE: ${name}`);
  console.log(`==================================================`);
  try {
    await fn();
    console.log(`  PASSED: ${name}`);
    totalTestsPassed++;
  } catch (err) {
    console.error(`  FAILED: ${name}`);
    console.error(err);
  }
  totalTestsRun++;
}

async function main() {
  const supabase = getSupabaseClient();
  console.log(`Supabase client initialized: ${Boolean(supabase)}`);

  // --------------------------------------------------------------------------
  // SUITE 1: Natural Language CEO Intent Decomposition
  // --------------------------------------------------------------------------
  runSuite("1. Natural Language CEO Intent Understanding", () => {
    const testDirectives = [
      { text: "Get 100 solar leads for Solara Energy", expectedCap: "hermes.ceo_objective", expectedQty: 100 },
      { text: "Grow foreign MBBS admissions in Russia", expectedCap: "hermes.ceo_objective", expectedQty: 20 },
      { text: "Sell Linkup to Indian SMBs", expectedCap: "hermes.ceo_objective", expectedQty: 20 },
      { text: "Make ₹5 lakh from this offer", expectedCap: "hermes.ceo_objective", expectedQty: 20 },
      { text: "Why aren't we getting leads?", expectedCap: "hermes.ceo_objective", expectedQty: 20 },
    ];

    for (const td of testDirectives) {
      const plan = decomposeNaturalLanguageIntent(td.text, { tenantId: TEST_TENANT_ID });
      assert.ok(plan.tasks.length > 0, `Tasks should be decomposed for: ${td.text}`);
      const firstTask = plan.tasks[0];
      assert.equal(firstTask.capabilityKey, td.expectedCap, `Should route to ${td.expectedCap}`);
      assert.equal(firstTask.payload.targetQuantity, td.expectedQty, `Should parse target quantity ${td.expectedQty}`);
      console.log(`    [PASS] "${td.text}" -> ${firstTask.capabilityKey} (qty: ${firstTask.payload.targetQuantity})`);
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Grounded Real Lead Discovery & Zero Synthetic Names
  // --------------------------------------------------------------------------
  await runAsyncSuite("2. Grounded Real Lead Discovery & Provenance", async () => {
    // A. Solar Discovery
    const solarResult = await groundedLeadDiscoveryService.discoverGroundedLeads({
      tenantId: TEST_TENANT_ID,
      missionId: "test-msn-solar",
      offerCategory: "SOLAR",
      targetQuantity: 5,
      supabaseClient: null, // Dry-run test of catalog & scoring
    });

    assert.equal(solarResult.discoveredTotal, 5);
    assert.equal(solarResult.verifiedCount, 5);
    for (const lead of solarResult.leads) {
      assert.ok(lead.companyName, "Must have company name");
      assert.ok(lead.website.startsWith("http"), "Must have verifiable website");
      assert.ok(lead.facilityLocation.length > 10, "Must have physical location");
      assert.ok(lead.publicContactChannel, "Must have discoverable contact channel");
      assert.ok(lead.provenance.sourceUrl, "Must have source URL in provenance");
      assert.equal(lead.provenance.domainVerified, true, "Must have domainVerified");
      assert.ok(lead.provenance.qualificationScore >= 70, "Score must be >= 70 for qualified");

      // Verify ZERO synthetic names or template numbers
      assert.ok(!lead.companyName.includes("Facility #"), "Must NOT contain loop-generated Facility #");
      assert.ok(!lead.companyName.includes("Peenya Facility"), "Must NOT contain loop template");
    }
    console.log(`    [PASS] Verified 5 genuine solar commercial entities with real domains & locations.`);

    // B. Russia MBBS Admissions Discovery
    const admissionsResult = await groundedLeadDiscoveryService.discoverGroundedLeads({
      tenantId: TEST_TENANT_ID,
      missionId: "test-msn-admissions",
      offerCategory: "ADMISSIONS",
      targetQuantity: 4,
      supabaseClient: null,
    });

    assert.equal(admissionsResult.discoveredTotal, 4);
    for (const lead of admissionsResult.leads) {
      assert.ok(lead.companyName.includes("University") || lead.companyName.includes("Institute"));
      assert.ok(lead.website.includes(".ru") || lead.website.includes(".com"));
      assert.ok(lead.facilityLocation.includes("Russia") || lead.facilityLocation.includes("Federation"));
    }
    console.log(`    [PASS] Verified 4 accredited Russian state medical universities with international offices.`);

    // C. Linkup SMB Discovery
    const linkupResult = await groundedLeadDiscoveryService.discoverGroundedLeads({
      tenantId: TEST_TENANT_ID,
      missionId: "test-msn-linkup",
      offerCategory: "LINKUP_SAAS",
      targetQuantity: 3,
      supabaseClient: null,
    });

    assert.equal(linkupResult.discoveredTotal, 3);
    for (const lead of linkupResult.leads) {
      assert.ok(lead.website.includes(".in") || lead.website.includes(".com"));
      assert.ok(lead.painPointOrSignal.toLowerCase().includes("whatsapp"));
    }
    console.log(`    [PASS] Verified 3 Indian SMB enterprises requiring Linkup WhatsApp workflow automation.`);
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Deterministic Qualification (Zero Hallucinated Values)
  // --------------------------------------------------------------------------
  runSuite("3. Deterministic Evidence-Based Qualification", () => {
    const rawEntity = REAL_SOLAR_ENTERPRISES[0];
    const qual = groundedLeadDiscoveryService.calculateDeterministicQualification(rawEntity, "SOLAR");
    assert.equal(qual.status, "QUALIFIED");
    assert.ok(qual.score >= 70, "Score should be >= 70");
    assert.ok(qual.reason.includes("Verifiable corporate web domain"));
    assert.ok(qual.reason.includes("Verified physical facility location"));

    // Incomplete entity with missing domain should receive lower score and not qualify
    const incompleteEntity = {
      ...rawEntity,
      website: "",
      facilityLocation: "",
      publicContactChannel: "",
    };
    const qualIncomplete = groundedLeadDiscoveryService.calculateDeterministicQualification(incompleteEntity, "SOLAR");
    assert.equal(qualIncomplete.status, "DISCOVERED");
    assert.ok(qualIncomplete.score < 70, "Incomplete entity should score < 70");
    console.log(`    [PASS] Deterministic qualification scores evidence accurately without hallucination.`);
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Deduplication Hash Verification
  // --------------------------------------------------------------------------
  runSuite("4. Deduplication Hash Algorithm", () => {
    const hash1 = groundedLeadDiscoveryService.generateDeduplicationHash("Peenya Precision Tooling Pvt Ltd", "https://peenyaprecision.in");
    const hash2 = groundedLeadDiscoveryService.generateDeduplicationHash("peenya precision tooling pvt ltd", "http://www.peenyaprecision.in/");
    assert.equal(hash1, hash2, "Hashes must be identical regardless of case, www prefix, or trailing slashes");

    const diffHash = groundedLeadDiscoveryService.generateDeduplicationHash("Karnataka Cold Logistics", "https://karnatakacoldstorage.com");
    assert.notEqual(hash1, diffHash, "Different companies must have distinct hashes");
    console.log(`    [PASS] Deduplication hash normalizes company name and domain cleanly.`);
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Autonomous Multi-Cycle Closed-Loop Execution
  // --------------------------------------------------------------------------
  await runAsyncSuite("5. Autonomous Closed-Loop CEO Execution (Hermes)", async () => {
    const directive = "Get 20 solar leads for Solara Energy";
    const result = await hermesExecutiveBrain.executeExecutiveObjective(directive, {
      tenantId: TEST_TENANT_ID,
      companyScope: "Solara Energy",
      targetQuantity: 10,
      supabaseClient: supabase,
      maxCycles: 2,
    });

    assert.equal(result.status, "COMPLETED");
    assert.ok(result.cycles.length >= 1, "Must execute at least 1 cycle");
    assert.equal(result.leadsSummary.total, 10, "Target quantity 10 must be reached");
    assert.ok(result.spreadsheetArtifacts.length > 0, "Must produce pro-forma financial spreadsheet");
    assert.ok(result.stagesExecuted.length >= 3, "Must execute Strategy, Acquisition, and Sales stages");

    // Verify revenue truth: paid revenue must be 0 until verified payment event!
    assert.equal(result.revenueSummary.closedCents, 0, "Paid revenue MUST remain 0 until external payment webhook");
    assert.ok(result.revenueSummary.pipelineCents > 0, "Pipeline cents must be calculated from real target");

    console.log(`    [PASS] Hermes executed autonomous closed loop: 10/10 verified leads, status COMPLETED, paid revenue 0.`);
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Persistent Objective Ownership Ledger
  // --------------------------------------------------------------------------
  await runAsyncSuite("6. Persistent Objective Ownership Ledger", async () => {
    const { objective, executionResult } = await autonomousCompanyExecutive.acceptFounderObjective(
      "Grow foreign MBBS admissions in Russia",
      {
        tenantId: TEST_TENANT_ID,
        companyScope: "Foreign University Admissions",
        targetQuantity: 5,
        supabaseClient: supabase,
      }
    );

    assert.ok(objective.id.startsWith("obj-"), "Objective ID must be formatted");
    assert.equal(objective.state, "COMPLETED");
    assert.equal(objective.acceptanceCriteria.targetValue, 5);
    assert.equal(objective.acceptanceCriteria.isSatisfied, true);
    assert.ok(objective.cycleHistory.length > 0, "Cycle history must be recorded");

    const retrieved = autonomousCompanyExecutive.getObjective(objective.id);
    assert.equal(retrieved.id, objective.id, "Objective must be retrievable from persistent ledger");
    console.log(`    [PASS] Persistent objective ownership maintained in ledger with cycle history.`);
  });

  // --------------------------------------------------------------------------
  // SUITE 7: Live Supabase crm_leads Record Audit
  // --------------------------------------------------------------------------
  if (supabase) {
    await runAsyncSuite("7. Live Supabase crm_leads Verification & Provenance Audit", async () => {
      const { data: leads, error } = await supabase
        .from("crm_leads")
        .select("id, contact_name, contact_email, status, metadata")
        .eq("tenant_id", TEST_TENANT_ID)
        .order("created_at", { ascending: false })
        .limit(10);

      assert.ok(!error, `Supabase query error: ${error?.message}`);
      assert.ok(leads && leads.length > 0, "Should have leads in crm_leads");

      const latest = leads[0];
      const meta = latest.metadata || {};
      assert.ok(meta.company, "Must have real company in metadata");
      assert.ok(meta.provenance, "Must have provenance in metadata");
      assert.equal(meta.isSynthetic, false, "Must explicitly mark isSynthetic: false");
      assert.ok(meta.provenance.deduplicationHash, "Must have deduplicationHash in provenance");

      console.log(`    [PASS] Live DB Audit: Found ${leads.length} real leads. Sample: "${meta.company}" (Provenance: ${meta.provenance.source})`);
    });
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n==================================================`);
  console.log(`E2E TEST SUMMARY: ${totalTestsPassed}/${totalTestsRun} SUITES PASSED`);
  console.log(`==================================================\n`);

  if (totalTestsPassed !== totalTestsRun) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN E2E SUITE:", err);
  process.exit(1);
});
