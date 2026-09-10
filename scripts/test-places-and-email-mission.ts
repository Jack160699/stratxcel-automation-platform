/**
 * End-to-End Verification: Local Google Maps Acquisition & Free-First Email Outreach
 * StratXcel Autonomous Company OS
 *
 * Strict Rules:
 * - Real Google Places discovery & details resolution
 * - Real deduplication & CRM persistence
 * - Real outreach safety & gatekeeper checks
 * - Real outbox persistence & audit trails
 * - Truthful provider states without mocks or synthetic delivery
 */

import { createClient } from "@supabase/supabase-js";
import { UniversalLeadEngine } from "../packages/workforce-core/src/acquisition/universal-lead-engine.ts";
import { GooglePlacesAdapter } from "../packages/workforce-core/src/acquisition/adapters/google-places-adapter.ts";
import { evaluateOutreachEligibility } from "../packages/workforce-core/src/acquisition/outreach-gatekeeper.ts";
import { EmailOutreachService } from "../packages/workforce-core/src/acquisition/email-outreach.ts";
import type { CanonicalLead } from "../packages/workforce-core/src/acquisition/types.ts";

async function main() {
  console.log("=================================================================");
  console.log("STRATXCEL MISSION TEST: LOCAL GOOGLE MAPS + FREE-FIRST EMAIL");
  console.log("=================================================================\n");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials in environment");
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const tenantId = "466e6195-a9f6-4576-8271-29fdae61c18a"; // StratXcel Platform Tenant

  // -------------------------------------------------------------
  // TEST 1: Provider Availability & Dynamic Source Selection
  // -------------------------------------------------------------
  console.log("--- TEST 1: Provider Availability & Cost-Aware Source Selection ---");
  const engine = new UniversalLeadEngine({ supabaseClient: sb });
  const statuses = await engine.getProviderStatuses();

  console.log("Provider Statuses:");
  for (const [k, st] of Object.entries(statuses)) {
    console.log(`  ${k.padEnd(20)}: ${st.state.padEnd(12)} (${st.verificationEvidence || st.commercialRequirement || "Ready"})`);
  }

  const reasoning = engine.reasonAboutSources("Get 100 solar customers in Raipur");
  console.log("\nHermes Reasoning for 'Get 100 solar customers in Raipur':");
  console.log("  Target Industry:   ", reasoning.targetIndustry);
  console.log("  Target Geography:  ", reasoning.targetGeography);
  console.log("  Target Category:   ", reasoning.targetOfferCategory);
  console.log("  Recommended Sources:", reasoning.recommendedSources.join(" -> "));
  console.log("  Free-First Order:  ", reasoning.recommendedSources[0] === "stratxcel_catalog" && reasoning.recommendedSources[1] === "google_places");

  // -------------------------------------------------------------
  // TEST 2: Real Google Places Discovery & Place Details Resolution
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Real Google Places Discovery & Local Expansion ---");
  const placesAdapter = new GooglePlacesAdapter();
  const placesAvailability = await placesAdapter.checkAvailability();
  console.log("Google Places Adapter State:", placesAvailability.state);

  const discoveredPlaces = await placesAdapter.discoverLeads({
    objectiveText: "Get commercial solar customers in Raipur",
    targetIndustry: "Renewable Energy / Solar",
    targetOfferCategory: "Solar",
    targetGeography: "Raipur, Chhattisgarh",
    targetQuantity: 5,
    tenantId,
  });

  console.log(`Discovered ${discoveredPlaces.length} real businesses via Google Places:`);
  for (const p of discoveredPlaces) {
    console.log(`  * ${p.companyName}`);
    console.log(`    Address: ${p.address}`);
    console.log(`    Phone:   ${p.phone || "[Discovered via Google Place Listing]"}`);
    console.log(`    Web:     ${p.website || "[Direct Maps entity]"}`);
    console.log(`    Maps:    ${p.sourceUrl}`);
    console.log(`    Category:${p.category} | Confidence: ${p.confidence}\n`);
  }

  if (discoveredPlaces.length === 0) {
    throw new Error("FAIL: Google Places returned 0 leads");
  }

  // -------------------------------------------------------------
  // TEST 3: Multi-Source Pipeline, Deduplication & CRM Persistence
  // -------------------------------------------------------------
  console.log("--- TEST 3: Multi-Source Pipeline Execution & CRM Persistence ---");
  const discoveryResult = await engine.executeDiscovery({
    objectiveText: "Get commercial solar installations in Raipur",
    targetIndustry: "Renewable Energy / Solar",
    targetOfferCategory: "Solar",
    targetGeography: "Raipur, Chhattisgarh",
    targetQuantity: 5,
    minQualificationScore: 40,
    tenantId,
  });

  console.log("Discovery Result:");
  console.log(`  Raw Discovered:    ${discoveryResult.rawDiscoveredCount}`);
  console.log(`  Deduplicated:      ${discoveryResult.deduplicatedCount}`);
  console.log(`  Verified Count:    ${discoveryResult.verifiedCount}`);
  console.log(`  Qualified Leads:   ${discoveryResult.qualifiedCount}`);
  console.log(`  Persisted to CRM:  ${discoveryResult.persistedCount}`);
  console.log(`  Sources Succeeded: ${discoveryResult.sourcesSucceeded.join(", ")}`);

  // Verify leads in CRM table
  const { data: crmLeads, error: crmErr } = await sb
    .from("crm_leads")
    .select("id, contact_name, status, contact_phone, contact_email, metadata")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (crmErr) {
    console.error("CRM query error:", crmErr.message);
  } else {
    console.log(`\nVerified Latest Leads in CRM (tenant: ${tenantId}):`);
    for (const l of crmLeads || []) {
      console.log(`  - ID: ${l.id} | Name: ${l.contact_name} | Status: ${l.status}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 4: Outreach Gatekeeper Rules (Consent & Opt-Out Suppression)
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Outreach Gatekeeper Rules & Safety Enforcement ---");
  const sampleLead = discoveryResult.leads[0];
  if (!sampleLead) {
    throw new Error("FAIL: No qualified lead to test gatekeeper");
  }

  // 4a: Qualified lead evaluation
  const eligibleCheck = evaluateOutreachEligibility(sampleLead, { tenantId });
  console.log("Eligible Lead Gatekeeper Verdict:", {
    isEligible: eligibleCheck.isEligible,
    preferredChannel: eligibleCheck.preferredChannel,
    consentState: eligibleCheck.consentState,
    whatsappOptInReady: eligibleCheck.whatsappOptInReady,
  });

  // 4b: Suppressed email evaluation
  const testEmail = "optout-supplier@stratxcel.in";
  const suppressedLead: CanonicalLead = {
    ...sampleLead,
    identity: {
      ...sampleLead.identity,
      primaryEmail: testEmail,
      normalizedEmail: testEmail,
    },
  };
  const suppressedCheck = evaluateOutreachEligibility(suppressedLead, {
    tenantId,
    suppressedEmails: new Set([testEmail]),
  });
  console.log("Suppressed Lead Gatekeeper Verdict:", {
    isEligible: suppressedCheck.isEligible,
    consentState: suppressedCheck.consentState,
    suppressionReason: suppressedCheck.suppressionReason,
  });
  if (suppressedCheck.isEligible) {
    throw new Error("FAIL: Gatekeeper failed to suppress opted-out email");
  }

  // 4c: Low qualification score evaluation
  const lowScoreLead: CanonicalLead = {
    ...sampleLead,
    qualification: {
      ...sampleLead.qualification,
      qualificationScore: 25,
      icpFitTier: "UNQUALIFIED",
    },
  };
  const lowScoreCheck = evaluateOutreachEligibility(lowScoreLead, { tenantId });
  console.log("Low Score Lead Gatekeeper Verdict:", {
    isEligible: lowScoreCheck.isEligible,
    suppressionReason: lowScoreCheck.suppressionReason,
  });
  if (lowScoreCheck.isEligible) {
    throw new Error("FAIL: Gatekeeper allowed unqualified lead (score 25 < 40)");
  }

  // -------------------------------------------------------------
  // TEST 5: Free-First Email Outreach Service & Outbox Persistence
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Free-First Email Outreach Engine Execution ---");
  const emailService = new EmailOutreachService({ supabaseClient: sb });

  // Test send to lead with valid B2B email
  const b2bLeadWithEmail: CanonicalLead = {
    ...sampleLead,
    identity: {
      ...sampleLead.identity,
      primaryEmail: "founder-test@stratxcel.in",
      normalizedEmail: "founder-test@stratxcel.in",
    },
  };

  console.log("Dispatching governed outreach email...");
  const outreachResult = await emailService.sendOutreachEmail({
    tenantId,
    lead: b2bLeadWithEmail,
    subject: `Partnership Inquiry: Solar Energy Infrastructure for ${b2bLeadWithEmail.identity.companyName}`,
    htmlContent: `<p>Hello ${b2bLeadWithEmail.identity.companyName},</p><p>We noted your commercial operations in Raipur and would like to propose a high-yield captive solar initiative.</p>`,
    textContent: `Hello ${b2bLeadWithEmail.identity.companyName},\nWe noted your commercial operations in Raipur and would like to propose a high-yield captive solar initiative.`,
    templateKey: "b2b_solar_outreach_v1",
  });

  console.log("Email Outreach Result:", {
    success: outreachResult.success,
    status: outreachResult.status,
    idempotencyKey: outreachResult.idempotencyKey.slice(0, 16) + "...",
    provider: outreachResult.provider,
    providerMessageId: outreachResult.providerMessageId || null,
    error: outreachResult.error,
    errorCode: outreachResult.errorCode,
    outboxRowId: outreachResult.outboxRowId,
  });

  // Verify email_outbox table persistence in Supabase
  if (outreachResult.outboxRowId) {
    const { data: outboxEntry } = await sb
      .from("email_outbox")
      .select("id, tenant_id, recipient, template_key, idempotency_key, status, last_error_code")
      .eq("id", outreachResult.outboxRowId)
      .single();

    console.log("\nVerified In email_outbox Table:");
    console.log("  ID:             ", outboxEntry?.id);
    console.log("  Tenant ID:      ", outboxEntry?.tenant_id);
    console.log("  Recipient:      ", outboxEntry?.recipient);
    console.log("  Template:       ", outboxEntry?.template_key);
    console.log("  Idempotency Key:", outboxEntry?.idempotency_key?.slice(0, 20) + "...");
    console.log("  Status:         ", outboxEntry?.status);
    console.log("  Error Code:     ", outboxEntry?.last_error_code);
  }

  // Verify audit_events table persistence
  const { data: auditRows } = await sb
    .from("audit_events")
    .select("id, action, target_type, target_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(3);

  console.log("\nVerified In audit_events Table:");
  for (const a of auditRows || []) {
    console.log(`  * ${a.action} on ${a.target_type} (${a.target_id}) at ${a.created_at}`);
  }

  console.log("\n=================================================================");
  console.log("ALL LOCAL PLACES & EMAIL OUTREACH PIPELINE TESTS COMPLETED");
  console.log("=================================================================");
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
