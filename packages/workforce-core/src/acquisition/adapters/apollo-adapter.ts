/**
 * Apollo.io B2B Lead & Contact Enrichment Adapter
 * StratXcel Autonomous Company OS - Workforce Core
 */

import type {
  LeadDiscoveryQuery,
  LeadEnrichment,
  LeadIdentity,
  LeadSourceAdapter,
  ProviderAvailabilityStatus,
  RawDiscoveredLead,
} from "../types.ts";

export class ApolloAdapter implements LeadSourceAdapter {
  readonly providerKey = "apollo";
  readonly providerName = "Apollo.io B2B Intelligence";
  readonly sourceCategory = "enrichment" as const;
  readonly accessMethod = "api" as const;
  readonly authenticationType = "api_key" as const;

  private apiKey: string | null;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey || process.env.APOLLO_API_KEY || null;
  }

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    const isPresent = Boolean(this.apiKey && this.apiKey.length > 10 && !this.apiKey.includes("[SENSITIVE]"));

    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: isPresent ? "VERIFIED" : "BILLING_REQUIRED",
      accessMethod: this.accessMethod,
      authenticated: isPresent,
      rateLimitInfo: "Apollo REST API: 100 requests/min (Custom Enterprise tiers available)",
      commercialRequirement: "Apollo.io Paid Subscription API Key (provision APOLLO_API_KEY)",
      policyConstraints: "Apollo Developer Terms: PII export subject to GDPR/CCPA and credit usage quotas",
      verificationEvidence: isPresent
        ? "Connected with active Apollo.io API credentials"
        : "APOLLO_API_KEY is not provisioned in environment. Marked as BILLING_REQUIRED.",
      fallbackProviderKey: "company_websites",
    };
  }

  async discoverLeads(query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    if (!this.apiKey || this.apiKey.includes("[SENSITIVE]")) {
      return [];
    }

    try {
      const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": this.apiKey,
        },
        body: JSON.stringify({
          q_organization_domains: query.targetOfferCategory,
          page: 1,
          per_page: query.targetQuantity || 10,
        }),
      });

      if (!res.ok) {
        return [];
      }

      const data = (await res.json()) as {
        people?: Array<{
          name: string;
          title: string;
          email: string;
          organization?: {
            name: string;
            primary_domain?: string;
            estimated_num_employees?: number;
          };
        }>;
      };

      if (!data.people || !Array.isArray(data.people)) {
        return [];
      }

      return data.people.map((p) => ({
        companyName: p.organization?.name || "Target Enterprise",
        website: p.organization?.primary_domain ? `https://${p.organization.primary_domain}` : undefined,
        contactPersonName: p.name,
        decisionMakerRole: p.title,
        email: p.email,
        sourceKey: this.providerKey,
        sourceName: this.providerName,
        sourceUrl: "https://app.apollo.io",
        confidence: "MEDIUM",
        rawPayload: p as unknown as Record<string, unknown>,
      }));
    } catch {
      return [];
    }
  }

  async enrichLead(identity: LeadIdentity): Promise<Partial<LeadEnrichment>> {
    if (!this.apiKey || this.apiKey.includes("[SENSITIVE]")) {
      return {};
    }

    if (!identity.canonicalDomain && !identity.websiteUrl) {
      return {};
    }

    const domain = identity.canonicalDomain || (identity.websiteUrl ? new URL(identity.websiteUrl).hostname : undefined);
    if (!domain) return {};

    try {
      const res = await fetch(`https://api.apollo.io/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
        },
      });

      if (!res.ok) return {};

      const data = (await res.json()) as {
        organization?: {
          name?: string;
          estimated_num_employees?: number;
          annual_revenue?: number;
          technology_names?: string[];
          sub_industry?: string;
        };
      };

      if (!data.organization) return {};

      return {
        employeeCountRange: data.organization.estimated_num_employees
          ? `${data.organization.estimated_num_employees} employees`
          : undefined,
        annualRevenueEstimatedInr: data.organization.annual_revenue
          ? Math.round(data.organization.annual_revenue * 83) // USD to INR conversion
          : undefined,
        techStack: data.organization.technology_names,
        subIndustry: data.organization.sub_industry,
        lastEnrichedAt: new Date().toISOString(),
        enrichmentSources: [this.providerKey],
      };
    } catch {
      return {};
    }
  }
}
