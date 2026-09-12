/**
 * Social Network Discovery Adapters (LinkedIn, Meta/Instagram)
 * StratXcel Autonomous Company OS - Workforce Core
 */

import type {
  LeadDiscoveryQuery,
  LeadSourceAdapter,
  ProviderAvailabilityStatus,
  RawDiscoveredLead,
} from "../types.ts";

/**
 * LinkedIn Professional Network Adapter
 */
export class LinkedInAdapter implements LeadSourceAdapter {
  readonly providerKey = "linkedin";
  readonly providerName = "LinkedIn Professional Network";
  readonly sourceCategory = "social" as const;
  readonly accessMethod = "api" as const;
  readonly authenticationType = "oauth2" as const;

  private accessToken: string | null;

  constructor(accessToken?: string | null) {
    this.accessToken = accessToken || process.env.LINKEDIN_ACCESS_TOKEN || null;
  }

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    const isPresent = Boolean(this.accessToken && this.accessToken.length > 15 && !this.accessToken.includes("[SENSITIVE]"));

    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: isPresent ? "PARTIAL" : "POLICY_RESTRICTED",
      accessMethod: this.accessMethod,
      authenticated: isPresent,
      rateLimitInfo: "LinkedIn Developer API throttle tiers (e.g. 500 calls/day for test apps)",
      commercialRequirement: "LinkedIn Marketing Developer Platform Partner Approval",
      policyConstraints: "Automated profile scraping violates LinkedIn User Agreement (Section 8.2). Requires official OAuth app approval.",
      verificationEvidence: isPresent
        ? "Connected with LinkedIn OAuth token (Read access)"
        : "Automated crawling restricted by LinkedIn ToS; Official Partner API approval required.",
      fallbackProviderKey: "google_search",
    };
  }

  async discoverLeads(_query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    return [];
  }
}

/**
 * Meta / Instagram Business Discovery Adapter
 */
export class MetaSocialAdapter implements LeadSourceAdapter {
  readonly providerKey = "meta_social";
  readonly providerName = "Meta & Instagram Business Discovery";
  readonly sourceCategory = "social" as const;
  readonly accessMethod = "api" as const;
  readonly authenticationType = "oauth2" as const;

  private accessToken: string | null;

  constructor(accessToken?: string | null) {
    this.accessToken = accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_SYSTEM_USER_TOKEN || null;
  }

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    const isPresent = Boolean(this.accessToken && this.accessToken.length > 20 && !this.accessToken.includes("[SENSITIVE]"));

    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: isPresent ? "PARTIAL" : "BLOCKED",
      accessMethod: this.accessMethod,
      authenticated: isPresent,
      rateLimitInfo: "Meta Graph API rate limit: 200 calls/hour per user",
      commercialRequirement: "Meta Developer App with Page Public Content Access feature review",
      policyConstraints: "Instagram Basic Display & Graph API require explicit Page Public Content Access permission review",
      verificationEvidence: isPresent
        ? "Meta token present but requires Page Public Content Access review for general business search"
        : "Meta developer app lacks Page Public Content Access permission review.",
      fallbackProviderKey: "google_places",
    };
  }

  async discoverLeads(_query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    return [];
  }
}
