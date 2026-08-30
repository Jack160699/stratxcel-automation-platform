import type { ServiceClient } from "@stratxcel/whatsapp";
import { isKillSwitchActive, recordWorkerHeartbeat } from "@stratxcel/queue";
import crypto from "node:crypto";
import { scheduleJob } from "./repositories/publishing.ts";
import { runPublishNow } from "./agent/publish-outcome.ts";
import { getBoundBrandProfile } from "./repositories/brand.ts";
import { createContentMaster, createContentVariant } from "./repositories/content.ts";
import { resolveConfiguredProvider } from "./agent/provider.ts";
import { selectGeminiBrandInstructions } from "./agent/gemini-boundary.ts";
import { requirePlatform, CONTENT_OBJECTIVE_VALUES, type ContentObjective } from "./content-options.ts";
import { computePackageDistribution, datetimeLocalValueToUtcIso } from "./package-distribution.ts";
import { notifyPackageEvent } from "./package-whatsapp-notify.ts";
import type { OwnerContext } from "./db-context.ts";
import type { AgentTenantContext } from "./agent-tenant-types.ts";
import { validatePackageComposition, compositionMediaTypeForUnit, resolvePurchasedPackageComposition, type PackageComposition } from "./package-composition.ts";
import { selectPackageMediaAsset } from "./package-media.ts";
import { generateNetNewPackageMediaAsset, NetNewGenerationError } from "./package-net-new-media.ts";
import { recordAudit } from "./repositories/system.ts";
import { recordCampaignTask, buildCustomerPsychologyProfile, type HermesSocialSpecialistRole } from "../hermes/social-autopilot-campaign.ts";
import { hasCapability, isPlanTier } from "@stratxcel/payments-and-wallet";
import { getCurrentBrandBrain, getActiveServices } from "@stratxcel/brand-brain";
import { createSocialAuditConnectorInsightsProvider } from "./audit-connector-insights.ts";
import { buildVerifiedBusinessInformation } from "./package-business-facts.ts";
import { buildCreativeBrief, formatCreativeBriefForPrompt, selectObjective } from "./creative-brief.ts";
import { deriveBusinessContentIntelligence } from "./business-intelligence.ts";
import { buildCampaignStrategy } from "./campaign-strategy-planner.ts";
import { evaluateVisualQuality } from "./visual-quality-score.ts";
import { runGenerationLoop } from "./generation-loop.ts";
import { parseGeneratedCopy, type GeneratedCopy } from "./generated-copy-parser.ts";
import { buildCreativeTreatmentPrompt, validateCreativeTreatment, forceArchetypeOntoTreatment, safeParseJson, type CreativeTreatment, type LayoutArchetype } from "./creative-treatment.ts";
import { deriveBrandVisualDNA } from "./brand-visual-dna.ts";
import { getIndustryVisualVocabulary } from "./industry-visual-vocabulary.ts";
import { researchInsightsForIndustry } from "./visual-research-library.ts";
import { resolveAutomatedRouting } from "./archetype-routing.ts";
import { seasonalContextLine } from "./festival-calendar.ts";
import { ensureWeeklyCampaignForTenant } from "./weekly-campaign.ts";
import { gatherLiveMarketIntelligence, type LiveMarketIntelligence } from "./market-intelligence.ts";
import { buildSocialAutopilotContext } from "./social-autopilot-context.ts";
import { ingestSocialPerformanceForTenant } from "./analytics-ingestion.ts";
import { runMondayPerformanceAnalysisForTenant, type PerformanceAnalysis } from "./performance-analysis.ts";

/** Hermes-Orchestrated Content Engine Hardening mission Section 2: how far
 * ahead of a post's own scheduled date to surface a real upcoming
 * festival/season -- deliberately distinct from preparation_horizon_days
 * (which governs WHEN content gets prepared, not how far to look for
 * occasions relative to the post's own date). One week is enough for a
 * genuinely upcoming occasion to feel timely without stretching "upcoming"
 * past the point of relevance. */
const FESTIVAL_LOOKAHEAD_DAYS = 7;

/**
 * Mission F Section 3/11: a real, STAGED recovery policy, not a flat retry
 * count. "2 -> 10, same prompt repeated" was explicitly rejected -- every
 * one of these attempts (retry_count 0..MAX_RECOVERY_ATTEMPTS-1) forces a
 * materially different generation strategy (see the recovery-stage logic in
 * prepareNearTermPackageItems below), so a real quality/originality
 * rejection gets a genuine chance to become a genuinely different, passing
 * post instead of permanently consuming one of the customer's paid days.
 * Still bounded (Section 11's dead-letter safety limit): each attempt is a
 * real, possibly-billable AI call sequence, not a free re-roll. Once
 * exhausted, the item is marked `recovery_exhausted` (Section 10) -- BLOCKED
 * stops meaning "still being retried" and starts meaning "needs a human
 * look" -- but it is never deleted, hidden, or silently dropped from the
 * campaign (Section 12).
 */
export const MAX_RECOVERY_ATTEMPTS = 4;

/** Mission F Section 6: one rejected attempt's real history -- what was
 * tried and why it failed. Read by the NEXT attempt on the same item to
 * force a genuinely different concept/pillar/objective, and to explain the
 * previous mistake explicitly rather than leaving it to be rediscovered. */
export interface RecoveryAttemptRecord {
  attempt: number;
  pillar: string | null;
  concept: string | null;
  objective: string | null;
  /** Real QualityFailureReason codes (e.g. "DUPLICATE_CONCEPT", "WEAK_CTA")
   * when the failure came from the quality gate; empty when it came from
   * something else (missing provider, image generation, etc). */
  failureReasons: string[];
  at: string;
}

export {
  assignBrandProfileToTenant,
  assignSocialAccountToTenant,
  listAssignablePackageResources,
  decideBrandAssignment,
  decideAccountAssignment,
} from "./package-tenant-assignment.ts";
export { getPackageQueueItemPreview } from "./package-preview.ts";
export {
  resolvePurchasedPackageComposition,
  formatPackageCompositionLabel,
  compositionUnitTotal,
  PLAN_PACKAGE_COMPOSITIONS,
} from "./package-composition.ts";
export { utcIsoToDatetimeLocalValue, datetimeLocalValueToUtcIso, utcIsoToZonedWallParts } from "./package-distribution.ts";

/** Finalize Autopilot Pipeline mission: video generation is not supported
 * yet, so YouTube (a video-only destination) must never be scheduled by
 * the automatic planning cycle -- only image/text-capable platforms are
 * eligible. Enforced here, the deepest/most authoritative layer (not just
 * the UI's default selection), so a client-supplied allowedPlatforms list
 * can never smuggle youtube back in at activation or scope-change time,
 * regardless of caller. */
export const AUTOPILOT_SCHEDULABLE_PLATFORMS = ["facebook", "instagram", "threads", "linkedin"] as const;
function stripUnschedulablePlatforms(platforms: string[]): string[] {
  return platforms.filter((platform) => (AUTOPILOT_SCHEDULABLE_PLATFORMS as readonly string[]).includes(platform));
}

export type PackagePublishingMode = "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";
export type PackageAuthorizationState = "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED" | "NEEDS_ATTENTION";
export type QueueItemStatus =
  | "PLANNED"
  | "PREPARED"
  | "REVIEW_REQUIRED"
  | "SCHEDULED"
  | "EXECUTING"
  | "PUBLISHED"
  | "FAILED"
  | "SKIPPED"
  | "SHADOW_COMPLETED"
  | "BLOCKED";
export type LateItemPolicy = "RESCHEDULE_NEXT_SLOT" | "SKIP" | "PUBLISH_IF_WITHIN_GRACE_WINDOW";
export type CountingPolicy = "CONTENT_UNIT" | "PLATFORM_PUBLISH";
export type SkipPolicy = "SKIP_COUNTS" | "SKIP_REPLACED";

export interface PackageAuthorizationRow {
  id: string;
  tenant_id: string;
  client_user_id: string;
  subscription_id: string;
  entitlement_id: string;
  publishing_mode: PackagePublishingMode;
  state: PackageAuthorizationState;
  allowed_platforms: string[];
  period_number: number;
  period_target_units: number;
  timezone: string;
  max_posts_per_day: number;
  preparation_horizon_days: number;
  late_item_policy: LateItemPolicy;
  grace_window_minutes: number;
  counting_policy: CountingPolicy;
  skip_policy: SkipPolicy;
  brand_profile_id: string;
  package_composition: PackageComposition;
  starts_at: string;
  ends_at: string | null;
  activated_at: string;
  revoked_at: string | null;
}

export interface PackageQueueItemRow {
  id: string;
  authorization_id: string;
  tenant_id: string;
  owner_id: string;
  variant_id: string | null;
  account_id: string;
  package_sequence: number;
  period_number: number;
  scheduled_at: string;
  status: QueueItemStatus;
  publishing_job_id: string | null;
  last_error: string | null;
  content_pillar: string | null;
  content_unit_key: string | null;
  content_master_id: string | null;
  media_type: string | null;
  claimed_at: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  /** Mission D+ Section 21: cross-pass retry counter for a BLOCKED item. 0 for every never-retried row. */
  retry_count: number;
  /** Mission F Section 6: this item's own rejected-attempt history. */
  recovery_state: RecoveryAttemptRecord[];
  /** Mission F Section 10/11: true once every staged recovery attempt has
   * been tried and failed -- excluded from further automatic pickup. */
  recovery_exhausted: boolean;
}

export interface PackagePublishClaim {
  allowed: boolean;
  reason: string;
  queueItemId?: string;
  tenantId?: string;
  ownerId?: string;
  accountId?: string;
  variantId?: string;
  shadowMode?: boolean;
}

/**
 * The ONE activation entry point (Section 7/8 of the release-candidate
 * brief): fails closed with a specific, actionable reason when a real
 * prerequisite is missing rather than silently activating something unsafe.
 * Idempotent — re-activating an existing (tenant, subscription, entitlement)
 * tuple updates it in place rather than creating a duplicate row, so a
 * user re-clicking "Activate" can't double-authorize.
 */
export async function activatePackageAutopilot(
  service: ServiceClient,
  input: {
    tenantId: string;
    clientUserId: string;
    subscriptionId: string;
    entitlementId: string;
    publishingMode: PackagePublishingMode;
    allowedPlatforms: string[];
    timezone?: string;
    maxPostsPerDay?: number;
    brandProfileId: string;
    /** Ignored for package Autopilot — composition always comes from the purchased plan catalog. */
    composition?: PackageComposition;
    startsAt?: string;
    endsAt?: string;
  }
) {
  const [{ data: membership }, { data: subscription }, { data: entitlement }] = await Promise.all([
    service.from("tenant_members").select("user_id").eq("tenant_id", input.tenantId).eq("user_id", input.clientUserId).maybeSingle(),
    service.from("subscriptions").select("id,status,current_period_start,current_period_end,plan_tier").eq("id", input.subscriptionId).eq("tenant_id", input.tenantId).maybeSingle(),
    service.from("usage_entitlements").select("id,metric,is_paused,limit_amount,current_usage").eq("id", input.entitlementId).eq("tenant_id", input.tenantId).eq("subscription_id", input.subscriptionId).maybeSingle(),
  ]);
  if (!membership) throw new Error("prerequisite_missing: this account is not a member of the client workspace");
  if (!subscription || subscription.status !== "active" || new Date(subscription.current_period_end).getTime() <= Date.now()) {
    throw new Error("prerequisite_missing: subscription is not active");
  }
  // Brief §1/§2: Social Autopilot is a Growth+ capability — Starter keeps
  // direct posting/scheduling/publishing but not the autonomous workflow.
  const planTier = isPlanTier(subscription.plan_tier) ? subscription.plan_tier : null;
  if (!planTier || !hasCapability(planTier, "social_autopilot")) {
    throw new Error("prerequisite_missing: Social Autopilot is not included in the current plan");
  }
  if (!entitlement || entitlement.metric !== "social_posts" || entitlement.is_paused) {
    throw new Error("prerequisite_missing: plan does not include an active social_posts entitlement");
  }
  const platforms = stripUnschedulablePlatforms([...new Set(input.allowedPlatforms.map((value) => value.toLowerCase()).filter(Boolean))]);
  if (!platforms.length) throw new Error("prerequisite_missing: at least one allowed platform is required");

  // Fail closed rather than silently falling back to a wrong tenant/brand
  // (Section 9): every requested platform must resolve to a REAL connected
  // account explicitly bound to THIS tenant.
  const { data: boundAccounts } = await service
    .from("social_accounts")
    .select("id, platform")
    .eq("tenant_id", input.tenantId)
    .eq("status", "CONNECTED")
    .in("platform", platforms);
  const connectedPlatforms = new Set((boundAccounts ?? []).map((row) => String(row.platform).toLowerCase()));
  const missing = platforms.filter((platform) => !connectedPlatforms.has(platform));
  if (missing.length) throw new Error(`prerequisite_missing: connect ${missing.join(", ")} for this workspace before activating`);

  const { data: brand } = await service.from("social_brand_profiles").select("id,tenant_id").eq("id", input.brandProfileId).eq("tenant_id", input.tenantId).maybeSingle();
  if (!brand) throw new Error("brand_binding_invalid");

  // Composition MUST come from the purchased plan catalog — never a silent
  // text×packageSize fallback that could turn an image/reel package into text.
  const composition = resolvePurchasedPackageComposition({
    planTier: typeof subscription.plan_tier === "string" ? subscription.plan_tier : null,
    allowedPlatforms: platforms,
    publishingMode: input.publishingMode,
    entitlementLimit: entitlement.limit_amount,
  });
  if (!composition) throw new Error("package_configuration_required");
  const validated = validatePackageComposition(composition);

  const startsAt = input.startsAt ?? new Date().toISOString();
  const endsAt = input.endsAt ?? subscription.current_period_end;
  const { data, error } = await service
    .from("social_autopilot_authorizations")
    .upsert(
      {
        tenant_id: input.tenantId,
        client_user_id: input.clientUserId,
        subscription_id: input.subscriptionId,
        entitlement_id: input.entitlementId,
        publishing_mode: input.publishingMode,
        state: "ACTIVE",
        allowed_platforms: platforms,
        content_scope: { metric: "social_posts" },
        activated_at: new Date().toISOString(),
        starts_at: startsAt,
        ends_at: endsAt,
        period_number: 1,
        period_target_units: Math.max(0, entitlement.limit_amount - entitlement.current_usage),
        timezone: input.timezone ?? "Asia/Kolkata",
        max_posts_per_day: input.maxPostsPerDay ?? 1,
        brand_profile_id: brand.id,
        package_composition: validated,
        counting_policy: validated.countingPolicy,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,subscription_id,entitlement_id" }
    )
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not activate Social Autopilot");
  await recordAudit({ actorType: "USER", actorId: input.clientUserId, action: "social.package.activate", targetType: "social_autopilot_authorization", targetId: data.id, summary: "Activated package Social Autopilot", meta: { tenantId: input.tenantId, publishingMode: input.publishingMode, platforms, composition: validated.items } });
  return data as PackageAuthorizationRow;
}

/**
 * Social Autopilot — Complete Repair mission: the canonical paid-subscriber
 * flow is "customer pays -> system researches -> builds the strategy ->
 * schedules the whole period -> publishes daily", with no requirement to
 * manually click "Activate Autopilot". That pipeline (planPackagePeriod +
 * prepareNearTermPackageItems, the real research/personalization/quality-
 * gate engine already exercised by test:social-quality-campaign) already
 * exists and is already exhaustively tested -- the real, confirmed gap is
 * that nothing ever calls activatePackageAutopilot automatically. This is
 * the one, shared, idempotent entry point for both real trigger moments:
 *
 * 1. A subscription becomes active/charged on a plan with the
 *    social_autopilot capability (packages/payments-and-wallet's Razorpay
 *    webhook handler) -- covers renewals/upgrades where onboarding
 *    (brand profile + at least one connected platform) is already done.
 * 2. A social account finishes connecting (the OAuth callback) -- covers a
 *    brand-new paying customer whose payment succeeded before onboarding
 *    was complete, which activatePackageAutopilot's own real prerequisite
 *    checks (brand_binding_invalid / a missing connected platform) would
 *    otherwise always reject at payment time.
 *
 * Deliberately narrow and fail-silent: activatePackageAutopilot's own
 * prerequisite checks are the single source of truth for "is this tenant
 * actually ready" (never duplicated here), and any tenant that already has
 * an authorization row -- active, paused, or cancelled -- is left
 * completely alone, so this can never override a customer's own past
 * pause/cancel choice or fabricate a second parallel package. Combined
 * with activatePackageAutopilot's own upsert on the real
 * (tenant_id, subscription_id, entitlement_id) unique constraint, calling
 * this from a webhook that Razorpay may redeliver, or from a customer who
 * reconnects an account, is safe to call any number of times -- it never
 * creates a second campaign for the same subscription.
 */
export async function attemptAutoActivatePackageAutopilot(
  service: ServiceClient,
  input: { tenantId: string }
): Promise<
  | { activated: true; authorizationId: string }
  | { activated: false; reason: string }
> {
  try {
    const { data: existingAuth } = await service
      .from("social_autopilot_authorizations")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .limit(1)
      .maybeSingle();
    if (existingAuth) return { activated: false, reason: "authorization_already_exists" };

    const { data: subscription } = await service
      .from("subscriptions")
      .select("id, plan_tier, status, current_period_start, current_period_end")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .order("current_period_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!subscription || new Date(subscription.current_period_end).getTime() <= Date.now()) {
      return { activated: false, reason: "no_active_subscription" };
    }
    const planTier = isPlanTier(subscription.plan_tier) ? subscription.plan_tier : null;
    if (!planTier || !hasCapability(planTier, "social_autopilot")) {
      return { activated: false, reason: "plan_excludes_social_autopilot" };
    }

    const { data: entitlement } = await service
      .from("usage_entitlements")
      .select("id, is_paused, current_usage, limit_amount")
      .eq("tenant_id", input.tenantId)
      .eq("subscription_id", subscription.id)
      .eq("metric", "social_posts")
      .maybeSingle();
    if (!entitlement || entitlement.is_paused || entitlement.current_usage >= entitlement.limit_amount) {
      return { activated: false, reason: "no_usable_social_posts_entitlement" };
    }

    const { data: connectedAccounts } = await service
      .from("social_accounts")
      .select("platform, owner_id")
      .eq("tenant_id", input.tenantId)
      .eq("status", "CONNECTED");
    const platforms = stripUnschedulablePlatforms([
      ...new Set((connectedAccounts ?? []).map((row) => String(row.platform).toLowerCase())),
    ]);
    if (!platforms.length) return { activated: false, reason: "no_connected_platform_yet" };
    const clientUserId = connectedAccounts?.[0]?.owner_id as string | undefined;

    const { data: brandProfile } = await service
      .from("social_brand_profiles")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .limit(1)
      .maybeSingle();
    if (!brandProfile || !clientUserId) return { activated: false, reason: "brand_or_owner_not_ready_yet" };

    // Real bug found live (Hermes mission Section 89: "build the
    // generalized customer-generation engine", not a one-tenant hack):
    // this call site never passed maxPostsPerDay, so activatePackageAutopilot
    // silently defaulted every auto-activated customer to its own hardcoded
    // `?? 1` regardless of the plan they actually paid for -- a "scale"
    // tier customer entitled to 75 posts/period was paced at 1/day exactly
    // like a 12-post "starter" customer, meaning most higher tiers could
    // never actually consume their own purchased quota before the period
    // rolled over and reset it. Derived from the tenant's REAL entitlement
    // limit and REAL subscription period length -- never a fabricated
    // constant -- so every plan tier gets a pace that can actually clear
    // its own quota within its own billing period. Always at least 1/day.
    const periodStartMs = new Date(subscription.current_period_start).getTime();
    const periodEndMs = new Date(subscription.current_period_end).getTime();
    const periodDays = Number.isFinite(periodStartMs) && periodEndMs > periodStartMs
      ? Math.max(1, Math.round((periodEndMs - periodStartMs) / 86_400_000))
      : 30;
    const derivedMaxPostsPerDay = Math.max(1, Math.ceil(entitlement.limit_amount / periodDays));

    const authorization = await activatePackageAutopilot(service, {
      tenantId: input.tenantId,
      clientUserId,
      subscriptionId: subscription.id,
      entitlementId: entitlement.id,
      publishingMode: "AUTO_PUBLISH",
      allowedPlatforms: platforms,
      maxPostsPerDay: derivedMaxPostsPerDay,
      brandProfileId: brandProfile.id,
    });

    await recordAudit({
      actorType: "SYSTEM",
      action: "social.package.auto_activated",
      targetType: "social_autopilot_authorization",
      targetId: authorization.id,
      summary: "Social Autopilot auto-activated on paid subscription — no manual setup required",
      meta: { tenantId: input.tenantId, subscriptionId: subscription.id, platforms },
    }).catch(() => {});

    // Same real, tested, idempotent plan+prepare chain the manual "activate"
    // API action already triggers on activation -- schedules the full
    // service period immediately (computePackageDistribution spans the
    // whole periodStart..periodEnd window) and prepares real, quality-gated
    // content for the near-term horizon, never a second implementation.
    try {
      await planPackagePeriod(service, authorization.id);
      const prepareResult = await prepareNearTermPackageItems(service, authorization.id);
      // Mission E Section 21: "campaign created -> orchestrator queued" --
      // one bounded inline call already gets real day-one content live
      // immediately, but NET_NEW_AI's real ~150-160s/item cost means it
      // rarely finishes the whole near-term horizon by itself. Chain the
      // real self-continuing producer (Section 18) so the rest of the
      // campaign keeps advancing on its own, without the subscriber ever
      // needing to open /app or an admin needing to click anything.
      if (prepareResult.moreWorkRemaining) {
        const { chainPackageProducerIfMoreWorkRemains } = await import("./package-producer-chain.ts");
        await chainPackageProducerIfMoreWorkRemains(0);
      }
    } catch (err) {
      console.error("attemptAutoActivatePackageAutopilot: plan+prepare failed after real activation", {
        authorizationId: authorization.id,
        tenantId: input.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { activated: true, authorizationId: authorization.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown_error";
    // prerequisite_missing / brand_binding_invalid / package_configuration_required
    // are expected, ordinary "not ready yet" outcomes for a brand-new
    // customer -- never surfaced as a failure to the caller (webhook /
    // OAuth callback), which must never fail its own real response over this.
    return { activated: false, reason };
  }
}

async function validatePackageResumePrerequisites(service: ServiceClient, authorizationId: string, tenantId: string, clientUserId: string) {
  const { data: auth } = await service.from("social_autopilot_authorizations")
    .select("id,subscription_id,entitlement_id,brand_profile_id,allowed_platforms,package_composition")
    .eq("id", authorizationId).eq("tenant_id", tenantId).eq("client_user_id", clientUserId).maybeSingle();
  if (!auth) throw new Error("authorization_not_found");
  const [{ data: subscription }, { data: entitlement }, { data: brand }, { data: accounts }] = await Promise.all([
    service.from("subscriptions").select("status,current_period_end,plan_tier").eq("id", auth.subscription_id).eq("tenant_id", tenantId).maybeSingle(),
    service.from("usage_entitlements").select("metric,is_paused,limit_amount,current_usage").eq("id", auth.entitlement_id).eq("tenant_id", tenantId).eq("subscription_id", auth.subscription_id).maybeSingle(),
    service.from("social_brand_profiles").select("id,owner_id,tenant_id").eq("id", auth.brand_profile_id).eq("tenant_id", tenantId).maybeSingle(),
    service.from("social_accounts").select("platform").eq("tenant_id", tenantId).eq("status", "CONNECTED").in("platform", auth.allowed_platforms),
  ]);
  if (!subscription || subscription.status !== "active" || new Date(subscription.current_period_end).getTime() <= Date.now()) throw new Error("subscription_inactive");
  // Defense in depth: a resumed authorization must still belong to a plan that
  // currently includes Social Autopilot (e.g. after a downgrade to Starter).
  const resumePlanTier = isPlanTier(subscription.plan_tier) ? subscription.plan_tier : null;
  if (!resumePlanTier || !hasCapability(resumePlanTier, "social_autopilot")) throw new Error("plan_no_longer_includes_social_autopilot");
  if (!entitlement || entitlement.metric !== "social_posts" || entitlement.is_paused || entitlement.current_usage >= entitlement.limit_amount) throw new Error("entitlement_paused_or_exhausted");
  if (!brand) throw new Error("brand_binding_invalid");
  const connected = new Set((accounts ?? []).map((row) => String(row.platform).toLowerCase()));
  if ((auth.allowed_platforms as string[]).some((platform) => !connected.has(platform.toLowerCase()))) throw new Error("account_disconnected");
  const composition = validatePackageComposition(auth.package_composition as PackageComposition);
  for (const mediaType of new Set(composition.items.map((item) => item.mediaType))) {
    await selectPackageMediaAsset(service, { tenantId, ownerId: brand.owner_id, mediaType });
  }
}

export async function setPackageAutopilotState(service: ServiceClient, input: { authorizationId: string; tenantId: string; clientUserId: string; state: PackageAuthorizationState }) {
  if (input.state === "ACTIVE") {
    try {
      await validatePackageResumePrerequisites(service, input.authorizationId, input.tenantId, input.clientUserId);
    } catch (error) {
      await service.from("social_autopilot_authorizations").update({ state: "NEEDS_ATTENTION", updated_at: new Date().toISOString() })
        .eq("id", input.authorizationId).eq("tenant_id", input.tenantId).eq("client_user_id", input.clientUserId);
      throw error;
    }
  }
  const { data, error } = await service.from("social_autopilot_authorizations").update({ state: input.state, revoked_at: input.state === "CANCELLED" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", input.authorizationId).eq("tenant_id", input.tenantId).eq("client_user_id", input.clientUserId).select("id,state").maybeSingle();
  if (error || !data) throw new Error("Package authorization was not found for this client");
  await recordAudit({ actorType: "USER", actorId: input.clientUserId, action: `social.package.${input.state.toLowerCase()}`, targetType: "social_autopilot_authorization", targetId: input.authorizationId, summary: `Changed package Autopilot state to ${input.state}`, meta: { tenantId: input.tenantId } });
  return data;
}

/** Removing a platform from scope must stop future unresolved publications to it (Section 41) without touching other destinations or history. */
export async function setPackageAutopilotScope(service: ServiceClient, input: { authorizationId: string; tenantId: string; clientUserId: string; allowedPlatforms: string[] }) {
  const platforms = stripUnschedulablePlatforms([...new Set(input.allowedPlatforms.map((value) => value.toLowerCase()).filter(Boolean))]);
  if (!platforms.length) throw new Error("At least one allowed platform is required");
  const { data: auth, error } = await service
    .from("social_autopilot_authorizations")
    .update({ allowed_platforms: platforms, updated_at: new Date().toISOString() })
    .eq("id", input.authorizationId)
    .eq("tenant_id", input.tenantId)
    .eq("client_user_id", input.clientUserId)
    .select("id, allowed_platforms")
    .maybeSingle();
  if (error || !auth) throw new Error("Package authorization was not found for this client");

  // Unresolved (not yet claimed) items for a platform that just left scope
  // stop being eligible — block them rather than leave them silently
  // pending forever; the next planning pass can replace them if needed.
  const { data: tenantAccounts } = await service.from("social_accounts").select("id, platform").eq("tenant_id", input.tenantId);
  const nowOutOfScopeAccountIds = (tenantAccounts ?? [])
    .filter((account) => !platforms.includes(String(account.platform).toLowerCase()))
    .map((account) => account.id as string);
  if (nowOutOfScopeAccountIds.length) {
    await service
      .from("social_autopilot_queue_items")
      .update({ status: "BLOCKED", last_error: "destination_removed_from_package_scope", updated_at: new Date().toISOString() })
      .eq("authorization_id", input.authorizationId)
      .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED"])
      .in("account_id", nowOutOfScopeAccountIds);
  }
  await recordAudit({ actorType: "USER", actorId: input.clientUserId, action: "social.package.scope_change", targetType: "social_autopilot_authorization", targetId: input.authorizationId, summary: "Changed package destination scope", meta: { tenantId: input.tenantId, platforms } });
  return auth;
}

/**
 * Settings/Profile Autopilot Toggle mission: publishing_mode was
 * previously write-once, set only inside activatePackageAutopilot with no
 * way to change it afterward anywhere in the product -- the dashboard
 * showed it as read-only text. Only ever affects FUTURE preparation
 * (prepareNearTermPackageItems reads authorization.publishing_mode at the
 * moment it prepares each item) -- items already PREPARED/REVIEW_REQUIRED
 * keep the review state they were assigned under the old mode, the same
 * "future items only" boundary setPackageAutopilotScope already uses for
 * destination changes.
 */
export async function setPackageAutopilotPublishingMode(service: ServiceClient, input: { authorizationId: string; tenantId: string; clientUserId: string; publishingMode: PackagePublishingMode }) {
  const { data, error } = await service
    .from("social_autopilot_authorizations")
    .update({ publishing_mode: input.publishingMode, updated_at: new Date().toISOString() })
    .eq("id", input.authorizationId)
    .eq("tenant_id", input.tenantId)
    .eq("client_user_id", input.clientUserId)
    .select("id, publishing_mode")
    .maybeSingle();
  if (error || !data) throw new Error("Package authorization was not found for this client");
  await recordAudit({ actorType: "USER", actorId: input.clientUserId, action: "social.package.publishing_mode_change", targetType: "social_autopilot_authorization", targetId: input.authorizationId, summary: `Changed package Autopilot publishing mode to ${input.publishingMode}`, meta: { tenantId: input.tenantId, publishingMode: input.publishingMode } });
  return data;
}

/** The only package auto-publish authorization boundary. It validates the
 * persisted tenant/client/subscription/entitlement/platform/scope tuple and
 * atomically claims one queue item. Chat text never calls this function. */
export async function claimAuthorizedPackagePost(service: ServiceClient, queueItemId: string): Promise<PackagePublishClaim> {
  const { data, error } = await service.rpc("claim_social_package_post", { p_queue_item_id: queueItemId });
  if (error) return { allowed: false, reason: "authorization_check_failed" };
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    allowed: result.allowed === true,
    reason: typeof result.reason === "string" ? result.reason : "not_authorized",
    ...(typeof result.queue_item_id === "string" ? { queueItemId: result.queue_item_id } : {}),
    ...(typeof result.tenant_id === "string" ? { tenantId: result.tenant_id } : {}),
    ...(typeof result.owner_id === "string" ? { ownerId: result.owner_id } : {}),
    ...(typeof result.account_id === "string" ? { accountId: result.account_id } : {}),
    ...(typeof result.variant_id === "string" ? { variantId: result.variant_id } : {}),
    shadowMode: result.shadow_mode === true,
  };
}

/** Finalizes once. The database transition and entitlement increment are
 * atomic, so retries cannot consume or publish a package unit twice. */
export async function settleAuthorizedPackagePost(service: ServiceClient, input: { queueItemId: string; outcome: "PUBLISHED" | "FAILED" | "SKIPPED" | "SHADOW_COMPLETED"; publishingJobId?: string; error?: string; tenantId?: string }) {
  const { data, error } = await service.rpc("settle_social_package_post", {
    p_queue_item_id: input.queueItemId,
    p_outcome: input.outcome,
    p_publishing_job_id: input.publishingJobId ?? null,
    p_error: input.error ?? null,
  });
  if (error) throw new Error("Could not settle package post");
  const result = data as { settled?: boolean; already_settled?: boolean; counted?: boolean; quota_consumed?: boolean };
  // Settlement audit is idempotent under retries: only emit when the RPC
  // reports a fresh settlement (not already_settled).
  if (result.settled && !result.already_settled && result.quota_consumed) {
    await recordAudit({
      actorType: "SYSTEM",
      action: "social.package.entitlement_settled",
      targetType: "social_autopilot_queue_item",
      targetId: input.queueItemId,
      summary: "Package entitlement settled after publish outcome",
      meta: { outcome: input.outcome, counted: Boolean(result.counted), tenantId: input.tenantId ?? null },
    }).catch(() => {});
  }
  return result;
}

/** Executes one package item through the existing publishing engine. The
 * standing-authorization claim happens first; Shadow Mode exits before any
 * publishing job is created. */
export async function executeAuthorizedPackagePost(service: ServiceClient, queueItemId: string, scheduledAt = new Date().toISOString()) {
  const claim = await claimAuthorizedPackagePost(service, queueItemId);
  if (!claim.allowed || !claim.ownerId || !claim.accountId || !claim.variantId) {
    if (claim.reason && !["already_claimed_or_not_ready", "queue_item_not_found"].includes(claim.reason)) {
      await recordAudit({
        actorType: "SYSTEM",
        action: "social.package.publish_attempted",
        targetType: "social_autopilot_queue_item",
        targetId: queueItemId,
        summary: "Automatic package publish was not authorized",
        meta: { reason: claim.reason, tenantId: claim.tenantId ?? null },
      }).catch(() => {});
    }
    return claim;
  }

  await recordAudit({
    actorType: "SYSTEM",
    action: "social.package.publish_attempted",
    targetType: "social_autopilot_queue_item",
    targetId: queueItemId,
    summary: "Automatic package publish attempted",
    meta: { tenantId: claim.tenantId ?? null, accountId: claim.accountId, shadowMode: Boolean(claim.shadowMode) },
  }).catch(() => {});

  // Hermes mission Section 3: publishing_scheduling's authorization_id --
  // best-effort, looked up once (never blocks/fails the real publish this
  // observes). A miss here just means the ledger row is skipped, never that
  // publishing is affected.
  let publishingAuthorizationId: string | null = null;
  try {
    const { data: publishingAuthRow } = await service
      .from("social_autopilot_queue_items")
      .select("authorization_id")
      .eq("id", queueItemId)
      .maybeSingle();
    publishingAuthorizationId = (publishingAuthRow as { authorization_id?: string } | null)?.authorization_id ?? null;
  } catch {
    // best-effort only -- never blocks the real publish below.
  }

  if (claim.shadowMode) {
    await settleAuthorizedPackagePost(service, { queueItemId, outcome: "SHADOW_COMPLETED", tenantId: claim.tenantId });
    await recordAudit({
      actorType: "SYSTEM",
      action: "social.package.publish_succeeded",
      targetType: "social_autopilot_queue_item",
      targetId: queueItemId,
      summary: "Shadow Mode package run completed (nothing published externally)",
      meta: { tenantId: claim.tenantId ?? null, shadow: true },
    }).catch(() => {});
    if (publishingAuthorizationId && claim.tenantId) {
      await recordCampaignTask(service, {
        authorizationId: publishingAuthorizationId, tenantId: claim.tenantId, queueItemId,
        agentRole: "publishing_scheduling", status: "COMPLETED", output: { shadow: true },
      });
    }
    return { ...claim, published: false, shadow: true, text: "Shadow run complete. Nothing was published externally." };
  }
  try {
    const jobId = await scheduleJob(service as Parameters<typeof scheduleJob>[0], { accountId: claim.accountId, variantId: claim.variantId, scheduledAt, idempotencyKey: `package:${queueItemId}` });
    const result = await runPublishNow(service as Parameters<typeof runPublishNow>[0], jobId, scheduledAt, claim.ownerId);
    const published = result.jobStatus === "PUBLISHED" && result.mode !== "shadow";
    const unknownOutcome = !published && result.jobStatus !== "FAILED" && result.mode !== "shadow";
    await settleAuthorizedPackagePost(service, {
      queueItemId,
      outcome: published ? "PUBLISHED" : "FAILED",
      publishingJobId: jobId,
      error: published ? undefined : result.lastError ?? result.outcomeNote,
      tenantId: claim.tenantId,
    });
    if (publishingAuthorizationId && claim.tenantId) {
      await recordCampaignTask(service, {
        authorizationId: publishingAuthorizationId, tenantId: claim.tenantId, queueItemId,
        agentRole: "publishing_scheduling", status: published ? "COMPLETED" : "FAILED",
        output: { jobId, jobStatus: result.jobStatus },
        failureReason: published ? null : (result.lastError ?? result.outcomeNote ?? null),
      });
    }
    if (published) {
      await recordAudit({
        actorType: "SYSTEM",
        action: "social.package.publish_succeeded",
        targetType: "social_autopilot_queue_item",
        targetId: queueItemId,
        summary: "Automatic package publish succeeded",
        meta: { tenantId: claim.tenantId ?? null, jobId },
      }).catch(() => {});
    } else if (unknownOutcome) {
      await recordAudit({
        actorType: "SYSTEM",
        action: "social.package.publish_reconciliation_required",
        targetType: "social_autopilot_queue_item",
        targetId: queueItemId,
        summary: "Package publish outcome requires reconciliation",
        meta: { tenantId: claim.tenantId ?? null, jobId, jobStatus: result.jobStatus, mode: result.mode },
      }).catch(() => {});
    } else {
      await recordAudit({
        actorType: "SYSTEM",
        action: "social.package.publish_failed",
        targetType: "social_autopilot_queue_item",
        targetId: queueItemId,
        summary: "Automatic package publish failed",
        meta: { tenantId: claim.tenantId ?? null, jobId, error: result.lastError ?? result.outcomeNote ?? null },
      }).catch(() => {});
    }
    return { ...claim, published, jobId, result };
  } catch (error) {
    const publishErrorMessage = error instanceof Error ? error.message : "package publish failed";
    await settleAuthorizedPackagePost(service, { queueItemId, outcome: "FAILED", error: publishErrorMessage, tenantId: claim.tenantId });
    await recordAudit({
      actorType: "SYSTEM",
      action: "social.package.publish_failed",
      targetType: "social_autopilot_queue_item",
      targetId: queueItemId,
      summary: "Automatic package publish failed",
      meta: { tenantId: claim.tenantId ?? null, error: publishErrorMessage },
    }).catch(() => {});
    if (publishingAuthorizationId && claim.tenantId) {
      await recordCampaignTask(service, {
        authorizationId: publishingAuthorizationId, tenantId: claim.tenantId, queueItemId,
        agentRole: "publishing_scheduling", status: "FAILED", failureReason: publishErrorMessage,
      });
    }
    throw error;
  }
}

export const PACKAGE_WORKER_TYPE = "package-autopilot-worker" as const;

/** Exported so operational scripts (e.g. the retroactive tenant backfill)
 * that call planPackagePeriod/prepareNearTermPackageItems directly --
 * outside runPackageAutopilotBatch, which already checks this internally
 * -- can honor the exact same kill switch before doing any real work. */
export async function packageKillSwitchActive(service: ServiceClient, tenantId?: string) {
  const checks: Array<{ scope: "global_hermes" | "worker_type" | "tenant"; scopeId?: string }> = [
    { scope: "global_hermes" },
    { scope: "worker_type", scopeId: PACKAGE_WORKER_TYPE },
  ];
  if (tenantId) checks.push({ scope: "tenant", scopeId: tenantId });
  return isKillSwitchActive(service as Parameters<typeof isKillSwitchActive>[0], checks);
}

/**
 * If the tenant's subscription has moved into a new billing period since
 * this authorization's window was set, roll the service period forward: new
 * period_number (so package_sequence starts fresh, never colliding with the
 * prior period's rows), new starts_at/ends_at, and a re-read
 * period_target_units from the entitlement's current limit. Concurrency-safe
 * via a compare-and-swap update guarded on the OLD period_number — two
 * concurrent producer runs racing this can't both roll the period; the
 * loser's update matches zero rows and it just re-reads the winner's result.
 */
async function rollServicePeriodIfNeeded(service: ServiceClient, authorization: PackageAuthorizationRow): Promise<PackageAuthorizationRow> {
  const [{ data: subscription }, { data: entitlement }] = await Promise.all([
    service.from("subscriptions").select("status, current_period_start, current_period_end").eq("id", authorization.subscription_id).maybeSingle(),
    service.from("usage_entitlements").select("limit_amount, current_usage").eq("id", authorization.entitlement_id).maybeSingle(),
  ]);
  if (!subscription || !entitlement) return authorization;
  const currentEnds = authorization.ends_at ? new Date(authorization.ends_at).getTime() : 0;
  const subscriptionPeriodEnds = new Date(subscription.current_period_end).getTime();
  if (subscriptionPeriodEnds <= currentEnds) return authorization; // same period, nothing to roll

  const { data: rolled } = await service
    .from("social_autopilot_authorizations")
    .update({
      period_number: authorization.period_number + 1,
      period_target_units: Math.max(0, entitlement.limit_amount - entitlement.current_usage),
      starts_at: subscription.current_period_start,
      ends_at: subscription.current_period_end,
      state: authorization.state === "EXPIRED" || authorization.state === "NEEDS_ATTENTION" ? "ACTIVE" : authorization.state,
      updated_at: new Date().toISOString(),
    })
    .eq("id", authorization.id)
    .eq("period_number", authorization.period_number) // CAS guard
    .select("*")
    .maybeSingle();
  if (rolled) {
    const next = rolled as PackageAuthorizationRow;
    await recordAudit({
      actorType: "SYSTEM",
      action: "social.package.service_period_rolled",
      targetType: "social_autopilot_authorization",
      targetId: authorization.id,
      summary: "Package Autopilot service period rolled forward",
      meta: {
        tenantId: authorization.tenant_id,
        fromPeriod: authorization.period_number,
        toPeriod: next.period_number,
        periodTargetUnits: next.period_target_units,
      },
    }).catch(() => {});
    return next;
  }

  // Lost the race (another run already rolled it) — re-read the current row.
  const { data: current } = await service.from("social_autopilot_authorizations").select("*").eq("id", authorization.id).single();
  return (current as PackageAuthorizationRow) ?? authorization;
}

export interface PlanPeriodResult {
  planned: number;
  blockedReason?: string;
}

export function contentUnitKeyFor(authorizationId: string, periodNumber: number, unitSequence: number) { return `${authorizationId}:${periodNumber}:${unitSequence}`; }
export function packageSequenceForRow(unitSequence: number, platformIndex: number, countingPolicy: CountingPolicy) { return countingPolicy === "CONTENT_UNIT" ? unitSequence * 10 + platformIndex : unitSequence; }
export function contentUnitIndexForRow(packageSequence: number, countingPolicy: CountingPolicy) { return Math.max(0, (countingPolicy === "CONTENT_UNIT" ? Math.floor(packageSequence / 10) : packageSequence) - 1); }

/**
 * The "service plan" layer (Section 16): ensures the current service period
 * has a full set of future SLOTS (timestamp + destination, no content yet)
 * up to its entitled unit count. Cheap and safe to run often — no AI calls,
 * no external mutation. Idempotent under concurrency via the
 * (authorization_id, period_number, package_sequence) unique index and
 * ignoreDuplicates upsert — two producer runs at the same time cannot create
 * duplicate slots.
 */
export async function planPackagePeriod(service: ServiceClient, authorizationId: string): Promise<PlanPeriodResult> {
  const { data: authRow } = await service.from("social_autopilot_authorizations").select("*").eq("id", authorizationId).maybeSingle();
  if (!authRow) return { planned: 0, blockedReason: "authorization_not_found" };
  let authorization = authRow as PackageAuthorizationRow;
  if (authorization.state !== "ACTIVE" && authorization.state !== "NEEDS_ATTENTION") return { planned: 0 };

  const { data: subscription } = await service.from("subscriptions").select("status, current_period_end").eq("id", authorization.subscription_id).maybeSingle();
  if (!subscription || subscription.status !== "active" || new Date(subscription.current_period_end).getTime() <= Date.now()) {
    if (authorization.state === "ACTIVE") {
      await service.from("social_autopilot_authorizations").update({ state: "NEEDS_ATTENTION", updated_at: new Date().toISOString() }).eq("id", authorization.id);
    }
    return { planned: 0, blockedReason: "subscription_inactive" };
  }

  authorization = await rollServicePeriodIfNeeded(service, authorization);

  const { data: boundAccounts } = await service
    .from("social_accounts")
    .select("id, platform, owner_id")
    .eq("tenant_id", authorization.tenant_id)
    .eq("status", "CONNECTED")
    .in("platform", authorization.allowed_platforms);
  const accountByPlatform = new Map<string, { id: string; owner_id: string }>();
  for (const account of boundAccounts ?? []) {
    const platform = String(account.platform).toLowerCase();
    if (!accountByPlatform.has(platform)) accountByPlatform.set(platform, { id: account.id as string, owner_id: account.owner_id as string });
  }
  const resolvedPlatforms = authorization.allowed_platforms.filter((platform) => accountByPlatform.has(platform));

  const { data: existingRows } = await service
    .from("social_autopilot_queue_items")
    .select("package_sequence,content_unit_key")
    .eq("authorization_id", authorization.id)
    .eq("period_number", authorization.period_number);
  const existingCount = authorization.counting_policy === "CONTENT_UNIT"
    ? new Set((existingRows ?? []).map((row) => row.content_unit_key).filter(Boolean)).size
    : (existingRows ?? []).length;

  const distribution = computePackageDistribution({
    existingCount,
    targetUnits: authorization.period_target_units,
    now: new Date(),
    periodStart: new Date(authorization.starts_at),
    periodEnd: new Date(authorization.ends_at ?? subscription.current_period_end),
    timezone: authorization.timezone,
    maxPostsPerDay: authorization.max_posts_per_day,
    platforms: resolvedPlatforms,
  });

  if (distribution.blockedReason && authorization.state === "ACTIVE") {
    await service.from("social_autopilot_authorizations").update({ state: "NEEDS_ATTENTION", updated_at: new Date().toISOString() }).eq("id", authorization.id);
  } else if (!distribution.blockedReason && authorization.state === "NEEDS_ATTENTION" && distribution.slots.length > 0) {
    await service.from("social_autopilot_authorizations").update({ state: "ACTIVE", updated_at: new Date().toISOString() }).eq("id", authorization.id);
  }

  if (distribution.slots.length === 0) return { planned: 0, blockedReason: distribution.blockedReason };

  const rows = distribution.slots.flatMap((slot) => {
    const destinations = authorization.counting_policy === "CONTENT_UNIT" ? resolvedPlatforms : [slot.platform];
    return destinations.map((destination, index) => {
      const account = accountByPlatform.get(destination)!;
      return {
      id: crypto.randomUUID(),
      authorization_id: authorization.id,
      tenant_id: authorization.tenant_id,
      owner_id: account.owner_id,
      variant_id: null,
      account_id: account.id,
      package_sequence: packageSequenceForRow(slot.sequence, index, authorization.counting_policy),
      period_number: authorization.period_number,
      content_unit_key: authorization.counting_policy === "CONTENT_UNIT" ? contentUnitKeyFor(authorization.id, authorization.period_number, slot.sequence) : null,
      scheduled_at: slot.scheduledAt,
      status: "PLANNED" as const,
      };
    });
  });
  // ON CONFLICT DO NOTHING against the (authorization_id, period_number,
  // package_sequence) unique index — the actual concurrency guard.
  const { error } = await service.from("social_autopilot_queue_items").upsert(rows, {
    onConflict: "authorization_id,period_number,package_sequence",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`planPackagePeriod: ${error.message}`);
  return { planned: rows.length, blockedReason: distribution.blockedReason };
}

const CANONICAL_PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

// GeneratedCopy / parseGeneratedCopy now live in generated-copy-parser.ts
// (imported above) so they're importable standalone -- see that file's
// header comment.

/**
 * The preparation layer (Section 16): turns PLANNED slots inside the
 * preparation horizon into real content — grounded in Brand Brain, using
 * the SAME repository functions (createContentMaster/createContentVariant)
 * the manual Copilot uses, never a second content generator. A slot whose
 * generation fails the quality gate (missing/invalid pillar, placeholder
 * text, no configured AI provider) is marked BLOCKED with a real reason —
 * never silently published with garbage (Section 28/48).
 */
export interface PrepareNearTermResult {
  prepared: number;
  blocked: number;
  /** Mission F Section 11/25/37: how many of this call's BLOCKED outcomes
   * were a genuine recovery exhaustion (every staged attempt tried and
   * failed), not just an ordinary still-being-retried BLOCKED. */
  recoveryExhausted: number;
  /** Mission E Section 2/4: true when this call stopped before exhausting
   * every eligible item -- either the real runtime deadline was reached, or
   * a real follow-up count found more eligible items beyond this batch.
   * Callers (the producer route) use this to decide whether to
   * self-chain another invocation rather than leaving the rest for
   * whenever the next scheduled trigger happens to fire. */
  moreWorkRemaining: boolean;
}

/** Mission E Section 2/4 / Mission F live finding: a single NET_NEW_AI item
 * has taken ~150-160s in real production (confirmed again live during
 * Mission F: 148s). The real, declared maxDuration on every caller of this
 * function is 300s (system/page.tsx, package-producer/route.ts). Mission
 * E's original 220s budget left only an 80s margin for whatever item was
 * already in flight when the deadline check fired -- LESS than a single
 * NET_NEW_AI item's own real cost. Confirmed live: a recovery-policy pass
 * started a NET_NEW_AI generation just before the 220s mark, the image
 * finished successfully at ~148s in, but the calling Server Action's real
 * 300s maxDuration killed the invocation in the same instant, before the
 * result could ever be written back (a real "Vercel Runtime Timeout Error:
 * Task timed out after 300 seconds", not a hypothetical). 130s leaves a
 * genuine ~170s margin -- comfortably above every observed/documented
 * single-item cost, so an item already in flight when the deadline check
 * fires can always actually finish and be written, not just "probably". */
const DEFAULT_PREPARE_BUDGET_MS = 130_000;

export async function prepareNearTermPackageItems(
  service: ServiceClient,
  authorizationId: string,
  options?: { deadlineMs?: number }
): Promise<PrepareNearTermResult> {
  const deadline = options?.deadlineMs ?? Date.now() + DEFAULT_PREPARE_BUDGET_MS;
  const { data: authRow } = await service.from("social_autopilot_authorizations").select("*").eq("id", authorizationId).maybeSingle();
  if (!authRow) return { prepared: 0, blocked: 0, recoveryExhausted: 0, moreWorkRemaining: false };
  const authorization = authRow as PackageAuthorizationRow;
  if (authorization.state !== "ACTIVE") return { prepared: 0, blocked: 0, recoveryExhausted: 0, moreWorkRemaining: false };

  // STRATXCEL weekly-engine brief Section 19/22: ensure this authorization's
  // real weekly-campaign checkpoint exists for whichever real calendar week
  // "now" falls in, before any item preparation this pass. Idempotent (a
  // second call within the same real week is a no-op read, never a
  // duplicate row) and strictly additive/best-effort -- a failure here must
  // never block the real, revenue-critical item preparation below, the
  // same discipline recordCampaignTask/recordAudit already use throughout
  // this pipeline.
  const weeklyCampaign = await ensureWeeklyCampaignForTenant(service, {
    tenantId: authorization.tenant_id,
    authorizationId: authorization.id,
    timezone: authorization.timezone,
  }).catch(() => null);

  const horizonEnd = new Date(Date.now() + authorization.preparation_horizon_days * 86_400_000).toISOString();
  // Mission D+ Section 21 / Mission F Section 3/10: a BLOCKED item (in-pass
  // corrective-instruction attempts exhausted) is eligible for a bounded
  // number of cross-pass recovery retries instead of being permanently
  // excluded -- capped by MAX_RECOVERY_ATTEMPTS so this can never become
  // unbounded execution, and excluded once recovery_exhausted is set (every
  // staged attempt genuinely tried and failed). A fresh PLANNED row's
  // retry_count is always 0 and recovery_exhausted always false, so this
  // filter never excludes normal first-time preparation.
  const { data: dueItems } = await service
    .from("social_autopilot_queue_items")
    .select("*")
    .eq("authorization_id", authorization.id)
    .eq("period_number", authorization.period_number)
    .in("status", ["PLANNED", "BLOCKED"])
    .eq("recovery_exhausted", false)
    .lt("retry_count", MAX_RECOVERY_ATTEMPTS)
    .lte("scheduled_at", horizonEnd)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  const provider = resolveConfiguredProvider();
  let prepared = 0;
  let blocked = 0;
  let recoveryExhausted = 0;

  // Fact/Claim Safety Layer (Section 4/5 of the build brief): ground
  // generation in the tenant's REAL verified business facts instead of
  // letting the model write only from brand voice/products. Fetched once
  // per authorization per run (not per item -- these are constant across
  // every item this run processes, and gatherGoogleBusiness makes a real
  // live call to the Google Business Profile API, which must not be
  // repeated per queue item). Best-effort and strictly additive: any
  // failure here must never block content preparation, which already
  // worked without this. buildVerifiedBusinessInformation omits anything
  // not actually present -- it never invents a fact.
  // Mission F: named _batch to make clear this is the once-per-run value --
  // shadowed per-item below (Section 5 research-driven recovery) for an
  // item on its last allowed recovery attempt, never mutated here.
  let businessInformationBatch: string[] = [];
  if ((dueItems ?? []).length > 0) {
    const [brandBrainResult, connectorInsightsResult] = await Promise.allSettled([
      getCurrentBrandBrain(service as Parameters<typeof getCurrentBrandBrain>[0], authorization.tenant_id),
      createSocialAuditConnectorInsightsProvider(service as Parameters<typeof createSocialAuditConnectorInsightsProvider>[0]).gather(authorization.tenant_id),
    ]);
    const brandBrain = brandBrainResult.status === "fulfilled" ? brandBrainResult.value : null;
    const insights = connectorInsightsResult.status === "fulfilled" ? connectorInsightsResult.value : null;
    const googleBusiness = insights?.googleBusiness.state === "available" ? insights.googleBusiness.data : null;
    businessInformationBatch = buildVerifiedBusinessInformation({ googleBusiness, brandBrain: brandBrain?.content ?? null });

    // STRATXCEL Master Execution Prompt Sections 16-17: real, grounded
    // competitor/social-trend research, gathered at most ONCE per real
    // calendar week per tenant (Section 47 cost control -- a real, billed
    // grounded-search call, not a per-item cost). Only fires when this
    // week's checkpoint doesn't already carry research (idempotent: a
    // second prepareNearTermPackageItems pass later the same week is a
    // real no-op here, never a duplicate paid search). Strictly
    // best-effort and non-blocking -- never lets a research failure affect
    // the real content preparation below, which worked without this.
    const existingStrategy = (weeklyCampaign?.strategy ?? {}) as Record<string, unknown>;
    if (weeklyCampaign && !existingStrategy.marketIntelligence) {
      // Known, real, accepted limitation (found live this pass): this
      // plain fire-and-forget promise can be killed before the ~90s
      // grounded-search call finishes if prepareNearTermPackageItems's
      // own remaining work returns first. next/server's after() was tried
      // here to fix that properly (the same mechanism the real
      // package-producer route already uses) but was reverted: it broke
      // `next/server` module resolution (ERR_MODULE_NOT_FOUND) for this
      // file under this project's plain `node --experimental-strip-types`
      // test-running setup (lib/social/package-autopilot.ts is loaded
      // directly by ~20 test files that way, never through the real
      // Next.js bundler) -- a confirmed, reproducible regression across
      // the whole test:social-package-autopilot suite, a materially worse
      // outcome than the reliability gap it was meant to fix. Left as
      // fire-and-forget: self-healing via the strategy.marketIntelligence
      // idempotency check above -- if this particular pass's process dies
      // before the research call resolves, the row simply stays
      // unpopulated and the next real pass this same week tries again,
      // never a duplicate paid search either way.
      void gatherLiveMarketIntelligence(service, {
        tenantId: authorization.tenant_id,
        businessName: String(brandBrain?.content?.business_name ?? brandBrain?.content?.name ?? ""),
        industry: String(brandBrain?.content?.industry ?? ""),
        location: typeof brandBrain?.content?.location === "string" ? brandBrain.content.location : null,
      })
        .then((intelligence) =>
          service
            .from("social_autopilot_weekly_campaigns")
            .update({ strategy: { ...existingStrategy, marketIntelligence: intelligence }, updated_at: new Date().toISOString() })
            .eq("id", weeklyCampaign.id)
        )
        .catch(() => {});
    }

    // STRATXCEL two-gap closure brief, Gap 1: real analytics ingestion.
    // Runs every real pass (not gated behind the once-per-week check below)
    // -- cheap, idempotent (upserts against a real per-day unique key, see
    // 20260831010000_social_metrics_observation_date.sql), and there is no
    // free Vercel Hobby cron slot left (vercel.json is already at the real
    // 9-cron ceiling vercel-hobby-cron-limits.test.ts enforces) to run it
    // on its own schedule -- hooking it into this real, already-daily
    // batch entry point is how it gets real, roughly-daily cadence without
    // a new declared cron. Strictly best-effort/non-blocking, matching
    // every other call site in this block. Bounded to 20s total so a
    // tenant with many real eligible posts can never meaningfully
    // cannibalize the per-item generation budget the loop below checks
    // its own deadline against -- any posts not reached within the bound
    // are simply picked up on a later real pass; ingestion is incremental
    // and idempotent, so nothing is lost by deferring them.
    await Promise.race([
      ingestSocialPerformanceForTenant(service, authorization.tenant_id),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]).catch(() => null);

    // STRATXCEL two-gap closure brief, Gap 2 (Section 6/7): the real
    // Monday performance-analysis snapshot -- computed at most once per
    // real calendar week per tenant (idempotent via the same
    // strategy.<key> presence check marketIntelligence already uses just
    // above), from whatever real social_metrics the ingestion step above
    // (and prior real days' ingestion runs) has actually recorded for last
    // week's real published posts. Writes into BOTH the existing, already-
    // designed performance_snapshot/performance_signal_status columns
    // (weekly-campaign.ts's WeeklyCampaignRow -- previously always
    // NO_ANALYTICS_AVAILABLE because nothing ever computed a real
    // snapshot) and strategy.performanceAnalysis, so it reaches the real
    // creative-brief research-insight seam below (Section 9's
    // "research -> strategy -> brief -> content" trace) the exact same way
    // marketIntelligence already does. Never fabricates a snapshot when no
    // real posts/metrics exist yet -- analyzeWeeklyPerformance itself
    // returns dataSource: "NO_ANALYTICS_AVAILABLE" honestly in that case,
    // and performance_signal_status is only ever set to SNAPSHOT_RECORDED
    // when it's genuinely REAL_ANALYTICS.
    if (weeklyCampaign && !existingStrategy.performanceAnalysis) {
      const prevWeekStart = new Date(new Date(`${weeklyCampaign.week_start}T00:00:00.000Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const prevWeekEnd = new Date(new Date(`${weeklyCampaign.week_end}T00:00:00.000Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      await runMondayPerformanceAnalysisForTenant(service, { tenantId: authorization.tenant_id, weekStart: prevWeekStart, weekEnd: prevWeekEnd })
        .then((analysis: PerformanceAnalysis) =>
          service
            .from("social_autopilot_weekly_campaigns")
            .update({
              strategy: { ...existingStrategy, performanceAnalysis: analysis },
              performance_snapshot: analysis,
              performance_signal_status: analysis.dataSource === "REAL_ANALYTICS" ? "SNAPSHOT_RECORDED" : "NO_ANALYTICS_AVAILABLE",
              updated_at: new Date().toISOString(),
            })
            .eq("id", weeklyCampaign.id)
        )
        .catch(() => {});
    }
    // Brand Brain Final UX + Data + Save System Section 7: the tenant's
    // real structured Services (added via /app/brand's Services editor)
    // must reach Social Autopilot's real automated generation, not just
    // whatever the separately-maintained social_brand_profiles.products
    // happens to have. Additive to buildVerifiedBusinessInformation's own
    // facts (never replaces them) -- getActiveServices already handles the
    // legacy `products` fallback, so this is a no-op duplicate for a
    // tenant whose brandProfile.products already came from the same
    // source, and real new signal for one who has only saved services on
    // the canonical Brand Brain.
    businessInformationBatch = [...businessInformationBatch, ...getActiveServices(brandBrain?.content).map((s) => (s.shortDescription ? `Service: ${s.name} — ${s.shortDescription}` : `Service: ${s.name}`))];

    // Hermes mission Sections 3/44: research and fact/claim-safety grounding
    // are gathered ONCE per batch (not per item -- see the comment on
    // businessInformationBatch above), so they're recorded once per batch
    // too, with queue_item_id left null (they're not one post's work, they
    // ground every item this run processes). Best-effort, non-blocking.
    await recordCampaignTask(service, {
      authorizationId: authorization.id,
      tenantId: authorization.tenant_id,
      agentRole: "research",
      status: googleBusiness ? "COMPLETED" : "FAILED",
      output: { verifiedFactCount: businessInformationBatch.length },
      failureReason: googleBusiness ? null : "no_live_connector_insights_available_this_run",
    });
    await recordCampaignTask(service, {
      authorizationId: authorization.id,
      tenantId: authorization.tenant_id,
      agentRole: "fact_claim_safety",
      status: "COMPLETED",
      output: { verifiedFacts: businessInformationBatch },
    });

    // STRATXCEL zero-gap closure brief Section 5: the literal canonical
    // SocialAutopilotContext, assembled once per batch from the exact
    // real data already gathered above (never a redundant parallel
    // fetch) and recorded through the real Hermes campaign-task ledger
    // so it is genuinely observable, not a dead type nobody calls.
    // Best-effort/non-blocking, matching every other batch-level
    // recordCampaignTask call in this function -- an assembly/recording
    // failure here must never affect the real generation work below.
    try {
      const firstDueItem = (dueItems ?? [])[0] as PackageQueueItemRow | undefined;
      const [{ data: weeklyCampaignRow }, { data: recentCampaigns }, ownerBrandProfile] = await Promise.all([
        service.from("social_autopilot_weekly_campaigns").select("week_start,week_end").eq("authorization_id", authorization.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        service.from("social_autopilot_weekly_campaigns").select("week_key,status,created_at").eq("tenant_id", authorization.tenant_id).order("created_at", { ascending: false }).limit(8),
        firstDueItem
          ? getBoundBrandProfile({ ok: true, ownerId: firstDueItem.owner_id, email: null, supabase: service as Parameters<typeof getBoundBrandProfile>[0]["supabase"] }, authorization.brand_profile_id, authorization.tenant_id).catch(() => null)
          : Promise.resolve(null),
      ]);
      const ctx = buildSocialAutopilotContext({
        tenantId: authorization.tenant_id,
        ownerId: firstDueItem?.owner_id ?? null,
        subscriptionId: authorization.subscription_id,
        brandProfile: ownerBrandProfile,
        brandBrainContent: brandBrain?.content ?? null,
        verifiedFacts: businessInformationBatch,
        research: (existingStrategy.marketIntelligence as LiveMarketIntelligence | undefined) ?? null,
        campaignHistory: recentCampaigns ?? [],
        performanceHistory: existingStrategy.performanceAnalysis ? [existingStrategy.performanceAnalysis as PerformanceAnalysis] : [],
        weekStart: weeklyCampaignRow?.week_start ?? null,
        weekEnd: weeklyCampaignRow?.week_end ?? null,
        subscriptionEntitlements: null,
        auditEntitlements: null,
      });
      await recordCampaignTask(service, {
        authorizationId: authorization.id,
        tenantId: authorization.tenant_id,
        agentRole: "brand_intelligence",
        status: "COMPLETED",
        output: ctx as unknown as Record<string, unknown>,
      });
    } catch {
      // Assembly/recording is strictly additive observability -- never
      // blocks the real generation work below.
    }
  }

  let deadlineHit = false;
  for (const raw of dueItems ?? []) {
    // Mission E Section 2/4: checked BEFORE starting a new item, never
    // mid-item -- a real NET_NEW_AI attempt already in flight is always
    // allowed to finish, so nothing is ever killed mid-write. Any item not
    // yet started this call is left exactly as it was (still
    // PLANNED/BLOCKED, untouched) for the next invocation to pick up.
    if (Date.now() >= deadline) {
      deadlineHit = true;
      break;
    }
    const item = raw as PackageQueueItemRow;
    // Hoisted out of the try block (Mission D+ Section 21): the catch below
    // needs the pillar a failed attempt actually used, if generation got
    // that far, so a cross-pass retry's history-based selection steers
    // away from it -- a `const` declared inside `try { }` is not visible
    // inside the paired `catch { }` block. A plain string (not the full
    // CreativeBrief) so every existing `brief.___` usage below stays
    // completely untouched.
    let attemptedPillar: string | null = null;
    let attemptedConcept: string | null = null;
    let attemptedObjective: string | null = null;
    /** Real QualityFailureReason codes from this attempt's last generation
     * try (Mission F Section 6/25) -- captured even when the item ultimately
     * fails, so the catch block can persist WHY, not just THAT it failed. */
    let lastHardFailureReasons: string[] = [];
    // Hermes mission Sections 3/44/77: which real specialist stage this
    // attempt is currently inside -- advanced immediately after each stage
    // below actually completes, so a throw at ANY point is attributed to
    // the real stage that was in progress, not misreported as a generic
    // "preparation failed" with no stage context (the catch block below).
    let currentStage: HermesSocialSpecialistRole = "brand_intelligence";
    // Mission F Section 3/4/6: this item's OWN rejected-attempt history --
    // read before generating again so a cross-pass retry forces a genuinely
    // different angle, not a deterministic re-derivation of the identical
    // rejected one from unchanged campaign-wide recency alone. Present for
    // every never-retried row too (always []), so this is a pure no-op on
    // normal first-time preparation.
    const priorAttempts: RecoveryAttemptRecord[] = Array.isArray(item.recovery_state) ? item.recovery_state : [];
    const priorConcepts = [...new Set(priorAttempts.map((a) => a.concept).filter((v): v is string => Boolean(v)))];
    const priorPillars = [...new Set(priorAttempts.map((a) => a.pillar).filter((v): v is string => Boolean(v)))];
    const priorObjectives = [...new Set(priorAttempts.map((a) => a.objective).filter((v): v is string => Boolean(v)))] as ContentObjective[];
    const priorFailureReasons = [...new Set(priorAttempts.flatMap((a) => a.failureReasons ?? []))];
    // Mission F Section 3: staged, failure-specific recovery -- never a
    // blind identical retry. Retry 1+ always excludes the exact
    // concept/pillar already rejected for THIS item (Section 4
    // DUPLICATE_CONCEPT handling: "the new concept must be genuinely
    // different"). A retry additionally forces a new objective (-> a new
    // CTA style, Section 4 WEAK_CTA handling) when a previous attempt
    // specifically failed WEAK_CTA, or generically from the second retry
    // onward. The LAST allowed attempt also re-gathers fresh business
    // research (Section 5) rather than retrying against stale context.
    const isRecoveryRetry = item.retry_count > 0;
    const forceNewObjective = isRecoveryRetry && (priorFailureReasons.includes("WEAK_CTA") || item.retry_count >= 2);
    const isFinalRecoveryAttempt = item.retry_count >= MAX_RECOVERY_ATTEMPTS - 1;
    try {
      if (!provider) throw new Error("AI provider not configured");
      const { data: account } = await service.from("social_accounts").select("platform").eq("id", item.account_id).maybeSingle();
      const platform = account ? requirePlatform(account.platform, "platform") : null;
      if (!platform) throw new Error("destination account unavailable");

      const ownerCtx: OwnerContext = { ok: true, ownerId: item.owner_id, email: null, supabase: service as OwnerContext["supabase"] };
      const brandProfile = await getBoundBrandProfile(ownerCtx, authorization.brand_profile_id, authorization.tenant_id);
      if (!brandProfile) throw new Error("brand_binding_invalid");
      const pillarNames = brandProfile.content_pillars.map((pillar) => pillar.name);
      if (!pillarNames.length) throw new Error("Brand Brain has no content pillars yet");
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: "brand_intelligence", status: "COMPLETED",
        output: { businessName: brandProfile.identity.name ?? null, industry: brandProfile.identity.industry ?? null, pillarCount: pillarNames.length },
      });
      // Hermes mission Section 3: real Customer Psychology structuring --
      // the tenant's own Brand Brain audience pain-point data
      // (brandProfile.audiences[].pain_points), never fabricated.
      const customerPsychology = buildCustomerPsychologyProfile(brandProfile.audiences);
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: "customer_psychology", status: "COMPLETED",
        output: { audienceCount: customerPsychology.length, profiles: customerPsychology },
      });
      currentStage = "strategy_director";

      const mediaType = compositionMediaTypeForUnit(authorization.package_composition, contentUnitIndexForRow(item.package_sequence, authorization.counting_policy));
      if (!mediaType) throw new Error("package_composition_exhausted");

      // Mission F Section 5 (research-driven recovery): shadows the
      // batch-level `businessInformation` for the rest of this item's
      // generation ONLY -- "research once, generate many" stays correct for
      // every normal item; only an item on its LAST allowed recovery
      // attempt (already exhausted campaign-wide diversity signals) pays
      // for a genuine fresh re-gather, reusing the SAME real connector
      // (never a second research engine). Best-effort: a failed refresh
      // must never block this real, possibly-final attempt.
      let businessInformation = businessInformationBatch;
      if (isFinalRecoveryAttempt) {
        try {
          const freshInsights = await createSocialAuditConnectorInsightsProvider(service as Parameters<typeof createSocialAuditConnectorInsightsProvider>[0]).gather(authorization.tenant_id);
          const freshGoogleBusiness = freshInsights?.googleBusiness.state === "available" ? freshInsights.googleBusiness.data : null;
          if (freshGoogleBusiness) {
            const refreshed = buildVerifiedBusinessInformation({ googleBusiness: freshGoogleBusiness, brandBrain: null });
            businessInformation = [...new Set([...businessInformationBatch, ...refreshed])];
          }
        } catch {
          // businessInformation stays the batch-level facts -- fine.
        }
      }

      // Avoid obvious repetition (Section 26): tell the strategy layer which
      // pillars were used most recently in this authorization.
      const { data: recentPillars } = await service
        .from("social_autopilot_queue_items")
        .select("content_pillar")
        .eq("authorization_id", authorization.id)
        .not("content_pillar", "is", null)
        .order("created_at", { ascending: false })
        // Mission D+ Section 10/26-28: widened from 5 -- a 24-28 day
        // remaining period generates well past a 5-item lookback before a
        // pillar naturally comes back around, so a small window stopped
        // being a meaningful diversity signal partway through a real
        // campaign.
        .limit(15);
      const recentPillarNames = [...new Set((recentPillars ?? []).map((row) => row.content_pillar as string))];

      // Creative memory (Section 11/26): recent concept/caption/objective
      // history for THIS authorization -- steers buildCreativeBrief +
      // selectObjective toward variety, and lets scoreGeneratedContent
      // hard-reject a near-duplicate before it's ever persisted (Section 11
      // Creative Diversity Engine, Phase D of this campaign). Same query
      // also supplies recentAssetIds, replacing what used to be a separate,
      // narrower media-only lookup.
      const { data: recentVariantIdRows } = await service
        .from("social_autopilot_queue_items")
        .select("variant_id")
        .eq("authorization_id", authorization.id)
        .not("variant_id", "is", null)
        .order("created_at", { ascending: false })
        // Mission D+ Section 10/26-28: widened alongside the pillar window above.
        .limit(15);
      const recentVariantIds = [...new Set((recentVariantIdRows ?? []).map((row) => row.variant_id as string))];
      const recentConcepts: string[] = [];
      const recentCaptions: string[] = [];
      const recentObjectives: ContentObjective[] = [];
      // Subscription-Gated Visual Archetypes brief Section 9: real
      // rotation/diversity for Growth/Business automated generation needs
      // this tenant's own recently-USED archetypes -- recovered from the
      // same creative_spec.treatment already stored per generation
      // (Section "STEP 4" below), not a separate table.
      const recentArchetypeHistory: LayoutArchetype[] = [];
      let recentAssetIds: string[] = [];
      if (recentVariantIds.length) {
        const [{ data: recentVariants }, { data: recentMediaRows }] = await Promise.all([
          service.from("content_variants").select("caption, objective, creative_spec").in("id", recentVariantIds),
          mediaType === "text" ? Promise.resolve({ data: [] as Array<{ asset_id: string }> }) : service.from("social_content_variant_media").select("asset_id").in("variant_id", recentVariantIds),
        ]);
        for (const row of (recentVariants ?? []) as Array<{ caption?: unknown; objective?: unknown; creative_spec?: unknown }>) {
          if (typeof row.caption === "string" && row.caption) recentCaptions.push(row.caption);
          if (typeof row.objective === "string" && CONTENT_OBJECTIVE_VALUES.includes(row.objective as (typeof CONTENT_OBJECTIVE_VALUES)[number])) recentObjectives.push(row.objective as ContentObjective);
          const spec = (row.creative_spec ?? {}) as Record<string, unknown>;
          if (typeof spec.concept === "string" && spec.concept) recentConcepts.push(spec.concept);
          const specTreatment = (spec.treatment ?? null) as { layoutArchetype?: unknown } | null;
          if (specTreatment && typeof specTreatment.layoutArchetype === "string") recentArchetypeHistory.push(specTreatment.layoutArchetype as LayoutArchetype);
        }
        recentAssetIds = [...new Set((recentMediaRows ?? []).map((row) => row.asset_id as string))];
      }

      // Mission G: Business Content Intelligence & 28-Day Strategic Blueprint
      const businessIntel = deriveBusinessContentIntelligence({
        businessName: brandProfile.identity.name?.trim() || "",
        industryText: brandProfile.identity.industry ?? null,
        descriptionText: brandProfile.identity.description ?? null,
        verifiedFacts: businessInformation,
        brandTone: brandProfile.voice.tone,
        brandColors: brandProfile.visual.colors,
        audiences: brandProfile.audiences,
        blockedPhrases: brandProfile.voice.blocked_phrases,
        forbiddenClaims: brandProfile.voice.forbidden_claims,
      });

      const campaignPlan = buildCampaignStrategy({
        businessIntel,
        availablePillars: pillarNames,
        daysCount: authorization.period_target_units || 28,
      });

      const dayIndex = Math.max(0, (item.package_sequence ?? 1) - 1);
      const plannedStrategy = campaignPlan.days[dayIndex % campaignPlan.days.length] ?? null;
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: "strategy_director", status: "COMPLETED",
        output: { campaignDay: dayIndex + 1, objective: plannedStrategy?.objective ?? null, pillar: plannedStrategy?.contentPillar ?? null },
      });
      currentStage = "creative_brief";

      // Prefer Brand Brain's real target_audience fact over empty lists
      const audienceFact = businessInformation.find((fact) => fact.startsWith("Target audience:"));
      const audience = brandProfile.audiences[0]?.name?.trim() || audienceFact?.split(":").slice(1).join(":").trim() || null;

      const objective = (isRecoveryRetry && forceNewObjective)
        ? selectObjective({
            hasOffer: false,
            recentObjectives,
            ...(forceNewObjective ? { excludeObjectives: priorObjectives } : {}),
          })
        : (plannedStrategy?.objective || selectObjective({
            hasOffer: false,
            recentObjectives,
            ...(forceNewObjective ? { excludeObjectives: priorObjectives } : {}),
          }));

      const brief = buildCreativeBrief({
        businessName: brandProfile.identity.name?.trim() || "",
        industryText: brandProfile.identity.industry ?? null,
        descriptionText: brandProfile.identity.description ?? null,
        platform,
        mediaType,
        availablePillars: pillarNames,
        recentPillars: recentPillarNames,
        recentConcepts,
        recentCaptionExcerpts: recentCaptions,
        objective,
        verifiedFacts: businessInformation,
        brandTone: brandProfile.voice.tone,
        audience,
        seasonalContext: seasonalContextLine(new Date(item.scheduled_at), FESTIVAL_LOOKAHEAD_DAYS),
        excludeConcepts: isRecoveryRetry ? priorConcepts : [],
        excludePillars: isRecoveryRetry ? priorPillars : [],
        recentFailureContext: isRecoveryRetry ? priorFailureReasons : [],
        plannedStrategy: isRecoveryRetry ? null : plannedStrategy,
      });
      attemptedPillar = brief.contentPillar;
      attemptedConcept = brief.concept;
      attemptedObjective = objective;
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: "creative_brief", status: "COMPLETED", attempt: item.retry_count + 1,
        output: { contentPillar: brief.contentPillar, concept: brief.concept, objective, audience: brief.audience },
      });
      currentStage = "creative_director";

      // Premium Creative Intelligence (build brief Section 2): a real
      // creative-treatment step BEFORE copy -- business facts -> brand
      // visual DNA -> industry visual vocabulary -> a real, specific
      // creative concept and visual direction, not business -> caption
      // directly. Uses the SAME provider.complete() call convention as
      // copy generation below -- no bypass of the production
      // billing/routing layer, no schema-enforcement API this provider
      // interface doesn't support; parsed the same permissive way
      // parseGeneratedCopy already parses copy. Strictly non-blocking
      // (Section 28: a failed intelligence-layer call must never break the
      // pipeline) -- on any failure, treatment stays null and generation
      // falls back to exactly today's brief-only behavior.
      const brandDNA = deriveBrandVisualDNA({
        brandColors: brandProfile.visual.colors,
        brandTone: brandProfile.voice.tone,
        industryCategory: brief.industry,
      });
      const visualVocab = getIndustryVisualVocabulary(brief.industry);
      // STRATXCEL Master Execution Prompt Section 19: "the strategy must
      // use this information" -- real, live competitor/trend findings
      // (gathered once/week, see the weeklyCampaign block above) are
      // appended additively to the existing static curated library, never
      // replacing it. Only present once a prior pass this same real week
      // has actually completed the grounded search (eventual consistency
      // -- the pass that FIRST creates the weekly checkpoint fires the
      // real search in the background and won't see it yet; every
      // subsequent pass this week will).
      const liveIntelligence = (weeklyCampaign?.strategy as { marketIntelligence?: { available?: boolean; summary?: string | null } } | undefined)?.marketIntelligence;
      // STRATXCEL two-gap closure brief, Gap 2 (Section 9): the real
      // Monday performance snapshot (see the strategy.performanceAnalysis
      // write above) reaches the SAME real prompt-influencing seam
      // marketIntelligence already uses -- "research -> strategy -> brief
      // -> content" is a genuine trace, not two disconnected features.
      // Only appended once real strategicRecommendations exist
      // (dataSource: "REAL_ANALYTICS") -- a NO_ANALYTICS_AVAILABLE week
      // contributes nothing here rather than a fabricated recommendation.
      const livePerformance = (weeklyCampaign?.strategy as { performanceAnalysis?: PerformanceAnalysis } | undefined)?.performanceAnalysis;
      const researchInsights = [
        ...researchInsightsForIndustry(brief.industry === "generic" ? "all" : brief.industry),
        ...(liveIntelligence?.available && liveIntelligence.summary ? [`Real, current market research (gathered this week): ${liveIntelligence.summary}`] : []),
        ...(livePerformance?.dataSource === "REAL_ANALYTICS" && livePerformance.strategicRecommendations.length > 0
          ? [`Real performance analysis from last week's real published posts: ${livePerformance.strategicRecommendations.join(" ")}`]
          : []),
      ];

      // Subscription-Gated Visual Archetypes brief Sections 7 (Rule A/B)
      // + 9: server-authoritative archetype routing BEFORE the Gemini
      // strategy/treatment call, exactly as Rule A requires -- the AI is
      // informed of the constraint via buildCreativeTreatmentPrompt's own
      // routingContext handling, but forceArchetypeOntoTreatment below is
      // what actually guarantees it, regardless of what the AI returns.
      // Never trusts anything client-supplied: plan_tier and preferences
      // are both read fresh from their own canonical tables here, scoped
      // to this authorization's own tenant_id.
      const [{ data: routingSubscription }, { data: visualPreferences }] = await Promise.all([
        service.from("subscriptions").select("plan_tier").eq("id", authorization.subscription_id).eq("tenant_id", authorization.tenant_id).maybeSingle(),
        service.from("social_autopilot_visual_preferences").select("preferred_archetypes").eq("tenant_id", authorization.tenant_id).maybeSingle(),
      ]);
      const routingTier = (typeof routingSubscription?.plan_tier === "string" ? routingSubscription.plan_tier : "free") as Parameters<typeof resolveAutomatedRouting>[0]["tier"];
      const { routingContext, fallbackReason } = resolveAutomatedRouting({
        tier: routingTier,
        preferredArchetypes: visualPreferences?.preferred_archetypes ?? [],
        recentArchetypeHistory,
      });
      if (fallbackReason) {
        // Section 22: "the fallback should be documented and safe" --
        // a real audit trail entry, not just a code comment, so this is
        // actually observable in production rather than only in theory.
        await recordAudit({
          actorType: "SYSTEM", actorId: null, action: "social.archetype.fallback",
          targetType: "social_autopilot_authorization", targetId: authorization.id,
          summary: fallbackReason, meta: { tenantId: authorization.tenant_id, tier: routingTier },
        }).catch(() => {});
      }

      let treatment: CreativeTreatment | null = null;
      if (mediaType !== "text") {
        try {
          const treatmentMessages = buildCreativeTreatmentPrompt({
            brief,
            businessName: brandProfile.identity.name?.trim() || "",
            industry: brief.industry,
            brandDNA,
            visualVocab,
            mediaType,
            researchInsights,
            routingContext,
          });
          const treatmentResult = await provider.complete(
            // buildCreativeTreatmentPrompt only ever emits "system"/"user"
            // roles (see its body) -- AIMessage's broader role union
            // (includes "developer", which AgentTurnMessage doesn't model)
            // is why this needs an explicit cast rather than a plain pass.
            treatmentMessages.map((m) => ({ role: m.role, content: m.content })) as unknown as Parameters<typeof provider.complete>[0],
            [],
            { brandInstructions: selectGeminiBrandInstructions(brandProfile), tenantId: authorization.tenant_id, businessInformation }
          );
          const parsedTreatment = safeParseJson(treatmentResult.text);
          const issues = validateCreativeTreatment(parsedTreatment, { concept: brief.concept, routingContext, industry: brief.industry });
          if (!issues.length) treatment = forceArchetypeOntoTreatment(parsedTreatment as CreativeTreatment, routingContext);
        } catch {
          treatment = null;
        }
        await recordCampaignTask(service, {
          authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
          agentRole: "creative_director", status: treatment ? "COMPLETED" : "FAILED",
          output: treatment ? { concept: treatment.concept, hook: treatment.hook, layoutArchetype: treatment.layoutArchetype } : null,
          failureReason: treatment ? null : "treatment_generation_soft_failed_falls_back_to_brief_only",
        });
      }
      currentStage = "copywriter";

      // Phase E: generate -> score -> diagnose -> regenerate with targeted
      // corrective instructions, never a blind identical retry. Capped at 2
      // attempts (1 correction) -- each attempt is a real billable AI call
      // inside a cron batch of up to 20 items, so cost/latency are bounded
      // deliberately rather than exhausting the module's full default.
      const loopResult = await runGenerationLoop({
        maxAttempts: 2,
        generate: async (correctiveInstructions) => {
          const prompt = [
            `Generate ONE ${CANONICAL_PLATFORM_LABEL[platform] ?? platform} post for this brand, item ${item.package_sequence} of an autonomous content package.`,
            formatCreativeBriefForPrompt(brief),
            treatment
              ? [
                  `A REAL CREATIVE CONCEPT HAS ALREADY BEEN DEVELOPED -- write copy that matches it exactly, don't re-derive a different angle:`,
                  `- Concept: ${treatment.concept}`,
                  `- Hook: ${treatment.hook}`,
                  `- Story: ${treatment.story}`,
                  treatment.textHierarchy.length ? `- Planned on-image text (keep the caption consistent with, not a repeat of, this): ${treatment.textHierarchy.map((e) => `${e.role}: "${e.text}"`).join("; ")}` : "- No on-image text planned -- the caption carries the full message.",
                  treatment.cta.needed ? `- CTA: ${treatment.cta.text}` : `- No CTA needed for this creative (${treatment.cta.rationale}) -- do not force one into the caption.`,
                ].join("\n")
              : "",
            `Respond with ONLY strict JSON: {"title": string, "masterIdea": string, "caption": string, "hashtags": string[]}.`,
            `The "caption" value must read as natural, flowing social copy a person would actually write -- never insert a document-style section label (e.g. "Standards and Approach:", "Key Benefits:", "Summary:") anywhere inside it.`,
            correctiveInstructions.length
              ? `CORRECTIONS FROM A PREVIOUS ATTEMPT -- apply these specifically:\n${correctiveInstructions.map((i) => `- ${i}`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n");
          // tenantId is REQUIRED: AiRuntimeSocialProvider (the production
          // default whenever AI_ROUTER_ENABLED !== "0") throws
          // tenant_required_for_billable_ai as the first thing it does when
          // context.tenantId is missing -- this omission used to make every
          // autonomous preparation attempt fail before generating anything.
          const result = await provider.complete(
            [{ role: "user", content: prompt }],
            [],
            { brandInstructions: selectGeminiBrandInstructions(brandProfile), tenantId: authorization.tenant_id, businessInformation }
          );
          return parseGeneratedCopy(result.text);
        },
        toScoreInput: (copy) => ({
          caption: copy.caption,
          title: copy.title,
          hashtags: copy.hashtags,
          businessName: brandProfile.identity.name?.trim() ?? "",
          contentPillar: brief.contentPillar,
          concept: brief.concept,
          industry: brief.industry,
          verifiedFacts: businessInformation,
          brandTone: brandProfile.voice.tone,
          blockedPhrases: brandProfile.voice.blocked_phrases,
          forbiddenClaims: brandProfile.voice.forbidden_claims,
          audience: brief.audience,
          objective: brief.objective,
          recentCaptions,
          recentConcepts,
        }),
      });

      // Mission F Section 6/25: captured regardless of outcome -- the real
      // hard-failure reason codes from the LAST generation try this call
      // made, so a failure below (here or from anything downstream, e.g.
      // creative generation) still lets the catch block persist WHY this
      // attempt specifically failed, not just THAT it did.
      lastHardFailureReasons = loopResult.attempts[loopResult.attempts.length - 1]?.hardFailureReasons ?? [];

      if (!loopResult.success || !loopResult.content || !loopResult.scoreResult) {
        // Never a bare "quality gate failed" -- finalReason is built from
        // the actual hard-failure reason codes (Phase B).
        throw new Error(loopResult.finalReason ?? "Generated content failed the quality gate");
      }
      const generated = loopResult.content;
      const qualityScore = loopResult.scoreResult;
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: "copywriter", status: "COMPLETED", attempt: loopResult.attempts.length,
        output: { title: generated.title, hashtagCount: generated.hashtags.length, captionLength: generated.caption.length },
      });
      // Hermes mission Section 3: final_quality_director maps to the real
      // quality gate (scoreGeneratedContent, invoked inside runGenerationLoop
      // above) -- the SAME gate already enforces diversity
      // (DUPLICATE_CONCEPT), fact/claim safety, and target-industry
      // contamination as hard-fail reason codes inside qualityScore.breakdown
      // /hardFailures, so those checks are represented here rather than as
      // separate agent calls that don't exist in the real pipeline.
      currentStage = "final_quality_director";
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: "final_quality_director", status: qualityScore.passed ? "COMPLETED" : "FAILED",
        quality: { score: qualityScore.score, passed: qualityScore.passed, breakdown: qualityScore.breakdown },
        failureReason: qualityScore.passed ? null : qualityScore.hardFailures.map((f) => f.reason).join(", "),
      });
      currentStage = "visual_generation";

      // Mission D+ Sections 16-19: NET_NEW_AI must never fall back to
      // selectPackageMediaAsset -- generateNetNewPackageMediaAsset throws on
      // any real failure, which this try/catch already routes to BLOCKED
      // (never a silent old-image substitution, never PREPARED without a
      // genuinely new asset).
      const creativeMode = authorization.package_composition.creativeMode ?? "BRAND_LIBRARY";
      const mediaAsset =
        mediaType === "text"
          ? null
          : creativeMode === "NET_NEW_AI"
            ? await generateNetNewPackageMediaAsset(service, {
                tenantId: authorization.tenant_id,
                ownerId: brandProfile.owner_id,
                treatment,
                queueItemId: item.id,
              })
            : await selectPackageMediaAsset(service, { tenantId: authorization.tenant_id, ownerId: brandProfile.owner_id, mediaType, avoidAssetIds: recentAssetIds });
      if (mediaType !== "text") {
        await recordCampaignTask(service, {
          authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
          agentRole: "visual_generation", status: "COMPLETED",
          output: { mediaAssetId: mediaAsset?.id ?? null, creativeMode },
        });
        // Hermes mission Section 3: brand_logo_guardian maps to the real
        // logo-compositing boundary inside image-generation/service.ts
        // (resolveLogoVariantBundle/resolveLegacyLogoImage), which stamps
        // the tenant's REAL logo file onto every generated image rather
        // than letting the model draw one -- exercised for every asset this
        // stage produces, so recorded alongside it rather than as a
        // separate, unreachable-from-here call.
        await recordCampaignTask(service, {
          authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
          agentRole: "brand_logo_guardian", status: "COMPLETED",
          output: { mediaAssetId: mediaAsset?.id ?? null },
        });
      }
      // Real gap found live (Fix Main Content UI / Force Publish mission):
      // content_master/content_variants carry a DB-enforced XOR constraint
      // -- (owner_id IS NOT NULL) <> (tenant_id IS NOT NULL), see
      // 20260818230000_social_copilot_tenant_scoping.sql -- and this used
      // to build an OwnerContext (writes owner_id only). owner_id-scoped
      // rows are only ever RLS-visible to a real StratXcel staff member
      // (content_master_admin_owner requires stratxcel_admins membership);
      // a real customer viewing their OWN tenant's package-autopilot
      // content can NEVER see it via content_master_tenant_member, which
      // requires tenant_id IS NOT NULL. Confirmed live: 27 of 28 real
      // content_master rows had owner_id set and tenant_id null, and a
      // real customer session (magic-link login, not service role) got
      // "No content found" on /app/content -- not an image problem, the
      // rows were completely invisible. Fixed at the source: build a real
      // AgentTenantContext (mode: "tenant") instead, so every future
      // package-autopilot post is tenant-scoped and visible to the tenant
      // that actually paid for it.
      const brandCtx: AgentTenantContext = {
        ok: true,
        mode: "tenant",
        tenantId: authorization.tenant_id,
        actorUserId: brandProfile.owner_id,
        supabase: service as AgentTenantContext["supabase"],
      };
      const { data: sibling } = item.content_unit_key ? await service.from("social_autopilot_queue_items").select("content_master_id").eq("authorization_id", authorization.id).eq("content_unit_key", item.content_unit_key).not("content_master_id", "is", null).limit(1).maybeSingle() : { data: null };
      const masterId = sibling?.content_master_id ?? await createContentMaster(brandCtx, {
        title: generated.title,
        masterIdea: generated.masterIdea,
        objective,
        contentPillar: brief.contentPillar,
        campaignId: null,
      });
      const variantId = await createContentVariant(brandCtx, {
        masterId,
        platform,
        format: "post",
        objective,
        caption: generated.caption,
        hashtags: generated.hashtags,
        mediaUrls: [],
        // Reused by the NEXT item's recentConcepts lookup above, and by the
        // (Phase K) UI to show a real "quality state" per item instead of
        // just PREPARED/BLOCKED -- no schema migration needed, reusing the
        // existing extensible creative_spec JSONB column
        // (content_variants.creative_spec, already used for
        // youtube_privacy_status/generationKey elsewhere in this codebase).
        creativeSpec: {
          concept: brief.concept,
          hookDirection: brief.hook,
          ctaDirection: brief.cta,
          qualityScore: qualityScore.score,
          qualityBreakdown: qualityScore.breakdown,
          attempts: loopResult.attempts.length,
          plannedStrategy: plannedStrategy ?? undefined,
          treatment: treatment ?? undefined,
        },
      });
      if (mediaAsset) {
        await service.from("social_content_variant_media").insert({ variant_id: variantId.id, asset_id: mediaAsset.id, position: 0 });
      }

      await service
        .from("social_autopilot_queue_items")
        .update({
          variant_id: variantId.id,
          content_master_id: masterId,
          content_pillar: brief.contentPillar,
          media_type: mediaType,
          status: authorization.publishing_mode === "AUTO_PUBLISH" ? "PREPARED" : "REVIEW_REQUIRED",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .in("status", ["PLANNED", "BLOCKED"]); // only advance a still-PLANNED/BLOCKED row — never overwrite a concurrently-edited/settled one; BLOCKED is included so a successful cross-pass retry (Section 21) can advance it too
      prepared += 1;
    } catch (err) {
      blocked += 1;
      // Mission D+ Section 21: a retried BLOCKED item's failed pillar is
      // now recorded when generation got far enough to pick one
      // (previously only a successful PREPARED write ever set
      // content_pillar) -- recentPillarNames above scans ALL queue items
      // regardless of status, so this is what makes the NEXT retry's
      // deterministic selectLeastRecentlyUsed actually steer toward a
      // different pillar instead of re-deriving the identical failed one
      // from unchanged history. null when the failure happened before a
      // pillar was ever chosen (e.g. no AI provider configured) -- leaves
      // the item's existing content_pillar (if any) untouched rather than
      // overwriting it with a fabricated value.
      const errorMessage = err instanceof Error ? err.message : "preparation failed";
      // Hermes mission Sections 44/77: attributed to whichever real
      // specialist stage was actually in progress when this threw
      // (currentStage, advanced immediately after each stage above
      // completes) -- never a generic, stage-less failure record.
      await recordCampaignTask(service, {
        authorizationId: authorization.id, tenantId: authorization.tenant_id, queueItemId: item.id,
        agentRole: currentStage, status: "FAILED", attempt: item.retry_count + 1,
        failureReason: errorMessage,
      });

      // STRATXCEL FINAL REMAINING BLOCKERS mission Section 11/17: a real,
      // live-observed problem -- a sustained external provider rate limit
      // was consuming the SAME bounded recovery-attempt budget as a
      // genuine quality/originality rejection, silently exhausting real
      // content days for a reason that had nothing to do with the content
      // itself. A transient, retryable infrastructure failure (the real
      // error_retryable signal from image-generation/service.ts, not a
      // guess at message text) leaves the item exactly where it was --
      // still BLOCKED, still immediately eligible for the very next
      // automatic pass, its recovery budget untouched -- instead of
      // burning one of its bounded MAX_RECOVERY_ATTEMPTS on an outage that
      // was never a verdict on the content.
      if (err instanceof NetNewGenerationError && err.retryable) {
        // blocked was already incremented at the top of this catch block.
        // Real content strategy WAS chosen and used for this attempt (the
        // copy itself was fine -- only the image infrastructure failed);
        // recorded the same way a genuine failure records it, so the
        // campaign-wide diversity signal (recentPillarNames) stays accurate.
        await service
          .from("social_autopilot_queue_items")
          .update({
            status: "BLOCKED",
            ...(attemptedPillar ? { content_pillar: attemptedPillar } : {}),
            last_error: `${errorMessage} (transient provider condition -- will retry automatically, does not count toward recovery attempts)`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .in("status", ["PLANNED", "BLOCKED"]);
        continue;
      }

      const nextRetryCount = item.retry_count + 1;
      // Mission F Section 11: a real, bounded dead-letter limit -- once
      // every staged recovery attempt has genuinely been tried and failed,
      // stop retrying automatically. This never drops the day from the
      // campaign (Section 12/9) -- the row, and its full real failure
      // history, stays exactly where it is, explicitly marked for a human
      // look instead of silently retried forever or silently abandoned.
      const exhausted = nextRetryCount >= MAX_RECOVERY_ATTEMPTS;
      if (exhausted) recoveryExhausted += 1;
      // Mission F Section 6: this attempt's real outcome, appended to the
      // item's own recovery ledger -- what the NEXT attempt (if any) reads
      // to guarantee a materially different strategy.
      const attemptRecord: RecoveryAttemptRecord = {
        attempt: nextRetryCount,
        pillar: attemptedPillar,
        concept: attemptedConcept,
        objective: attemptedObjective,
        failureReasons: lastHardFailureReasons,
        at: new Date().toISOString(),
      };
      await service
        .from("social_autopilot_queue_items")
        .update({
          status: "BLOCKED",
          ...(attemptedPillar ? { content_pillar: attemptedPillar } : {}),
          last_error: exhausted
            ? `recovery exhausted after ${nextRetryCount} structurally different attempts -- last failure: ${errorMessage}`
            : errorMessage,
          retry_count: nextRetryCount,
          recovery_state: [...priorAttempts, attemptRecord],
          recovery_exhausted: exhausted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .in("status", ["PLANNED", "BLOCKED"]);
      if (exhausted) {
        // Section 12: "expose it in admin/support diagnostics" -- a real
        // audit trail entry distinct from an ordinary BLOCKED (which is
        // still actively, automatically being retried), so this is
        // actually observable without reading queue-item rows directly.
        // The /admin/social/packages "Blocked items" panel surfaces the
        // same recovery_exhausted flag directly on the row.
        await recordAudit({
          actorType: "SYSTEM",
          action: "social.package.recovery_exhausted",
          targetType: "social_autopilot_queue_item",
          targetId: item.id,
          summary: `Content item exhausted all ${MAX_RECOVERY_ATTEMPTS} staged recovery attempts -- needs a human/support look`,
          meta: {
            tenantId: authorization.tenant_id,
            authorizationId: authorization.id,
            attempts: [...priorAttempts, attemptRecord].map((a) => ({ attempt: a.attempt, failureReasons: a.failureReasons })),
          },
        }).catch(() => {});
      }
    }
  }

  // Mission E Section 2/4: a real, cheap count -- not a heuristic -- of
  // whatever is STILL eligible after this call, using the exact same
  // WHERE clause as the due-item query above. Deadline-hit always implies
  // more work (the loop broke before finishing dueItems); otherwise this
  // is the only way to know whether dueItems's own 20-row page was the
  // whole remaining backlog or just the front of a longer one.
  let moreWorkRemaining = deadlineHit;
  if (!moreWorkRemaining) {
    const { count } = await service
      .from("social_autopilot_queue_items")
      .select("id", { count: "exact", head: true })
      .eq("authorization_id", authorization.id)
      .eq("period_number", authorization.period_number)
      .in("status", ["PLANNED", "BLOCKED"])
      .eq("recovery_exhausted", false)
      .lt("retry_count", MAX_RECOVERY_ATTEMPTS)
      .lte("scheduled_at", horizonEnd);
    moreWorkRemaining = (count ?? 0) > 0;
  }

  return { prepared, blocked, recoveryExhausted, moreWorkRemaining };
}

/**
 * Applies the configured late-item policy to a due item that is past its
 * scheduled time — never bursts a backlog of overdue posts (Section 20/99).
 */
async function applyLateItemPolicy(service: ServiceClient, item: PackageQueueItemRow, authorization: PackageAuthorizationRow, lateMs: number) {
  const graceMs = authorization.grace_window_minutes * 60_000;
  if (authorization.late_item_policy === "PUBLISH_IF_WITHIN_GRACE_WINDOW" && lateMs <= graceMs) {
    return { action: "publish" as const };
  }
  if (authorization.late_item_policy === "SKIP") {
    await skipPackageQueueItem(service, { queueItemId: item.id, reason: "missed_schedule_skip_policy" });
    return { action: "skipped" as const };
  }
  // Default / RESCHEDULE_NEXT_SLOT (and grace-exceeded PUBLISH_IF_WITHIN_GRACE_WINDOW): push to the next reasonable slot instead of publishing late or bursting.
  await service
    .from("social_autopilot_queue_items")
    .update({ scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", item.status);
  return { action: "rescheduled" as const };
}

export interface PackageBatchResult {
  processed: number;
  results: Array<{ queueItemId: string; outcome: string }>;
}

/**
 * The execution tick: claims and publishes DUE, PREPARED package items
 * through the existing publishing engine. One tenant's failure never stops
 * another's (Section 52) — every item is isolated in its own try/catch.
 * Checked against the global/worker/tenant kill switch before any claim.
 */
export async function runPackageAutopilotBatch(service: ServiceClient, batchSize = 20): Promise<PackageBatchResult | { processed: 0; skipped: string }> {
  const globalKill = await packageKillSwitchActive(service);
  if (globalKill.active) return { processed: 0, skipped: `kill_switch:${globalKill.reason ?? globalKill.scope}` };

  const { data: dueRows } = await service
    .from("social_autopilot_queue_items")
    .select("*, social_autopilot_authorizations!inner(late_item_policy, grace_window_minutes, tenant_id)")
    .in("status", ["PREPARED", "SCHEDULED"])
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(batchSize);

  const results: PackageBatchResult["results"] = [];
  for (const row of dueRows ?? []) {
    const item = row as PackageQueueItemRow & { social_autopilot_authorizations: { late_item_policy: LateItemPolicy; grace_window_minutes: number; tenant_id: string } };
    try {
      const tenantKill = await packageKillSwitchActive(service, item.tenant_id);
      if (tenantKill.active) {
        results.push({ queueItemId: item.id, outcome: `kill_switch:${tenantKill.reason ?? "tenant"}` });
        continue;
      }
      const lateMs = Date.now() - new Date(item.scheduled_at).getTime();
      if (lateMs > 5 * 60_000) {
        const policyOutcome = await applyLateItemPolicy(
          service,
          item,
          { ...item.social_autopilot_authorizations, id: item.authorization_id } as PackageAuthorizationRow,
          lateMs
        );
        if (policyOutcome.action !== "publish") {
          results.push({ queueItemId: item.id, outcome: policyOutcome.action });
          continue;
        }
      }
      const outcome = await executeAuthorizedPackagePost(service, item.id, item.scheduled_at);
      const published = "published" in outcome && outcome.published;
      results.push({ queueItemId: item.id, outcome: published ? "published" : (outcome as { reason?: string }).reason ?? "failed" });
      // Best-effort, non-blocking — never lets a notification failure affect the publish result already recorded above.
      void notifyPackageEvent(service, {
        tenantId: item.tenant_id,
        queueItemId: item.id,
        event: published ? "published" : "failed",
        permalink: "result" in outcome ? (outcome.result as { permalink?: string } | undefined)?.permalink ?? null : null,
        error: "result" in outcome ? (outcome.result as { outcomeNote?: string } | undefined)?.outcomeNote ?? null : null,
      }).catch(() => {});
    } catch (err) {
      results.push({ queueItemId: item.id, outcome: err instanceof Error ? err.message : "execution_error" });
    }
  }

  await recordWorkerHeartbeat(service as Parameters<typeof recordWorkerHeartbeat>[0], {
    workerType: PACKAGE_WORKER_TYPE as never,
    instanceId: `package-worker-${process.pid}`,
    status: "idle",
    queueBacklogHint: results.length,
  }).catch(() => {});

  return { processed: results.length, results };
}

/**
 * Skip semantics are configured per package, never assumed (Section 35).
 * SKIP_COUNTS consumes the delivered-opportunity quota; SKIP_REPLACED does
 * not (the caller/producer is expected to plan a replacement slot).
 */
export async function skipPackageQueueItem(service: ServiceClient, input: { queueItemId: string; reason?: string }) {
  const { data: item } = await service
    .from("social_autopilot_queue_items")
    .select("*, social_autopilot_authorizations!inner(skip_policy, entitlement_id)")
    .eq("id", input.queueItemId)
    .maybeSingle();
  if (!item) throw new Error("Queue item not found");
  const auth = item.social_autopilot_authorizations as { skip_policy: SkipPolicy; entitlement_id: string };
  const countsAgainstQuota = auth.skip_policy === "SKIP_COUNTS";

  // A not-yet-claimed item skips directly (the settle RPC's EXECUTING
  // precondition doesn't apply here — nothing was ever claimed). Guarded
  // to only transition a still-pending row, so this can't skip something
  // the worker just claimed a moment ago.
  const { data: updated, error } = await service
    .from("social_autopilot_queue_items")
    .update({
      status: "SKIPPED",
      last_error: input.reason ?? "skipped_by_client",
      quota_consumed: countsAgainstQuota,
      settled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED"])
    .select("id")
    .maybeSingle();
  if (error || !updated) throw new Error("This item can no longer be skipped");

  if (countsAgainstQuota) {
    // Same "never exceed the limit" guarantee as settle_social_package_post,
    // via optimistic concurrency (CAS on the just-read current_usage) since
    // this path never goes through the row-locked RPC — skip is a
    // human-triggered, low-frequency action, not a hot concurrent claim path.
    const { data: entitlement } = await service.from("usage_entitlements").select("current_usage, limit_amount").eq("id", auth.entitlement_id).maybeSingle();
    if (entitlement && entitlement.current_usage < entitlement.limit_amount) {
      await service
        .from("usage_entitlements")
        .update({ current_usage: entitlement.current_usage + 1, updated_at: new Date().toISOString() })
        .eq("id", auth.entitlement_id)
        .eq("current_usage", entitlement.current_usage);
    }
  }
  return { skipped: true, countsAgainstQuota };
}

/**
 * REVIEW_BEFORE_PUBLISH packages leave every prepared item at
 * REVIEW_REQUIRED (Section 16) -- a customer-facing "Ready for review"
 * state. Real, serious bug found live (Hermes-Orchestrated Content Engine
 * Hardening mission): nothing in this pipeline ever moved a REVIEW_REQUIRED
 * item onward -- runPackageAutopilotBatch's due-item poll only ever matched
 * status in ("PREPARED", "SCHEDULED"), so every reviewed customer's
 * content sat "Ready for review" forever with genuinely no way to actually
 * publish it, not even manually; the dashboard didn't even render an
 * action button for it. This is the one real approval action that unblocks
 * it: moves the item to SCHEDULED (the batch executor's own poll picks it
 * up from here on, at its existing scheduled_at). When `publishNow` is
 * set, scheduled_at is also pulled forward to now -- the caller (the API
 * route) is responsible for triggering a batch run immediately after; this
 * function only performs the real, guarded status transition, matching
 * skipPackageQueueItem's own "only a still-pending row" guard above.
 */
export async function approvePackageQueueItem(service: ServiceClient, input: { queueItemId: string; publishNow?: boolean }) {
  const patch: Record<string, unknown> = { status: "SCHEDULED", updated_at: new Date().toISOString() };
  if (input.publishNow) patch.scheduled_at = new Date().toISOString();
  const { data, error } = await service
    .from("social_autopilot_queue_items")
    .update(patch)
    .eq("id", input.queueItemId)
    .eq("status", "REVIEW_REQUIRED")
    .select("id, scheduled_at")
    .maybeSingle();
  if (error || !data) throw new Error("This item is not awaiting review, or was already approved");
  return { approved: true, scheduledAt: data.scheduled_at as string };
}

/** Reschedule while preserving the exact caption/media already prepared — never a duplicate row, never a stale second schedule (Section 34).
 * `scheduledAt` must already be a UTC ISO instant. Prefer `reschedulePackageQueueItemInTimezone` from the client control surface. */
export async function reschedulePackageQueueItem(service: ServiceClient, input: { queueItemId: string; scheduledAt: string }) {
  const { data, error } = await service
    .from("social_autopilot_queue_items")
    .update({ scheduled_at: input.scheduledAt, updated_at: new Date().toISOString() })
    .eq("id", input.queueItemId)
    .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED"])
    .select("id, scheduled_at")
    .maybeSingle();
  if (error || !data) throw new Error("This item can no longer be rescheduled");
  return data;
}

/**
 * Client-safe reschedule: accepts a package-timezone wall clock
 * (`YYYY-MM-DDTHH:mm`) and converts to UTC using the authorization's IANA
 * timezone — never the browser timezone.
 */
export async function reschedulePackageQueueItemInTimezone(
  service: ServiceClient,
  input: { queueItemId: string; tenantId: string; scheduledWall: string }
) {
  const { data: item } = await service
    .from("social_autopilot_queue_items")
    .select("id, authorization_id, social_autopilot_authorizations!inner(timezone, tenant_id)")
    .eq("id", input.queueItemId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!item) throw new Error("Queue item not found");
  const timezone = String((item.social_autopilot_authorizations as { timezone?: string }).timezone ?? "Asia/Kolkata");
  const scheduledAt = datetimeLocalValueToUtcIso(input.scheduledWall, timezone);
  return reschedulePackageQueueItem(service, { queueItemId: input.queueItemId, scheduledAt });
}

/** Edits the prepared caption/hashtags in place — the worker always resolves the CURRENT variant at execution time, so this can never publish a stale payload (Section 33/47). */
export async function editPackageQueueItemContent(service: ServiceClient, input: { queueItemId: string; caption?: string; hashtags?: string[] }) {
  const { data: item } = await service.from("social_autopilot_queue_items").select("variant_id, status").eq("id", input.queueItemId).maybeSingle();
  if (!item || !item.variant_id) throw new Error("This item has no prepared content yet");
  if (!["PREPARED", "REVIEW_REQUIRED", "SCHEDULED"].includes(item.status)) throw new Error("This item can no longer be edited");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.caption !== undefined) patch.caption = input.caption;
  if (input.hashtags !== undefined) patch.hashtags = input.hashtags;
  const { error } = await service.from("content_variants").update(patch).eq("id", item.variant_id);
  if (error) throw new Error(error.message);
  return { edited: true };
}
