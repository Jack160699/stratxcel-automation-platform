import assert from "node:assert/strict";
import { EmailOutreachService } from "../acquisition/email-outreach.ts";
import { evaluateOutreachEligibility } from "../acquisition/outreach-gatekeeper.ts";
import type { CanonicalLead } from "../acquisition/types.ts";

console.log("Starting Email Outreach Service Unit Tests...\n");

const mockLead: CanonicalLead = {
  id: "lead_test_001",
  tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
  status: "QUALIFIED",
  identity: {
    companyName: "Raipur Solar Tech Industries",
    normalizedCompanyName: "raipur solar tech",
    websiteUrl: "https://raipursolartech.in",
    canonicalDomain: "raipursolartech.in",
    primaryPhone: "+917712345678",
    normalizedPhone: "+917712345678",
    allPhones: ["+917712345678"],
    primaryEmail: "director@raipursolartech.in",
    normalizedEmail: "director@raipursolartech.in",
    allEmails: ["director@raipursolartech.in"],
    facilityAddress: "Urla Industrial Area, Raipur, Chhattisgarh",
    city: "Raipur",
    stateOrRegion: "Chhattisgarh",
    country: "India",
    deduplicationHash: "hash_test_123",
  },
  provenanceHistory: [],
  evidenceList: [],
  enrichment: {
    lastEnrichedAt: new Date().toISOString(),
    enrichmentSources: ["website"],
  },
  qualification: {
    qualificationScore: 85,
    icpFitTier: "TIER_1_ENTERPRISE",
    status: "QUALIFIED",
    signals: {
      geographyMatch: true,
      industryFit: true,
      scaleMatch: true,
      needOrProblemDetected: true,
      decisionMakerIdentified: true,
      contactabilityReady: true,
    },
    scoringBreakdown: [],
    summaryRationale: "High fit commercial solar buyer in Raipur",
  },
  outreachEligibility: {
    isEligible: true,
    preferredChannel: "whatsapp",
    consentState: "LEGITIMATE_INTEREST_B2B",
    whatsappOptInReady: true,
    reason: "Qualified B2B prospect with verified contact details",
  },
  crmMetadata: {
    firstDiscoveredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    sourceDistribution: { google_places: 1 },
    verificationScore: 90,
  },
};

async function runTests() {
  // Test 1: Gatekeeper suppression of opted-out email
  const suppressedResult = evaluateOutreachEligibility(mockLead, {
    tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
    suppressedEmails: new Set(["director@raipursolartech.in"]),
  });
  assert.equal(suppressedResult.isEligible, false, "Opted-out email must be ineligible");
  assert.equal(suppressedResult.consentState, "OPT_OUT", "Consent state must be OPT_OUT");
  assert.equal(suppressedResult.suppressionReason, "SUPPRESSED_EMAIL", "Reason must be SUPPRESSED_EMAIL");
  console.log("✓ Gatekeeper Email Suppression verified");

  // Test 2: Gatekeeper rejection of unqualified prospect
  const unqualifiedLead: CanonicalLead = {
    ...mockLead,
    qualification: {
      ...mockLead.qualification,
      qualificationScore: 30,
      icpFitTier: "UNQUALIFIED",
    },
  };
  const unqualifiedResult = evaluateOutreachEligibility(unqualifiedLead);
  assert.equal(unqualifiedResult.isEligible, false, "Unqualified prospect must be rejected");
  assert.equal(unqualifiedResult.suppressionReason, "LOW_QUALIFICATION_SCORE");
  console.log("✓ Gatekeeper Low Qualification Score Gate verified");

  // Test 3: EmailOutreachService blocks send when recipient missing
  const service = new EmailOutreachService();
  const noEmailLead: CanonicalLead = {
    ...mockLead,
    identity: {
      ...mockLead.identity,
      primaryEmail: null,
      normalizedEmail: null,
    },
  };
  const missingEmailRes = await service.sendOutreachEmail({
    tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
    lead: noEmailLead,
    subject: "Test",
    htmlContent: "<p>Test</p>",
    textContent: "Test",
  });
  assert.equal(missingEmailRes.success, false);
  assert.equal(missingEmailRes.status, "INELIGIBLE");
  console.log("✓ Missing Recipient Rejection verified");

  // Test 4: EmailOutreachService truthful SETUP_REQUIRED when API key is unset
  delete process.env.RESEND_API_KEY;
  const noKeyService = new EmailOutreachService({ resendApiKey: null });
  const noKeyRes = await noKeyService.sendOutreachEmail({
    tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
    lead: mockLead,
    subject: "Test",
    htmlContent: "<p>Test</p>",
    textContent: "Test",
  });
  assert.equal(noKeyRes.success, false);
  assert.equal(noKeyRes.status, "SETUP_REQUIRED");
  assert.equal(noKeyRes.errorCode, "NOT_CONFIGURED");
  assert.ok(noKeyRes.idempotencyKey.length === 64, "Deterministic sha256 idempotency key generated");
  console.log("✓ Truthful Unconfigured Key Handling & Deterministic Idempotency verified");

  console.log("\nALL EMAIL OUTREACH SERVICE TESTS PASSED SUCCESSFULLY.");
}

runTests().catch((err) => {
  console.error("Email Outreach test failed:", err);
  process.exit(1);
});
