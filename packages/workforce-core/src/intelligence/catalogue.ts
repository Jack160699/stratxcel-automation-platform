import type { PlanCatalogueEntryInput } from "./types.ts";

export interface PlanDefinitionInput {
  tier: string;
  publicName: string;
  priceCents: number | null;
  /** Accepts PlanEntitlementLimits or a plain record. */
  entitlements: Readonly<Partial<Record<string, number>>> | Record<string, number>;
  selfServiceCheckout: boolean;
  status: "active" | "legacy";
}

function domainsForEntitlements(ent: Readonly<Partial<Record<string, number>>> | Record<string, number>): string[] {
  const d = new Set<string>();
  if ((ent.whatsapp_contacts ?? 0) > 0) d.add("crm");
  if ((ent.website_maintenance ?? 0) > 0) d.add("website");
  if ((ent.social_posts ?? 0) > 0) {
    d.add("social");
    d.add("seo");
  }
  if ((ent.meta_ad_campaigns ?? 0) > 0) d.add("ads");
  if (d.size === 0) d.add("strategy");
  return [...d];
}

/**
 * STRATXCEL full-system closure brief, Section 28 (regression sweep): real
 * bug found live -- this table was never updated for the real commercial-
 * model v3 catalog migration (packages/payments-and-wallet/src/plans.ts).
 * Every real, current, active plan tier (seo, social, seo_and_social,
 * advanced_seo, advanced_social, advanced_growth, website_landing_page,
 * website_standard) fell through to the same `?? 99` default below,
 * making evaluateCommercialFit's whole "prefer the smallest/cheapest plan
 * that covers the bottleneck over a bigger one" real business logic
 * nondeterministic for the entire real, current catalog -- confirmed live:
 * a real test using seo (₹2,999) vs advanced_growth (₹18,498, the
 * flagship) for a bottleneck both genuinely cover returned advanced_growth
 * (the MORE expensive option), the opposite of the real intended
 * "smallest covering option" behavior. Ranked by real, current price
 * (packages/payments-and-wallet/src/plans.ts's own PLAN_DEFINITIONS),
 * ascending -- never guessed. Legacy tiers kept (their own real comment:
 * "retained for historical row readability only") so an old subscription
 * row still ranks sanely if ever compared, but they're excluded from the
 * real active catalogue upstream (buildCatalogueFromPlanDefinitions's own
 * `status === "active"` filter below) so never actually compete with a
 * real current recommendation.
 */
const TIER_RANK: Record<string, number> = {
  free: 0,
  website_landing_page: 1, // ₹999 one-time
  seo: 2, // ₹2,999/mo
  website_standard: 2, // ₹2,999 one-time
  social: 3, // ₹3,999/mo
  seo_and_social: 4, // ₹6,998/mo
  advanced_social: 5, // ₹8,499/mo
  advanced_seo: 6, // ₹9,999/mo
  advanced_growth: 7, // ₹18,498/mo -- real flagship, ranks highest
  // Legacy DB tiers (never in the real active catalogue -- see comment above).
  starter: 2,
  growth: 5,
  business: 7,
  launch: 1,
  custom_growth: 6,
  scale: 8,
};

export function buildCatalogueFromPlanDefinitions(plans: readonly PlanDefinitionInput[], auditOneTime = true): PlanCatalogueEntryInput[] {
  const entries = plans.filter((p) => p.status === "active").map((p) => ({
    planKey: p.tier,
    label: p.publicName,
    tierRank: TIER_RANK[p.tier] ?? 99,
    coveredDomains: domainsForEntitlements(p.entitlements),
    coveredCapabilities: domainsForEntitlements(p.entitlements).map((d) => `${d}.audit`),
    entitlementKeys: Object.keys(p.entitlements).filter((k) => (p.entitlements[k] ?? 0) > 0),
    isPurchasable: p.selfServiceCheckout,
  }));
  if (auditOneTime) entries.push({ planKey: "brand_audit", label: "Business Growth Audit (one-time)", tierRank: 0, coveredDomains: ["strategy", "analytics"], coveredCapabilities: ["brand.audit"], entitlementKeys: [], isPurchasable: true });
  return entries;
}
