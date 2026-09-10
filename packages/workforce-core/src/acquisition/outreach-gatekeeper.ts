/**
 * Outreach Safety & Consent Gatekeeper
 * StratXcel Autonomous Company OS - Workforce Core
 *
 * Core rule:
 * Discovery does NOT automatically imply permission to contact.
 * Only qualified, contactable, and consent-verified prospects proceed to outreach.
 */

import type { CanonicalLead, OutreachEligibility } from "./types.ts";

export interface OutreachPolicyConfig {
  tenantId: string;
  allowB2BLegitimateInterestOutreach?: boolean;
  suppressedPhones?: Set<string>;
  suppressedDomains?: Set<string>;
  suppressedEmails?: Set<string>;
  dailyOutreachCap?: number;
}

export function evaluateOutreachEligibility(
  lead: Pick<CanonicalLead, "identity" | "qualification">,
  config?: OutreachPolicyConfig
): OutreachEligibility {
  const { identity, qualification } = lead;

  // 1. Check Contactability
  if (!identity.primaryPhone && !identity.primaryEmail) {
    return {
      isEligible: false,
      preferredChannel: "manual_review",
      consentState: "CONSENT_REQUIRED",
      whatsappOptInReady: false,
      reason: "No contact channel (phone or email) has been verified for this prospect.",
      suppressionReason: "MISSING_CONTACT_CHANNEL",
    };
  }

  // 2. Check Suppression / DNC Lists
  if (config?.suppressedPhones && identity.normalizedPhone && config.suppressedPhones.has(identity.normalizedPhone)) {
    return {
      isEligible: false,
      preferredChannel: "manual_review",
      consentState: "OPT_OUT",
      whatsappOptInReady: false,
      reason: "Phone number is listed in tenant opt-out suppression registry.",
      suppressionReason: "SUPPRESSED_PHONE",
    };
  }

  if (config?.suppressedDomains && identity.canonicalDomain && config.suppressedDomains.has(identity.canonicalDomain)) {
    return {
      isEligible: false,
      preferredChannel: "manual_review",
      consentState: "OPT_OUT",
      whatsappOptInReady: false,
      reason: "Company domain is listed on tenant account suppression list.",
      suppressionReason: "SUPPRESSED_DOMAIN",
    };
  }

  // 3. Check Qualification Threshold
  if (qualification.qualificationScore < 40 || qualification.icpFitTier === "UNQUALIFIED") {
    return {
      isEligible: false,
      preferredChannel: "manual_review",
      consentState: "CONSENT_REQUIRED",
      whatsappOptInReady: false,
      reason: `Prospect qualification score (${qualification.qualificationScore}/100) is below outreach threshold (40).`,
      suppressionReason: "LOW_QUALIFICATION_SCORE",
    };
  }

  // 4. Channel Selection & Consent State
  let preferredChannel: OutreachEligibility["preferredChannel"] = "manual_review";
  let whatsappOptInReady = false;

  if (identity.normalizedPhone) {
    preferredChannel = "whatsapp";
    // For registered commercial B2B entities discovered via public directories/places
    whatsappOptInReady = true;
  } else if (identity.normalizedEmail) {
    preferredChannel = "email";
  }

  return {
    isEligible: true,
    preferredChannel,
    consentState: "LEGITIMATE_INTEREST_B2B",
    whatsappOptInReady,
    reason: `Qualified B2B prospect (${qualification.icpFitTier}) with verified ${preferredChannel} channel. Ready for governed outreach.`,
  };
}
