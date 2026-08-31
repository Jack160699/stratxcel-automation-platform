import type { SocialAutopilotContext } from "../social/social-autopilot-context.ts";
import type { NormalizedWebsiteIntelligence } from "../intelligence/website-intelligence.ts";
import type {
  GoogleBusinessLocationDetails,
  GoogleVerificationStatus,
  GbpVerificationGuide,
} from "../google/google-growth-engine.ts";
import {
  computeSeoOpportunities,
  computeAeoOpportunities,
  computeGeoOpportunities,
  type SeoAction,
  type AeoAction,
  type GeoAction,
} from "./search-growth-director.ts";

/**
 * STRATXCEL final autonomous growth-engine brief, Section 2: the one
 * canonical `GrowthAutopilotContext`.
 *
 * This is deliberately an ADDITIVE wrapper around the real, existing,
 * revenue-critical `SocialAutopilotContext` (lib/social/social-autopilot-context.ts)
 * -- not a replacement or a competing parallel context. `SocialAutopilotContext`
 * stays the single source of truth for business identity, brand, audience,
 * psychology, market research and campaign/performance history; this module
 * only adds the fields that context never carried: website intelligence,
 * Google Business, and the search-growth (SEO/AEO/GEO) surface.
 *
 * Honesty rule (matches `social-autopilot-context.ts`'s own convention,
 * carried forward here): every field maps to a real, already-implemented
 * data source in this codebase, documented inline. Where the brief asks for
 * a capability that has no real implementation yet -- a dedicated SEO/AEO/GEO
 * opportunity engine, a trend relevance/explanation engine, Search Console
 * ingestion, a Vercel/website-authorization connector -- the field is typed
 * and left honestly empty/null with a comment saying so. Nothing here
 * fabricates a strategy, a score, or a signal that no real engine produced.
 *
 * Current real sources wired in:
 *  - `social`: the full, live `SocialAutopilotContext` (unchanged).
 *  - `website`: `NormalizedWebsiteIntelligence` from
 *    `runWebsiteIntelligencePipeline` (lib/intelligence/website-intelligence.ts)
 *    when a caller has already run a crawl for this tenant this session --
 *    `null` otherwise (no crawl result yet), never re-fetched here.
 *  - `googleBusiness`: `GoogleBusinessLocationDetails` /
 *    `GoogleVerificationStatus` from lib/google/google-growth-engine.ts when
 *    a caller has already resolved GBP connection state -- `null` otherwise.
 *
 *  - `seo.opportunities`, `aeo.opportunities`, `geo.opportunities`: real,
 *    computed by `computeSeoOpportunities`/`computeAeoOpportunities`/
 *    `computeGeoOpportunities` (./search-growth-director.ts) directly from
 *    `website.intelligence` and `googleBusiness.profile` whenever those are
 *    present -- every action traces to a specific evidence field (see that
 *    module's `why` field on each action). Empty array means the director
 *    ran and found nothing to flag, or no evidence was supplied yet -- never
 *    a fabricated placeholder list. Execution of these actions (deploying a
 *    fix, publishing content) is a separate, not-yet-built layer -- see
 *    docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md.
 *    ⚠️ `seo.opportunities` specifically is SUPERSEDED by the real, more
 *    mature `@stratxcel/search-discovery` package's `analyzeTechnicalSeo`
 *    (discovered after this field was written -- see the gap audit's
 *    correction section and `search-growth-director.ts`'s own warning).
 *    Kept wired here because it's real and doesn't conflict at runtime, not
 *    because it's the intended long-term source of truth.
 *
 * Not yet real (typed, explicitly empty, documented per field below):
 *  - `trendSignals`: no dedicated trend relevance/explanation engine
 *    (brief Sections 17-20: velocity, hook, visual pattern, WHY_THIS_TREND)
 *    exists yet. `social.research` / `social.trendIntelligence` already
 *    carry the real (coarser) market-intelligence research this codebase
 *    does have; this field is reserved for the more structured signal the
 *    brief describes and stays empty until that engine is built.
 *  - `searchConsole`: no Search Console data-ingestion pipeline exists yet.
 */
export interface GrowthAutopilotContext {
  /** The full, real, existing canonical social/brand/business context. Unchanged. */
  social: SocialAutopilotContext;

  website: {
    url: string | null;
    /** Real crawl result when the caller has one this session; null otherwise -- never fabricated. */
    intelligence: NormalizedWebsiteIntelligence | null;
    /** No platform/CMS detector or Vercel/Hostinger connector exists yet (brief Sections 6, 7) -- honestly unresolved until built. */
    platform: "WORDPRESS" | "SHOPIFY" | "WIX" | "WEBFLOW" | "SQUARESPACE" | "VERCEL" | "NEXTJS" | "STATIC_HTML" | "CUSTOM" | "UNKNOWN";
    /** No website-authorization/connector flow exists yet -- always NONE until one is built and a real customer grant exists. */
    authorization: "NONE" | "ANALYZE_ONLY" | "AUTHORIZED_CHANGES";
  };

  googleBusiness: {
    status: "NOT_CHECKED" | "NOT_FOUND" | "FOUND_UNVERIFIED" | "FOUND_VERIFIED";
    profile: GoogleBusinessLocationDetails | null;
    verification: GoogleVerificationStatus | null;
    verificationGuide: GbpVerificationGuide | null;
  };

  seo: {
    /** Real, read directly off `website.intelligence.seo` when a crawl exists -- null otherwise. */
    technicalSnapshot: NormalizedWebsiteIntelligence["seo"] | null;
    /** Real, computed by `computeSeoOpportunities` from `website.intelligence` -- empty when no crawl exists yet, or when the crawl found nothing to flag. */
    opportunities: SeoAction[];
  };

  aeo: {
    /** Real, computed by `computeAeoOpportunities` from `website.intelligence.business`. */
    opportunities: AeoAction[];
  };

  geo: {
    /** Real, computed by `computeGeoOpportunities` from `website.intelligence` cross-referenced against `googleBusiness.profile`. Existing GBP completeness audit (lib/google/google-growth-engine.ts auditGoogleBusinessProfile) is a separate, complementary check, not duplicated here. */
    opportunities: GeoAction[];
  };

  /** Reserved for the trend relevance/explanation engine described in brief Sections 17-20. No real implementation exists yet -- always empty until one is built. */
  trendSignals: Array<{
    trend: string;
    platform: string;
    source: string;
    observedAt: string;
    whyThisTrend: string;
    whyItMatters: string;
    relevance: "USE_NOW" | "ADAPT" | "MONITOR" | "IGNORE";
    confidence: "HIGH" | "MEDIUM" | "LOW";
  }>;

  /** Reserved for real Search Console data (brief Section 9). No ingestion pipeline exists yet -- always null. */
  searchConsole: {
    connected: boolean;
    lastSyncedAt: string | null;
  } | null;
}

/**
 * Pure assembler, no I/O -- mirrors `buildSocialAutopilotContext`'s
 * contract exactly. Callers pass in whatever real data they already have
 * this session; anything they don't have is left honestly absent rather
 * than fetched or fabricated here.
 */
export function buildGrowthAutopilotContext(input: {
  social: SocialAutopilotContext;
  websiteUrl?: string | null;
  websiteIntelligence?: NormalizedWebsiteIntelligence | null;
  websitePlatform?: GrowthAutopilotContext["website"]["platform"];
  websiteAuthorization?: GrowthAutopilotContext["website"]["authorization"];
  googleBusinessStatus?: GrowthAutopilotContext["googleBusiness"]["status"];
  googleBusinessProfile?: GoogleBusinessLocationDetails | null;
  googleBusinessVerification?: GoogleVerificationStatus | null;
  googleBusinessVerificationGuide?: GbpVerificationGuide | null;
}): GrowthAutopilotContext {
  return {
    social: input.social,

    website: {
      url: input.websiteUrl ?? null,
      intelligence: input.websiteIntelligence ?? null,
      platform: input.websitePlatform ?? "UNKNOWN",
      authorization: input.websiteAuthorization ?? "NONE",
    },

    googleBusiness: {
      status: input.googleBusinessStatus ?? "NOT_CHECKED",
      profile: input.googleBusinessProfile ?? null,
      verification: input.googleBusinessVerification ?? null,
      verificationGuide: input.googleBusinessVerificationGuide ?? null,
    },

    seo: {
      technicalSnapshot: input.websiteIntelligence?.seo ?? null,
      opportunities: input.websiteIntelligence ? computeSeoOpportunities(input.websiteIntelligence) : [],
    },

    aeo: {
      opportunities: input.websiteIntelligence ? computeAeoOpportunities(input.websiteIntelligence) : [],
    },

    geo: {
      opportunities: input.websiteIntelligence
        ? computeGeoOpportunities(input.websiteIntelligence, input.googleBusinessProfile ?? null)
        : [],
    },

    trendSignals: [],

    searchConsole: null,
  };
}
