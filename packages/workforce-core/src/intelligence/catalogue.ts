import type { PlanCatalogueEntryInput } from "./types.ts";

export interface PlanDefinitionInput {
  tier: string;
  publicName: string;
  priceCents: number | null;
  entitlements: Record<string, number>;
  selfServiceCheckout: boolean;
  status: "active" | "legacy";
}

function domainsForEntitlements(ent: Record<string, number>): string[] {
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

const TIER_RANK: Record<string, number> = { starter: 1, growth: 2, business: 3, scale: 4, free: 0 };

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
