/**
 * Universal Lead Acquisition & Enrichment Engine - Unit Test Suite
 * Tests normalization, identity resolution, deduplication, data priority merging, qualification, and outreach gating.
 */

import assert from "node:assert";
import {
  canonicalizeDomain,
  generateIdentityHash,
  normalizeCompanyName,
  normalizePhone,
  mergeLeadIdentity,
  buildLeadIdentity,
} from "../acquisition/identity-resolver.ts";
import { mergeWithDataPriority } from "../acquisition/data-priority-merger.ts";
import { evaluateLeadQualification } from "../acquisition/qualification-engine.ts";
import { evaluateOutreachEligibility } from "../acquisition/outreach-gatekeeper.ts";
import { UniversalLeadEngine } from "../acquisition/universal-lead-engine.ts";
import { createDefaultSourceAdapters } from "../acquisition/adapters/index.ts";
import type { RawDiscoveredLead, CanonicalLead } from "../acquisition/types.ts";

async function runTests() {
  console.log("Starting Universal Lead Engine Unit Tests...\n");

  // 1. Phone Normalization
  assert.strictEqual(normalizePhone("+91 95847 35857"), "+919584735857");
  assert.strictEqual(normalizePhone("0771 4050600"), "+917714050600");
  assert.strictEqual(normalizePhone("09584735857"), "+919584735857");
  assert.strictEqual(normalizePhone("+91-80-28394100"), "+918028394100");
  console.log("✓ Phone Normalization verified");

  // 2. Domain Canonicalization
  assert.strictEqual(canonicalizeDomain("https://WWW.PeenyaPrecision.in/contact/"), "peenyaprecision.in");
  assert.strictEqual(canonicalizeDomain("http://seml.co.in:80/about?ref=gmb"), "seml.co.in");
  assert.strictEqual(canonicalizeDomain("dpsraipur.com"), "dpsraipur.com");
  console.log("✓ Domain Canonicalization verified");

  // 3. Company Name Normalization
  assert.strictEqual(normalizeCompanyName("Sarda Energy & Minerals Ltd."), "sarda energy minerals");
  assert.strictEqual(normalizeCompanyName("Peenya Precision Tooling Pvt. Ltd."), "peenya precision tooling");
  assert.strictEqual(normalizeCompanyName("DPS Raipur (Delhi Public School)"), "dps raipur delhi public school");
  console.log("✓ Company Name Normalization verified");

  // 4. Deterministic Identity Hash
  const hash1 = generateIdentityHash({
    companyName: "Sarda Energy & Minerals Ltd",
    websiteUrl: "https://seml.co.in",
  });
  const hash2 = generateIdentityHash({
    companyName: "SARDA ENERGY & MINERALS",
    websiteUrl: "http://www.seml.co.in/overview",
  });
  assert.strictEqual(hash1, hash2, "Identical domains must yield the exact same SHA-256 hash");
  console.log("✓ Deterministic Identity Hash verified");

  // 5. Multi-Source Deduplication into ONE Canonical Lead
  const rawCatalog: RawDiscoveredLead = {
    companyName: "Sarda Energy & Minerals Ltd",
    website: "https://seml.co.in",
    phone: "+91-771-2216100",
    email: "info@seml.co.in",
    city: "Raipur",
    stateOrRegion: "Chhattisgarh",
    sourceKey: "stratxcel_catalog",
    sourceName: "StratXcel Verified Industrial Directory",
    confidence: "VERIFIED",
  };

  const rawPlaces: RawDiscoveredLead = {
    companyName: "Sarda Energy & Minerals Ltd Siltara",
    website: "https://seml.co.in",
    phone: "+91 771 2216100",
    address: "Industrial Growth Centre, Siltara, Raipur",
    sourceKey: "google_places",
    sourceName: "Google Places API",
    confidence: "HIGH",
  };

  const rawJustdial: RawDiscoveredLead = {
    companyName: "Sarda Energy Minerals",
    website: "https://seml.co.in",
    city: "Raipur",
    sourceKey: "justdial",
    sourceName: "Justdial Business Directory",
    confidence: "MEDIUM",
  };

  const engine = new UniversalLeadEngine({ adapters: createDefaultSourceAdapters() });
  const initialIdentity = buildLeadIdentity(rawCatalog);
  let canonicalLead: CanonicalLead = {
    id: "lead-test-1",
    tenantId: "tenant-test",
    identity: initialIdentity,
    provenanceHistory: [
      {
        sourceKey: rawCatalog.sourceKey,
        sourceName: rawCatalog.sourceName,
        discoveredAt: new Date().toISOString(),
        verificationMethod: "grounded_catalog" as const,
        confidence: "VERIFIED" as const,
        confidenceScore: 1.0,
        deduplicationHash: initialIdentity.deduplicationHash,
        extractedFields: ["companyName", "website", "phone", "email"],
      },
    ],
    evidenceList: [],
    enrichment: {
      lastEnrichedAt: new Date().toISOString(),
      enrichmentSources: [rawCatalog.sourceKey],
    },
    qualification: {
      qualificationScore: 80,
      icpFitTier: "TIER_1_ENTERPRISE" as const,
      status: "QUALIFIED" as const,
      signals: {
        geographyMatch: true,
        industryFit: true,
        scaleMatch: true,
        needOrProblemDetected: true,
        decisionMakerIdentified: true,
        contactabilityReady: true,
      },
      scoringBreakdown: [],
      summaryRationale: "High fit enterprise",
    },
    outreachEligibility: {
      isEligible: true,
      preferredChannel: "whatsapp" as const,
      consentState: "LEGITIMATE_INTEREST_B2B" as const,
      whatsappOptInReady: true,
      reason: "B2B commercial interest",
    },
    status: "QUALIFIED" as const,
    source: "hermes_research" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  };

  // Merge second sighting (Google Places)
  canonicalLead = mergeLeadIdentity(canonicalLead, rawPlaces);
  // Merge third sighting (Justdial)
  canonicalLead = mergeLeadIdentity(canonicalLead, rawJustdial);

  assert.strictEqual(canonicalLead.provenanceHistory.length, 3, "Must retain 3 provenance records");
  assert.strictEqual(canonicalLead.evidenceList.length, 2, "Must retain 2 sighting evidence entries");
  assert.strictEqual(canonicalLead.identity.canonicalDomain, "seml.co.in");
  console.log("✓ Multi-Source Provenance & Deduplication verified (3 sources -> 1 entity)");

  // 6. Data Priority Merger
  // Attempt to overwrite verified email with weak inference
  const prioritized = mergeWithDataPriority(canonicalLead, {
    sourceKey: "ai_inference",
    email: "fake-guess@seml.co.in",
  });
  assert.strictEqual(
    prioritized.identity.primaryEmail,
    "info@seml.co.in",
    "Weaker AI inference must NOT overwrite Tier 1 verified catalog email"
  );
  console.log("✓ Hierarchical Data Priority Merger verified (Weak source cannot overwrite verified fact)");

  // 7. Qualification Scoring
  const qual = evaluateLeadQualification(
    canonicalLead.identity,
    canonicalLead.provenanceHistory,
    {
      targetIndustry: "Solar",
      targetGeography: "Raipur, Chhattisgarh",
      targetOfferCategory: "SOLAR",
    },
    {
      painPoint: "High captive electricity load and large industrial roof available.",
      decisionMakerRole: "Chief Technical Officer",
      estimatedDealValueInr: 2500000,
    }
  );
  assert.ok(qual.qualificationScore >= 75, `Expected score >= 75, got ${qual.qualificationScore}`);
  assert.strictEqual(qual.icpFitTier, "TIER_1_ENTERPRISE");
  assert.ok(qual.scoringBreakdown.length >= 5, "Must include complete explainable factor breakdown");
  console.log(`✓ Qualification Scoring verified: Score ${qual.qualificationScore}/100 (${qual.icpFitTier})`);

  // 8. Outreach Gatekeeper
  const eligibleOutreach = evaluateOutreachEligibility(canonicalLead);
  assert.strictEqual(eligibleOutreach.isEligible, true);
  assert.strictEqual(eligibleOutreach.preferredChannel, "whatsapp");

  // Suppressed phone test
  const suppressedOutreach = evaluateOutreachEligibility(canonicalLead, {
    tenantId: "tenant-test",
    suppressedPhones: new Set([canonicalLead.identity.normalizedPhone!]),
  });
  assert.strictEqual(suppressedOutreach.isEligible, false);
  assert.strictEqual(suppressedOutreach.consentState, "OPT_OUT");
  console.log("✓ Outreach Gatekeeper verified (Suppression & channel governance enforced)");

  console.log("\nALL UNIVERSAL LEAD ENGINE UNIT TESTS PASSED SUCCESSFULLY.\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
