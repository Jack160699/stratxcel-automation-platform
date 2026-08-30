/**
 * Server-authoritative visual-archetype routing (Subscription-Gated
 * Visual Archetypes brief Sections 7-9, 22): the SOLE place tier +
 * saved-preference truth turns into an ArchetypeRoutingContext
 * (creative-treatment.ts) or a manual-generation accept/reject decision.
 * Every caller (automated cron path, manual-generation API route) must go
 * through this module -- never re-derive archetype permissions inline.
 *
 * Locked commercial rule (real decision, not an inference):
 *   Starter (₹2,999):  automated Social Autopilot ON, forced BASIC_ESSENTIAL
 *                       always, 12/month automated, 0/month manual (no
 *                       manual-generation access at all at this tier).
 *   Growth (₹7,999):   automated Social Autopilot ON, 30/month cycling the
 *                       tenant's saved 1-3 preferred archetypes, 10/month
 *                       manual with an explicit per-generation archetype
 *                       choice (must be one of the saved preferences).
 *   Business:          same behavior as Growth (not separately specified
 *                       by the brief; mirrors Growth since Business is a
 *                       superset of Growth everywhere else in
 *                       PLAN_CAPABILITIES/PLAN_LIMITS).
 *
 * Current (v3) catalog mapping -- verified against the real, live
 * PLAN_LIMITS in packages/payments-and-wallet/src/entitlements.ts, not
 * guessed from plan names or marketing copy:
 *   advanced_social, advanced_growth: the only two v3 tiers with nonzero
 *                       social_autopilot_automated_monthly/manual_monthly
 *                       (28/10 each, live-confirmed) -- routed to the same
 *                       "business" archetype bucket as legacy Growth/
 *                       Business (full preference-rotation automated,
 *                       full manual archetype selection).
 *   seo, social, seo_and_social, advanced_seo: PLAN_LIMITS gives these
 *                       0/0 for both social_autopilot_automated_monthly
 *                       and social_autopilot_manual_monthly -- zero real
 *                       Social Autopilot capability today, so they are
 *                       deliberately left unmapped (same safe
 *                       "no archetype access" fallback as any other tier
 *                       without the capability). Not an oversight -- if
 *                       one of these tiers ever gains a real automated/
 *                       manual quota, add it here alongside its PLAN_LIMITS
 *                       change, per docs/architecture/
 *                       RAZORPAY_RECONCILIATION_AND_PLAN_TIERS.md's
 *                       "adding a new plan tier" checklist.
 *
 * Pure and deterministic: no AI call, no I/O -- callers fetch plan_tier
 * and the tenant's social_autopilot_visual_preferences row and pass them
 * in. Never trusts a client-supplied tier or preference list; those must
 * come from the caller's own canonical DB reads.
 */

import { ARCHETYPE_IDS, ARCHETYPE_REGISTRY, isValidArchetype, archetypesForTier, type LayoutArchetype, type ArchetypeTier } from "./archetype-registry.ts";
import type { ArchetypeRoutingContext } from "./creative-treatment.ts";
import { selectLeastRecentlyUsed } from "./content-diversity.ts";

/** Real plan tiers this module knows how to route -- a superset of
 * ArchetypeTier (which only covers the three that can ever hold a
 * premium archetype) so free/legacy tiers fail closed explicitly rather
 * than needing every caller to pre-filter. Includes both the current (v3)
 * self-service catalog and the legacy DB-compatibility tiers -- see
 * packages/payments-and-wallet/src/plans.ts for the canonical tier list. */
export type SubscriptionPlanTier =
  | "free"
  | "starter"
  | "growth"
  | "business"
  | "scale"
  | "launch"
  | "custom_growth"
  | "seo"
  | "social"
  | "seo_and_social"
  | "advanced_seo"
  | "advanced_social"
  | "advanced_growth";

/** The ONE place a real subscription plan_tier string turns into an
 * internal archetype-capability bucket. Every caller that needs this
 * mapping (automated/manual routing below, and the visual-preferences API
 * route) must go through this -- never re-derive it with an inline
 * tier-equality check, which is exactly how advanced_social/advanced_growth
 * silently lost premium archetype access the first time this was written
 * in more than one place. */
export function toArchetypeTier(tier: SubscriptionPlanTier): ArchetypeTier | null {
  if (tier === "starter" || tier === "growth" || tier === "business") return tier;
  // advanced_social / advanced_growth: the only v3 tiers with a nonzero
  // social_autopilot_automated_monthly/manual_monthly quota (28/10, both
  // live-confirmed in PLAN_LIMITS) -- same premium archetype-rotation +
  // manual-selection behavior as legacy Growth/Business.
  if (tier === "advanced_social" || tier === "advanced_growth") return "business";
  // seo/social/seo_and_social/advanced_seo: 0/0 for both real
  // social_autopilot quotas today -- no Social Autopilot archetype access,
  // same safe fallback as scale/launch/custom_growth (legacy/quote-led,
  // never part of this feature's commercial offer). Fail closed (Section
  // 22: "No subscription -> deny premium archetype access") rather than
  // guess which existing tier an unmapped one should behave like.
  return null;
}

/**
 * Corrupt/invalid/deleted-archetype defense (Section 2's DB rules, Section
 * 22's "corrupt preference array -> sanitize/reject and fall back
 * safely"): never trust a preference list at face value, even one read
 * back from the DB (its own CHECK constraints should already guarantee
 * this, but a second, cheap, server-side check costs nothing and this
 * function is the one place both the automated and manual paths share).
 * Filters to real registered archetype ids, dedupes, caps at 3.
 */
export function sanitizePreferredArchetypes(raw: unknown): LayoutArchetype[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<LayoutArchetype>();
  for (const value of raw) {
    if (isValidArchetype(value) && !seen.has(value)) seen.add(value);
    if (seen.size >= 3) break;
  }
  return [...seen];
}

export interface AutomatedRoutingResult {
  routingContext: ArchetypeRoutingContext;
  /** Set only when a fallback was actually used (no subscription, no
   * valid preferences, etc.) -- Section 22: "the fallback should be
   * documented and safe." Callers should log this for observability, not
   * silently swallow it. */
  fallbackReason: string | null;
}

/**
 * RULE A (₹2,999 automated) + RULE B (₹7,999/Business automated).
 * `recentArchetypeHistory` should be the tenant's own most-recently-used
 * archetypes (most recent first is fine, order doesn't matter to
 * selectLeastRecentlyUsed) -- drives real rotation/diversity (Section 9),
 * not "always choose the first preference."
 */
export function resolveAutomatedRouting(input: {
  tier: SubscriptionPlanTier;
  preferredArchetypes: unknown;
  recentArchetypeHistory?: LayoutArchetype[];
}): AutomatedRoutingResult {
  const archetypeTier = toArchetypeTier(input.tier);

  if (archetypeTier === "starter") {
    return {
      routingContext: {
        forcedArchetype: "BASIC_ESSENTIAL",
        allowedArchetypes: ["BASIC_ESSENTIAL"],
        reason: "Starter (₹2,999) automated Social Autopilot is always BASIC_ESSENTIAL -- no premium archetype selection at this tier.",
      },
      fallbackReason: null,
    };
  }

  if (archetypeTier === "growth" || archetypeTier === "business") {
    const sanitized = sanitizePreferredArchetypes(input.preferredArchetypes);
    if (sanitized.length >= 1) {
      const chosen = selectLeastRecentlyUsed(sanitized, input.recentArchetypeHistory ?? []);
      return {
        routingContext: {
          forcedArchetype: chosen,
          allowedArchetypes: sanitized,
          reason: `${archetypeTier === "growth" ? "Growth" : "Business"} automated: rotated via least-recently-used among this tenant's ${sanitized.length} saved archetype preference(s).`,
        },
        fallbackReason: null,
      };
    }
    // Section 22: "₹7,999 with no saved preferences -> deterministic safe
    // fallback and onboarding required where appropriate." Never silently
    // choose an arbitrary premium archetype -- BASIC_ESSENTIAL is the one
    // archetype every tier is always allowed, so it's always a safe
    // fallback regardless of tier.
    return {
      routingContext: {
        forcedArchetype: "BASIC_ESSENTIAL",
        allowedArchetypes: ["BASIC_ESSENTIAL"],
        reason: "Safe fallback -- no valid saved archetype preferences for this tenant yet.",
      },
      fallbackReason: `${archetypeTier === "growth" ? "Growth" : "Business"} tenant has no valid saved visual-archetype preferences (social_autopilot_visual_preferences is empty or corrupt) -- falling back to BASIC_ESSENTIAL until archetype onboarding is completed.`,
    };
  }

  // No real subscription / an unsupported legacy tier -- deny premium
  // archetype access entirely, same fallback as the "no preferences" case.
  return {
    routingContext: {
      forcedArchetype: "BASIC_ESSENTIAL",
      allowedArchetypes: ["BASIC_ESSENTIAL"],
      reason: "Safe fallback -- no active subscription tier with Social Autopilot visual-archetype access.",
    },
    fallbackReason: `Tenant's resolved plan tier ("${input.tier}") has no Social Autopilot visual-archetype routing defined -- falling back to BASIC_ESSENTIAL.`,
  };
}

export interface ManualRoutingRejection {
  code: "TIER_NO_MANUAL_ACCESS" | "UNKNOWN_ARCHETYPE" | "ARCHETYPE_NOT_ALLOWED_FOR_TIER" | "ARCHETYPE_NOT_IN_PREFERENCES" | "NO_SUBSCRIPTION";
  message: string;
}
export type ManualRoutingResult =
  | { ok: true; routingContext: ArchetypeRoutingContext }
  | { ok: false; error: ManualRoutingRejection };

/**
 * RULE C (₹7,999/Business manual generation). Validates a client-supplied
 * `requestedArchetype` against real, server-resolved tier + saved-
 * preference truth -- never trusts the request body's tier or preference
 * claims, only what the caller already read from the DB. On success,
 * forces the exact requested archetype (the AI must not select another
 * layout); on failure, returns a structured, specific rejection rather
 * than silently substituting a different archetype.
 */
export function resolveManualRouting(input: {
  tier: SubscriptionPlanTier;
  preferredArchetypes: unknown;
  requestedArchetype: unknown;
}): ManualRoutingResult {
  const archetypeTier = toArchetypeTier(input.tier);

  if (!archetypeTier) {
    return { ok: false, error: { code: "NO_SUBSCRIPTION", message: "This workspace has no active subscription with Social Autopilot access." } };
  }

  // Starter: manual/on-demand generation is a Growth+ capability entirely,
  // not just a smaller allowance -- 0 manual credits/month means no
  // manual-generation access at all, full stop, regardless of what
  // archetype was requested.
  if (archetypeTier === "starter") {
    return { ok: false, error: { code: "TIER_NO_MANUAL_ACCESS", message: "Manual/on-demand generation isn't available on Starter. Upgrade to Growth for manual archetype control." } };
  }

  if (!isValidArchetype(input.requestedArchetype)) {
    return { ok: false, error: { code: "UNKNOWN_ARCHETYPE", message: "The requested visual archetype doesn't exist." } };
  }

  const requested = input.requestedArchetype;
  const tierAllowed = archetypesForTier(archetypeTier);
  if (!tierAllowed.includes(requested)) {
    return { ok: false, error: { code: "ARCHETYPE_NOT_ALLOWED_FOR_TIER", message: `"${ARCHETYPE_REGISTRY[requested].name}" isn't available on your current plan.` } };
  }

  const sanitized = sanitizePreferredArchetypes(input.preferredArchetypes);
  // Product rule (brief Section 7 Rule C point 6): manual generation must
  // pick from the tenant's own saved preferences, not any tier-allowed
  // archetype at large -- prevents a Growth tenant from generating with an
  // archetype they never actually selected during onboarding.
  if (!sanitized.includes(requested)) {
    return { ok: false, error: { code: "ARCHETYPE_NOT_IN_PREFERENCES", message: `"${ARCHETYPE_REGISTRY[requested].name}" isn't one of your saved visual-style preferences. Update your preferences in onboarding to use it.` } };
  }

  return {
    ok: true,
    routingContext: {
      forcedArchetype: requested,
      allowedArchetypes: sanitized,
      reason: `Manual generation: tenant explicitly requested and is authorized for "${requested}".`,
    },
  };
}

/** Re-exported for callers that only need "what archetypes exist for this
 * tier" without a full routing decision (e.g. the onboarding gallery). */
export { archetypesForTier, ARCHETYPE_IDS, ARCHETYPE_REGISTRY };
