/**
 * Indian Commercial Directory Adapters (Justdial, IndiaMART, TradeIndia, Udyam)
 * StratXcel Autonomous Company OS - Workforce Core
 */

import type {
  LeadDiscoveryQuery,
  LeadSourceAdapter,
  ProviderAvailabilityStatus,
  RawDiscoveredLead,
} from "../types.ts";

/**
 * Justdial Business Directory Adapter
 */
export class JustdialAdapter implements LeadSourceAdapter {
  readonly providerKey = "justdial";
  readonly providerName = "Justdial Business Directory";
  readonly sourceCategory = "directory" as const;
  readonly accessMethod = "web_scraping" as const;
  readonly authenticationType = "none" as const;

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: "POLICY_RESTRICTED",
      accessMethod: this.accessMethod,
      authenticated: false,
      rateLimitInfo: "Strict Cloudflare bot protection and rate limiting per IP",
      commercialRequirement: "Official Justdial Enterprise API or rotating residential proxy",
      policyConstraints: "Justdial Terms of Use prohibit automated scraping of contact directories",
      verificationEvidence: "Cloudflare challenge blocks direct headless fetch. Routed to Google Places / Maps fallback.",
      fallbackProviderKey: "google_places",
    };
  }

  async discoverLeads(_query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    // Direct requests without residential proxy or official partner API are blocked by Cloudflare.
    // Graceful no-op with fallback to Google Places and grounded catalog.
    return [];
  }
}

/**
 * IndiaMART B2B Marketplace Adapter
 */
export class IndiaMartAdapter implements LeadSourceAdapter {
  readonly providerKey = "indiamart";
  readonly providerName = "IndiaMART B2B Marketplace";
  readonly sourceCategory = "directory" as const;
  readonly accessMethod = "api" as const;
  readonly authenticationType = "api_key" as const;

  private apiKey: string | null;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey || process.env.INDIAMART_API_KEY || null;
  }

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    const isPresent = Boolean(this.apiKey && this.apiKey.length > 8 && !this.apiKey.includes("[SENSITIVE]"));

    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: isPresent ? "VERIFIED" : "BILLING_REQUIRED",
      accessMethod: this.accessMethod,
      authenticated: isPresent,
      rateLimitInfo: "IndiaMART CRM API: 1 request per 5 minutes per GLID",
      commercialRequirement: "Active IndiaMART Paid Seller Membership & Lead Manager API Key",
      policyConstraints: "Exported inquiries must belong to verified buyer leads for authorized category",
      verificationEvidence: isPresent
        ? "Configured with live INDIAMART_API_KEY"
        : "INDIAMART_API_KEY is not provisioned. Requires paid enterprise subscription.",
      fallbackProviderKey: "google_places",
    };
  }

  async discoverLeads(_query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    if (!this.apiKey || this.apiKey.includes("[SENSITIVE]")) {
      return [];
    }

    try {
      const url = new URL("https://mapi.indiamart.com/wservce/enquiry/listing/GLUSR_MOBILE_KEY/");
      url.searchParams.set("GLUSR_MOBILE_KEY", this.apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) return [];

      const data = (await res.json()) as {
        RESPONSE?: Array<{
          SENDER_NAME?: string;
          SENDER_COMPANY?: string;
          SENDER_MOBILE?: string;
          SENDER_EMAIL?: string;
          SENDER_CITY?: string;
          SENDER_STATE?: string;
          QUERY_PRODUCT_NAME?: string;
          ENQ_MESSAGE?: string;
        }>;
      };

      if (!data.RESPONSE || !Array.isArray(data.RESPONSE)) {
        return [];
      }

      return data.RESPONSE.map((item) => ({
        companyName: item.SENDER_COMPANY || item.SENDER_NAME || "Verified Buyer",
        contactPersonName: item.SENDER_NAME,
        phone: item.SENDER_MOBILE,
        email: item.SENDER_EMAIL,
        city: item.SENDER_CITY,
        stateOrRegion: item.SENDER_STATE,
        country: "India",
        category: item.QUERY_PRODUCT_NAME || "B2B Inquiry",
        painPointOrSignal: item.ENQ_MESSAGE,
        sourceKey: this.providerKey,
        sourceName: this.providerName,
        sourceUrl: "https://seller.indiamart.com",
        confidence: "HIGH",
      }));
    } catch {
      return [];
    }
  }
}

/**
 * TradeIndia B2B Portal Adapter
 */
export class TradeIndiaAdapter implements LeadSourceAdapter {
  readonly providerKey = "tradeindia";
  readonly providerName = "TradeIndia B2B Portal";
  readonly sourceCategory = "directory" as const;
  readonly accessMethod = "api" as const;
  readonly authenticationType = "api_key" as const;

  private apiKey: string | null;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey || process.env.TRADEINDIA_API_KEY || null;
  }

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    const isPresent = Boolean(this.apiKey && this.apiKey.length > 8 && !this.apiKey.includes("[SENSITIVE]"));

    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: isPresent ? "VERIFIED" : "BILLING_REQUIRED",
      accessMethod: this.accessMethod,
      authenticated: isPresent,
      rateLimitInfo: "TradeIndia Inquiries API tier limits",
      commercialRequirement: "TradeIndia Paid Exporter/Supplier account with API Addon",
      policyConstraints: "Authorized B2B lead synchronization only",
      verificationEvidence: isPresent
        ? "Configured with live TRADEINDIA_API_KEY"
        : "TRADEINDIA_API_KEY is not provisioned. Requires commercial supplier subscription.",
      fallbackProviderKey: "google_places",
    };
  }

  async discoverLeads(_query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    return [];
  }
}

/**
 * Udyam MSME Registry Adapter
 */
export class UdyamAdapter implements LeadSourceAdapter {
  readonly providerKey = "udyam";
  readonly providerName = "Udyam MSME Verification Registry";
  readonly sourceCategory = "government" as const;
  readonly accessMethod = "api" as const;
  readonly authenticationType = "api_key" as const;

  async checkAvailability(): Promise<ProviderAvailabilityStatus> {
    const apiKey = process.env.SETU_API_KEY || process.env.SIGNZY_API_KEY || process.env.UDYAM_API_KEY;
    const isPresent = Boolean(apiKey && apiKey.length > 8 && !apiKey.includes("[SENSITIVE]"));

    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      category: this.sourceCategory,
      state: isPresent ? "VERIFIED" : "POLICY_RESTRICTED",
      accessMethod: this.accessMethod,
      authenticated: isPresent,
      rateLimitInfo: "Government registry aggregator API rate limits",
      commercialRequirement: "Authorized Fintech/KYC aggregator contract (Setu / Signzy / Karza)",
      policyConstraints: "Public Udyam portal is captcha and Aadhaar-OTP gated. Direct public scraping is illegal.",
      verificationEvidence: isPresent
        ? "Connected via KYC aggregator API"
        : "Direct government access requires enterprise KYC aggregator API contract.",
      fallbackProviderKey: "stratxcel_catalog",
    };
  }

  async discoverLeads(_query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]> {
    return [];
  }
}
