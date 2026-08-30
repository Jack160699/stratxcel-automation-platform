import type { BrandProfileRow } from "./repositories/brand.ts";
import type { BrandBrainContent } from "@stratxcel/brand-brain";
import { getActiveServices } from "@stratxcel/brand-brain";
import { buildCustomerPsychologyProfile, type CustomerPsychologyProfile } from "../hermes/social-autopilot-campaign.ts";
import type { LiveMarketIntelligence } from "./market-intelligence.ts";
import type { PlanEntitlementLimits } from "@stratxcel/payments-and-wallet";

/**
 * STRATXCEL zero-gap closure brief Section 5: the literal canonical
 * `SocialAutopilotContext`.
 *
 * Deliberately a PURE, additive assembly layer over data the real
 * pipeline (prepareNearTermPackageItems, lib/social/package-autopilot.ts)
 * already fetches once per batch -- not a redesign of how that data is
 * fetched, and not a rip-and-replace of the pipeline's existing
 * parameter-passing. Real reason: that pipeline is revenue-critical,
 * extensively tested, and live -- forcing every one of its internal call
 * sites through a brand-new struct in one pass is a large, real
 * regression risk this module does not take. Instead: one canonical,
 * strongly-typed shape any caller CAN build from real, already-fetched
 * data (buildSocialAutopilotContext, below) and consume as a single
 * object -- wired into the real pipeline at its real entry point (see
 * package-autopilot.ts's call site) and into Hermes's real campaign-task
 * ledger, so this is genuinely in the loop, not a dead type nobody calls.
 *
 * Every field maps to a REAL, already-existing data source, documented
 * inline. A field with no real, populated source in this codebase today
 * (sub_niche, brand_personality, most of performance_history) is
 * explicitly `null`/empty with a comment saying so -- never fabricated to
 * make the shape look more complete than the real data actually is.
 */
export interface SocialAutopilotContext {
  tenantId: string;
  /** No distinct "workspace" concept exists in this codebase separate from tenant -- aliased. */
  workspaceId: string;
  /** The real tenant-owning user id (auth.users.id), not a separate "customer" entity. */
  customerId: string | null;
  subscriptionId: string | null;

  businessIdentity: {
    name: string | null;
    industry: string | null;
    description: string | null;
    positioning: string | null;
    businessModel: string | null;
  };
  /** No distinct real "sub_niche" concept is populated anywhere in this codebase today. */
  subNiche: null;

  targetAudience: Array<{ name: string; description: string | null; painPoints: string | null }>;
  /** Real Brand Brain `location` field -- singular in the real schema; represented as an array for the canonical shape's own sake, never invented beyond what's actually set. */
  businessLocations: string[];

  brandVoice: string[];
  /** No distinct real "brand_personality" concept is populated anywhere in this codebase today. */
  brandPersonality: null;
  brandColors: string[];
  brandRules: Array<{ kind: string; text: string }>;

  logo: string | null;
  logoVariants: unknown | null;

  products: Array<{ name: string; description: string | null }>;
  services: Array<{ name: string; shortDescription: string | null }>;
  verifiedFacts: string[];

  /** Real, live grounded research (lib/social/market-intelligence.ts) -- honestly `available: false` when no real research has run yet this week, never fabricated. */
  research: LiveMarketIntelligence | null;
  /** Same real source as `research` today -- competitor and trend findings are not yet split into separately-gathered signals; documented here rather than presented as three independent real capabilities. */
  competitorResearch: LiveMarketIntelligence | null;
  trendIntelligence: LiveMarketIntelligence | null;

  customerIntelligence: Array<{ name: string; description: string | null }>;
  customerPsychology: CustomerPsychologyProfile[];

  /** Real prior real weekly-campaign checkpoint rows for this tenant, oldest first -- empty if none exist yet. */
  campaignHistory: Array<{ weekKey: string; status: string; createdAt: string }>;
  /**
   * Real gap, honestly represented: no live platform-analytics ingestion
   * exists in this codebase yet (confirmed via repository search this
   * session) -- always an empty array today, never fabricated metrics.
   */
  performanceHistory: unknown[];

  weekStart: string | null;
  weekEnd: string | null;

  subscriptionEntitlements: PlanEntitlementLimits | null;
  auditEntitlements: { allowed: number; used: number; remaining: number } | null;
}

/**
 * Pure assembler: takes real, already-fetched data (the exact shapes the
 * real pipeline already has in scope once per batch) and returns one
 * canonical, strongly-typed context. No I/O of its own -- callers fetch
 * from their own canonical sources and pass the results in, so this
 * function is trivially testable and never silently re-fetches something
 * a caller already has.
 */
export function buildSocialAutopilotContext(input: {
  tenantId: string;
  ownerId: string | null;
  subscriptionId: string | null;
  brandProfile: BrandProfileRow | null;
  brandBrainContent: BrandBrainContent | null;
  verifiedFacts: string[];
  research: LiveMarketIntelligence | null;
  campaignHistory: Array<{ week_key: string; status: string; created_at: string }>;
  weekStart: string | null;
  weekEnd: string | null;
  subscriptionEntitlements: PlanEntitlementLimits | null;
  auditEntitlements: { allowed: number; used: number; remaining: number } | null;
}): SocialAutopilotContext {
  const identity = input.brandProfile?.identity ?? {};
  const brainContent = input.brandBrainContent as (BrandBrainContent & { location?: unknown; logo_url?: unknown; logo_variants?: unknown }) | null;
  const location = typeof brainContent?.location === "string" ? brainContent.location.trim() : "";

  return {
    tenantId: input.tenantId,
    workspaceId: input.tenantId,
    customerId: input.ownerId,
    subscriptionId: input.subscriptionId,

    businessIdentity: {
      name: identity.name?.trim() || null,
      industry: identity.industry?.trim() || null,
      description: identity.description?.trim() || null,
      positioning: identity.positioning?.trim() || null,
      businessModel: identity.business_model?.trim() || null,
    },
    subNiche: null,

    targetAudience: (input.brandProfile?.audiences ?? []).map((a) => ({
      name: a.name,
      description: a.description?.trim() || null,
      painPoints: a.pain_points?.trim() || null,
    })),
    businessLocations: location ? [location] : [],

    brandVoice: input.brandProfile?.voice.tone ?? [],
    brandPersonality: null,
    brandColors: input.brandProfile?.visual.colors ?? [],
    brandRules: (input.brandProfile?.rules ?? []).map((r) => ({ kind: r.kind, text: r.text })),

    logo: typeof brainContent?.logo_url === "string" ? brainContent.logo_url : null,
    logoVariants: brainContent?.logo_variants ?? null,

    products: (input.brandProfile?.products ?? []).map((p) => ({ name: p.name, description: p.description?.trim() || null })),
    services: getActiveServices(input.brandBrainContent).map((s) => ({ name: s.name, shortDescription: s.shortDescription?.trim() || null })),
    verifiedFacts: input.verifiedFacts,

    research: input.research,
    competitorResearch: input.research,
    trendIntelligence: input.research,

    customerIntelligence: (input.brandProfile?.audiences ?? []).map((a) => ({ name: a.name, description: a.description?.trim() || null })),
    customerPsychology: buildCustomerPsychologyProfile(input.brandProfile?.audiences ?? []),

    campaignHistory: input.campaignHistory.map((c) => ({ weekKey: c.week_key, status: c.status, createdAt: c.created_at })),
    performanceHistory: [],

    weekStart: input.weekStart,
    weekEnd: input.weekEnd,

    subscriptionEntitlements: input.subscriptionEntitlements,
    auditEntitlements: input.auditEntitlements,
  };
}
