/**
 * Which subscription entitlement metric (if any) a service-catalogue key is
 * metered against. Deliberately empty tonight: no product decision yet ties
 * a specific mission service to social_posts/meta_ad_campaigns/whatsapp_
 * contacts/website_maintenance, and subscriptions have never been
 * purchasable in production — every tenant currently has zero
 * usage_entitlements rows. Wiring a mapping in before that policy is
 * approved would silently block/hold every mission for every real customer
 * tonight, which is exactly the "invented customer-facing quota" this
 * repository's rules forbid.
 *
 * The capability is real and wired end to end (mission-worker calls
 * hasEntitlement for any service key present here); only the mapping itself
 * is the pending business decision. Add entries here once approved — no
 * other code changes needed.
 */
export const MISSION_SERVICE_ENTITLEMENT_MAP: Readonly<
  Record<string, "social_posts" | "meta_ad_campaigns" | "whatsapp_contacts" | "website_maintenance">
> = {};

export function getRequiredEntitlementMetric(serviceKey: string | null): string | null {
  if (!serviceKey) return null;
  return MISSION_SERVICE_ENTITLEMENT_MAP[serviceKey] ?? null;
}
