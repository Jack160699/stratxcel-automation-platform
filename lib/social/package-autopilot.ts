import type { ServiceClient } from "@stratxcel/whatsapp";
import { scheduleJob } from "./repositories/publishing.ts";
import { runPublishNow } from "./agent/publish-outcome.ts";

export type PackagePublishingMode = "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";
export type PackageAuthorizationState = "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";

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

export async function activatePackageAutopilot(service: ServiceClient, input: { tenantId: string; clientUserId: string; subscriptionId: string; entitlementId: string; publishingMode: PackagePublishingMode; allowedPlatforms: string[]; startsAt?: string; endsAt?: string }) {
  const [{ data: membership }, { data: subscription }, { data: entitlement }] = await Promise.all([
    service.from("tenant_members").select("user_id").eq("tenant_id", input.tenantId).eq("user_id", input.clientUserId).maybeSingle(),
    service.from("subscriptions").select("id,status,current_period_end").eq("id", input.subscriptionId).eq("tenant_id", input.tenantId).maybeSingle(),
    service.from("usage_entitlements").select("id,metric,is_paused").eq("id", input.entitlementId).eq("tenant_id", input.tenantId).eq("subscription_id", input.subscriptionId).maybeSingle(),
  ]);
  if (!membership || subscription?.status !== "active" || new Date(subscription.current_period_end).getTime() <= Date.now() || entitlement?.metric !== "social_posts" || entitlement.is_paused) throw new Error("Package is not eligible for Social Autopilot activation");
  const platforms = [...new Set(input.allowedPlatforms.map((value) => value.toLowerCase()).filter(Boolean))];
  if (!platforms.length) throw new Error("At least one allowed platform is required");
  const { data, error } = await service.from("social_autopilot_authorizations").upsert({
    tenant_id: input.tenantId, client_user_id: input.clientUserId, subscription_id: input.subscriptionId,
    entitlement_id: input.entitlementId, publishing_mode: input.publishingMode, state: "ACTIVE",
    allowed_platforms: platforms, content_scope: { metric: "social_posts" }, activated_at: new Date().toISOString(),
    starts_at: input.startsAt ?? new Date().toISOString(), ends_at: input.endsAt ?? subscription.current_period_end,
    revoked_at: null, updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,subscription_id,entitlement_id" }).select("*").single();
  if (error || !data) throw new Error("Could not activate Social Autopilot");
  return data;
}

export async function setPackageAutopilotState(service: ServiceClient, input: { authorizationId: string; tenantId: string; clientUserId: string; state: PackageAuthorizationState }) {
  const { data, error } = await service.from("social_autopilot_authorizations").update({ state: input.state, revoked_at: input.state === "CANCELLED" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", input.authorizationId).eq("tenant_id", input.tenantId).eq("client_user_id", input.clientUserId).select("id,state").maybeSingle();
  if (error || !data) throw new Error("Package authorization was not found for this client");
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
export async function settleAuthorizedPackagePost(service: ServiceClient, input: { queueItemId: string; outcome: "PUBLISHED" | "FAILED" | "SKIPPED" | "SHADOW_COMPLETED"; publishingJobId?: string; error?: string }) {
  const { data, error } = await service.rpc("settle_social_package_post", {
    p_queue_item_id: input.queueItemId,
    p_outcome: input.outcome,
    p_publishing_job_id: input.publishingJobId ?? null,
    p_error: input.error ?? null,
  });
  if (error) throw new Error("Could not settle package post");
  return data as { settled?: boolean; already_settled?: boolean };
}

/** Executes one package item through the existing publishing engine. The
 * standing-authorization claim happens first; Shadow Mode exits before any
 * publishing job is created. */
export async function executeAuthorizedPackagePost(service: ServiceClient, queueItemId: string, scheduledAt = new Date().toISOString()) {
  const claim = await claimAuthorizedPackagePost(service, queueItemId);
  if (!claim.allowed || !claim.ownerId || !claim.accountId || !claim.variantId) return claim;
  if (claim.shadowMode) {
    await settleAuthorizedPackagePost(service, { queueItemId, outcome: "SHADOW_COMPLETED" });
    return { ...claim, published: false, shadow: true, text: "Shadow run complete. Nothing was published externally." };
  }
  try {
    const jobId = await scheduleJob(service as Parameters<typeof scheduleJob>[0], { accountId: claim.accountId, variantId: claim.variantId, scheduledAt, idempotencyKey: `package:${queueItemId}` });
    const result = await runPublishNow(service as Parameters<typeof runPublishNow>[0], jobId, scheduledAt, claim.ownerId);
    const published = result.jobStatus === "PUBLISHED" && result.mode !== "shadow";
    await settleAuthorizedPackagePost(service, { queueItemId, outcome: published ? "PUBLISHED" : "FAILED", publishingJobId: jobId, error: published ? undefined : result.lastError ?? result.outcomeNote });
    return { ...claim, published, jobId, result };
  } catch (error) {
    await settleAuthorizedPackagePost(service, { queueItemId, outcome: "FAILED", error: error instanceof Error ? error.message : "package publish failed" });
    throw error;
  }
}
