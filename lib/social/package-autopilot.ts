import type { ServiceClient } from "@stratxcel/whatsapp";
import { isKillSwitchActive, recordWorkerHeartbeat } from "@stratxcel/queue";
import crypto from "node:crypto";
import { scheduleJob } from "./repositories/publishing.ts";
import { runPublishNow } from "./agent/publish-outcome.ts";
import { getBoundBrandProfile } from "./repositories/brand.ts";
import { createContentMaster, createContentVariant } from "./repositories/content.ts";
import { resolveConfiguredProvider } from "./agent/provider.ts";
import { selectGeminiBrandInstructions } from "./agent/gemini-boundary.ts";
import { requirePlatform, requireContentObjective } from "./content-options.ts";
import { computePackageDistribution, datetimeLocalValueToUtcIso } from "./package-distribution.ts";
import { notifyPackageEvent } from "./package-whatsapp-notify.ts";
import type { OwnerContext } from "./db-context.ts";
import { CONTENT_OBJECTIVE_VALUES } from "./content-options.ts";
import { validatePackageComposition, compositionMediaTypeForUnit, resolvePurchasedPackageComposition, type PackageComposition } from "./package-composition.ts";
import { selectPackageMediaAsset } from "./package-media.ts";
import { recordAudit } from "./repositories/system.ts";

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
  if (!entitlement || entitlement.metric !== "social_posts" || entitlement.is_paused) {
    throw new Error("prerequisite_missing: plan does not include an active social_posts entitlement");
  }
  const platforms = [...new Set(input.allowedPlatforms.map((value) => value.toLowerCase()).filter(Boolean))];
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

async function validatePackageResumePrerequisites(service: ServiceClient, authorizationId: string, tenantId: string, clientUserId: string) {
  const { data: auth } = await service.from("social_autopilot_authorizations")
    .select("id,subscription_id,entitlement_id,brand_profile_id,allowed_platforms,package_composition")
    .eq("id", authorizationId).eq("tenant_id", tenantId).eq("client_user_id", clientUserId).maybeSingle();
  if (!auth) throw new Error("authorization_not_found");
  const [{ data: subscription }, { data: entitlement }, { data: brand }, { data: accounts }] = await Promise.all([
    service.from("subscriptions").select("status,current_period_end").eq("id", auth.subscription_id).eq("tenant_id", tenantId).maybeSingle(),
    service.from("usage_entitlements").select("metric,is_paused,limit_amount,current_usage").eq("id", auth.entitlement_id).eq("tenant_id", tenantId).eq("subscription_id", auth.subscription_id).maybeSingle(),
    service.from("social_brand_profiles").select("id,owner_id,tenant_id").eq("id", auth.brand_profile_id).eq("tenant_id", tenantId).maybeSingle(),
    service.from("social_accounts").select("platform").eq("tenant_id", tenantId).eq("status", "CONNECTED").in("platform", auth.allowed_platforms),
  ]);
  if (!subscription || subscription.status !== "active" || new Date(subscription.current_period_end).getTime() <= Date.now()) throw new Error("subscription_inactive");
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
  const platforms = [...new Set(input.allowedPlatforms.map((value) => value.toLowerCase()).filter(Boolean))];
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
    await settleAuthorizedPackagePost(service, { queueItemId, outcome: "FAILED", error: error instanceof Error ? error.message : "package publish failed", tenantId: claim.tenantId });
    await recordAudit({
      actorType: "SYSTEM",
      action: "social.package.publish_failed",
      targetType: "social_autopilot_queue_item",
      targetId: queueItemId,
      summary: "Automatic package publish failed",
      meta: { tenantId: claim.tenantId ?? null, error: error instanceof Error ? error.message : "package publish failed" },
    }).catch(() => {});
    throw error;
  }
}

const PACKAGE_WORKER_TYPE = "package-autopilot-worker" as const;

async function packageKillSwitchActive(service: ServiceClient, tenantId?: string) {
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

interface GeneratedPost {
  contentPillar: string;
  objective: string;
  title: string;
  masterIdea: string;
  caption: string;
  hashtags: string[];
}

function parseGeneratedPost(text: string): GeneratedPost | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const contentPillar = typeof parsed.contentPillar === "string" ? parsed.contentPillar.trim() : "";
    const caption = typeof parsed.caption === "string" ? parsed.caption.trim() : "";
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const masterIdea = typeof parsed.masterIdea === "string" ? parsed.masterIdea.trim() : "";
    const objective = typeof parsed.objective === "string" ? parsed.objective.trim() : "";
    const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).map((tag) => tag.replace(/^#/, "")).filter(Boolean) : [];
    if (!contentPillar || !caption || caption.length < 10 || /\[insert|\btodo\b/i.test(caption)) return null;
    return { contentPillar, objective, title: title || caption.slice(0, 60), masterIdea: masterIdea || caption, caption, hashtags };
  } catch {
    return null;
  }
}

/**
 * The preparation layer (Section 16): turns PLANNED slots inside the
 * preparation horizon into real content — grounded in Brand Brain, using
 * the SAME repository functions (createContentMaster/createContentVariant)
 * the manual Copilot uses, never a second content generator. A slot whose
 * generation fails the quality gate (missing/invalid pillar, placeholder
 * text, no configured AI provider) is marked BLOCKED with a real reason —
 * never silently published with garbage (Section 28/48).
 */
export async function prepareNearTermPackageItems(service: ServiceClient, authorizationId: string): Promise<{ prepared: number; blocked: number }> {
  const { data: authRow } = await service.from("social_autopilot_authorizations").select("*").eq("id", authorizationId).maybeSingle();
  if (!authRow) return { prepared: 0, blocked: 0 };
  const authorization = authRow as PackageAuthorizationRow;
  if (authorization.state !== "ACTIVE") return { prepared: 0, blocked: 0 };

  const horizonEnd = new Date(Date.now() + authorization.preparation_horizon_days * 86_400_000).toISOString();
  const { data: dueItems } = await service
    .from("social_autopilot_queue_items")
    .select("*")
    .eq("authorization_id", authorization.id)
    .eq("period_number", authorization.period_number)
    .eq("status", "PLANNED")
    .lte("scheduled_at", horizonEnd)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  const provider = resolveConfiguredProvider();
  let prepared = 0;
  let blocked = 0;

  for (const raw of dueItems ?? []) {
    const item = raw as PackageQueueItemRow;
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

      // Avoid obvious repetition (Section 26): tell the model which pillars
      // were used most recently in this authorization so it varies topics.
      const { data: recentPillars } = await service
        .from("social_autopilot_queue_items")
        .select("content_pillar")
        .eq("authorization_id", authorization.id)
        .not("content_pillar", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);
      const recentPillarNames = [...new Set((recentPillars ?? []).map((row) => row.content_pillar as string))];

      const prompt = [
        `Generate ONE ${CANONICAL_PLATFORM_LABEL[platform] ?? platform} post for this brand, item ${item.package_sequence} of an autonomous content package.`,
        `Choose exactly one contentPillar from this saved list: ${pillarNames.join(", ")}.`,
        recentPillarNames.length ? `Recently used pillars (prefer a different one for variety): ${recentPillarNames.join(", ")}.` : "",
        `Respond with ONLY strict JSON: {"contentPillar": string (must match the list exactly), "objective": one of ${CONTENT_OBJECTIVE_VALUES.join("|")}, "title": string, "masterIdea": string, "caption": string, "hashtags": string[]}.`,
        "The caption must be genuine, specific, platform-appropriate, and contain no placeholder text.",
      ].filter(Boolean).join("\n");

      const result = await provider.complete(
        [{ role: "user", content: prompt }],
        [],
        { brandInstructions: selectGeminiBrandInstructions(brandProfile) }
      );
      const generated = parseGeneratedPost(result.text);
      if (!generated) throw new Error("Generated content failed the quality gate");
      const canonicalPillar = pillarNames.find((name) => name.toLowerCase() === generated.contentPillar.toLowerCase());
      if (!canonicalPillar) throw new Error(`Generated pillar "${generated.contentPillar}" is not a saved Brand Brain pillar`);
      const objective = CONTENT_OBJECTIVE_VALUES.includes(generated.objective as (typeof CONTENT_OBJECTIVE_VALUES)[number])
        ? generated.objective
        : requireContentObjective("ENGAGEMENT");

      const mediaType = compositionMediaTypeForUnit(authorization.package_composition, contentUnitIndexForRow(item.package_sequence, authorization.counting_policy));
      if (!mediaType) throw new Error("package_composition_exhausted");
      const mediaAsset = await selectPackageMediaAsset(service, { tenantId: authorization.tenant_id, ownerId: brandProfile.owner_id, mediaType });
      const brandCtx: OwnerContext = { ...ownerCtx, ownerId: brandProfile.owner_id };
      const { data: sibling } = item.content_unit_key ? await service.from("social_autopilot_queue_items").select("content_master_id").eq("authorization_id", authorization.id).eq("content_unit_key", item.content_unit_key).not("content_master_id", "is", null).limit(1).maybeSingle() : { data: null };
      const masterId = sibling?.content_master_id ?? await createContentMaster(brandCtx, {
        title: generated.title,
        masterIdea: generated.masterIdea,
        objective,
        contentPillar: canonicalPillar,
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
      });
      if (mediaAsset) {
        await service.from("social_content_variant_media").insert({ variant_id: variantId.id, asset_id: mediaAsset.id, position: 0 });
      }

      await service
        .from("social_autopilot_queue_items")
        .update({
          variant_id: variantId.id,
          content_master_id: masterId,
          content_pillar: canonicalPillar,
          media_type: mediaType,
          status: authorization.publishing_mode === "AUTO_PUBLISH" ? "PREPARED" : "REVIEW_REQUIRED",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "PLANNED"); // only advance a still-PLANNED row — never overwrite a concurrently-edited/settled one
      prepared += 1;
    } catch (err) {
      blocked += 1;
      await service
        .from("social_autopilot_queue_items")
        .update({ status: "BLOCKED", last_error: err instanceof Error ? err.message : "preparation failed", updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "PLANNED");
    }
  }

  return { prepared, blocked };
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
