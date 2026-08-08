/**
 * Whether website-capability entitlement checks actually block anything
 * yet. Deliberately false tonight: subscriptions have never been
 * purchasable in production, so every tenant currently has zero
 * usage_entitlements rows — hard-gating website creation/revision on
 * `website_maintenance` right now would silently break the feature for
 * every current user. Callers (the app's API routes, which already depend
 * on @stratxcel/payments-and-wallet) call the real hasEntitlement helper
 * themselves and consult this flag to decide whether a denial should
 * actually block the request — exactly like
 * packages/missions/src/entitlement-map.ts's empty map, for the same
 * reason. This package intentionally has no Supabase/payments dependency of
 * its own.
 */
export const WEBSITE_ENTITLEMENT_ENFORCED = false;
