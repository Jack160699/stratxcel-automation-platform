import { after, NextResponse, type NextRequest } from "next/server";
import { requireClientContext } from "@/lib/tenants/client-context";
import { isMemberOfTenant } from "@/lib/tenants/current-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  activatePackageAutopilot,
  setPackageAutopilotState,
  setPackageAutopilotScope,
  skipPackageQueueItem,
  approvePackageQueueItem,
  setPackageAutopilotPublishingMode,
  reschedulePackageQueueItemInTimezone,
  editPackageQueueItemContent,
  assignBrandProfileToTenant,
  assignSocialAccountToTenant,
  listAssignablePackageResources,
  getPackageQueueItemPreview,
  resolvePurchasedPackageComposition,
  formatPackageCompositionLabel,
  utcIsoToDatetimeLocalValue,
  planPackagePeriod,
  prepareNearTermPackageItems,
  runPackageAutopilotBatch,
  type PackageAuthorizationRow,
} from "@/lib/social/package-autopilot";
import { packageErrorForClient } from "@/lib/social/package-errors";
import { recordAudit } from "@/lib/social/repositories/system";
import { hasCapability, isPlanTier } from "@stratxcel/payments-and-wallet";

/**
 * Hermes-Orchestrated Content Engine Hardening mission, Section 1: real gap
 * found live -- activatePackageAutopilot / setPackageAutopilotState(ACTIVE)
 * only ever wrote the authorization row. The very next content this tenant
 * would see was whatever the hourly package-producer cron happened to plan
 * + prepare (Gemini) on its own schedule -- up to ~59 minutes of dead air
 * after a customer just activated (or resumed) Social Autopilot, not the
 * "instantly have day-one content" this mission requires. planPackagePeriod
 * and prepareNearTermPackageItems are both explicitly documented as
 * idempotent/safe to call repeatedly (see their own doc comments in
 * package-autopilot.ts) -- calling them here, in the background via
 * after() so the activate/resume response itself stays fast, and again
 * later by the regular cron, can never double-plan or double-prepare
 * anything. authorization.preparation_horizon_days defaults to 5 (real
 * schema default), so this single call already covers day-one AND day-two
 * (and beyond) the moment activation succeeds -- no separate "day 0 vs day
 * 1" special-casing needed.
 */
function triggerImmediatePackagePreparation(service: ReturnType<typeof createSupabaseServiceClient>, authorizationId: string) {
  after(async () => {
    try {
      await planPackagePeriod(service as Parameters<typeof planPackagePeriod>[0], authorizationId);
      await prepareNearTermPackageItems(service as Parameters<typeof prepareNearTermPackageItems>[0], authorizationId);
    } catch (err) {
      console.error("triggerImmediatePackagePreparation: background plan+prepare failed", {
        authorizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

async function authorizeTenant(tenantId: string, allowStaffRead = false) {
  const ctx = await requireClientContext();
  if (!ctx.ok) return { ok: false as const, status: 401 as const, error: ctx.error };
  if (ctx.accessMode === "staff_support") {
    if (!allowStaffRead || ctx.workspaceTenant.tenantId !== tenantId) {
      return { ok: false as const, status: 403 as const, error: "Staff support mode is read-only" };
    }
    return { ok: true as const, userId: ctx.userId };
  }
  const isMember = await isMemberOfTenant(ctx.supabase, ctx.userId, tenantId);
  if (!isMember) return { ok: false as const, status: 403 as const, error: "Not a member of this client" };
  return { ok: true as const, userId: ctx.userId };
}

/** Client A must never be able to skip/reschedule/edit Client B's queue item just by guessing its id (Section 97). */
async function verifyQueueItemTenant(service: ReturnType<typeof createSupabaseServiceClient>, queueItemId: string, tenantId: string): Promise<boolean> {
  const { data } = await service.from("social_autopilot_queue_items").select("id").eq("id", queueItemId).eq("tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}

const PLATFORM_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", threads: "Threads", linkedin: "LinkedIn", youtube: "YouTube" };
const STATE_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  NEEDS_ATTENTION: "Needs attention",
};

function overviewFromAuthorization(authorization: PackageAuthorizationRow, publishedCount: number, upcoming: unknown[], recentHistory: unknown[]) {
  return {
    authorizationId: authorization.id,
    state: authorization.state,
    stateLabel: STATE_LABEL[authorization.state] ?? authorization.state,
    publishingMode: authorization.publishing_mode,
    packageSize: authorization.period_target_units,
    published: publishedCount,
    remaining: Math.max(0, authorization.period_target_units - publishedCount),
    periodStart: authorization.starts_at,
    periodEnd: authorization.ends_at,
    timezone: authorization.timezone,
    compositionLabel: formatPackageCompositionLabel(authorization.package_composition.items),
    destinations: authorization.allowed_platforms.map((platform) => PLATFORM_LABEL[platform] ?? platform),
    upcoming,
    history: recentHistory,
  };
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  const auth = await authorizeTenant(tenantId, true);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const service = createSupabaseServiceClient();
  const { data: authorization } = await service.from("social_autopilot_authorizations").select("*").eq("tenant_id", tenantId).order("activated_at", { ascending: false }).limit(1).maybeSingle();
  if (!authorization) {
    const { data: subscription } = await service.from("subscriptions").select("id, status, current_period_end, plan_tier").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const subscriptionActive = Boolean(subscription) && subscription!.status === "active" && new Date(subscription!.current_period_end).getTime() > Date.now();
    const { data: entitlement } = subscription
      ? await service.from("usage_entitlements").select("id, is_paused, limit_amount, current_usage").eq("tenant_id", tenantId).eq("subscription_id", subscription.id).eq("metric", "social_posts").maybeSingle()
      : { data: null };
    const { data: connectedAccounts } = await service.from("social_accounts").select("platform").eq("tenant_id", tenantId).eq("status", "CONNECTED");
    const { data: brands } = await service.from("social_brand_profiles").select("id").eq("tenant_id", tenantId).limit(2);
    const connectedPlatforms = [...new Set((connectedAccounts ?? []).map((row) => String(row.platform).toLowerCase()))];
    // Real gap found live (Debug Missing UI Toggle mission): the response
    // never told the client whether the tenant's PLAN even includes Social
    // Autopilot at all (a Growth+ capability -- Starter never gets it,
    // regardless of brand/connector setup, per activatePackageAutopilot's
    // own hasCapability check). Every not-yet-activated tenant, Starter or
    // Growth+, got the identical "Set up Autopilot" prompt -- misleading
    // for Starter tenants, who can never actually complete that setup.
    const planTier = isPlanTier(subscription?.plan_tier) ? subscription!.plan_tier : null;
    const planEligible = Boolean(planTier) && hasCapability(planTier!, "social_autopilot");
    const composition = resolvePurchasedPackageComposition({
      planTier: typeof subscription?.plan_tier === "string" ? subscription.plan_tier : null,
      allowedPlatforms: connectedPlatforms.length ? connectedPlatforms : ["instagram"],
      publishingMode: "AUTO_PUBLISH",
      entitlementLimit: entitlement?.limit_amount,
    });
    const assignmentRaw = await listAssignablePackageResources(service as Parameters<typeof listAssignablePackageResources>[0], {
      tenantId,
      actorUserId: auth.userId,
    });
    const assignment = {
      brand: {
        available: assignmentRaw.brand.available,
        label: assignmentRaw.brand.label,
        alreadyBound: assignmentRaw.brand.alreadyBound,
      },
      accounts: assignmentRaw.accounts.map((account) => ({
        platform: account.platform,
        platformLabel: PLATFORM_LABEL[account.platform] ?? account.platform,
        label: account.label,
        available: account.available,
        alreadyBound: account.alreadyBound,
      })),
    };
    return NextResponse.json({
      activated: false,
      eligibility: {
        subscriptionActive,
        planEligible,
        subscriptionId: subscription?.id ?? null,
        entitlementId: entitlement?.id ?? null,
        entitlementAvailable: Boolean(entitlement) && !entitlement!.is_paused && entitlement!.current_usage < entitlement!.limit_amount,
        remainingUnits: entitlement ? Math.max(0, entitlement.limit_amount - entitlement.current_usage) : 0,
        connectedPlatforms,
        brandConfigured: (brands ?? []).length === 1,
        brandProfileId: (brands ?? []).length === 1 ? brands![0].id : null,
        packageConfigured: Boolean(composition),
        compositionLabel: composition ? formatPackageCompositionLabel(composition.items) : null,
        compositionItems: composition?.items ?? null,
        assignment,
      },
    });
  }

  const row = authorization as PackageAuthorizationRow;
  const [{ count: publishedCount }, { data: upcomingRows }, { data: historyRows }] = await Promise.all([
    service.from("social_autopilot_queue_items").select("id", { count: "exact", head: true }).eq("authorization_id", row.id).eq("period_number", row.period_number).eq("status", "PUBLISHED"),
    service
      .from("social_autopilot_queue_items")
      .select("id, package_sequence, scheduled_at, status, content_pillar, last_error, account_id, variant_id, social_accounts(platform, display_name, username), content_variants(caption, hashtags, creative_spec)")
      .eq("authorization_id", row.id)
      .eq("period_number", row.period_number)
      .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED", "BLOCKED"])
      .order("scheduled_at", { ascending: true })
      .limit(10),
    service
      .from("social_autopilot_queue_items")
      .select("id, package_sequence, scheduled_at, status, last_error, publishing_job_id, account_id, social_accounts(platform, display_name, username), social_publishing_jobs(result)")
      .eq("authorization_id", row.id)
      .in("status", ["PUBLISHED", "FAILED", "SKIPPED", "SHADOW_COMPLETED"])
      .order("settled_at", { ascending: false })
      .limit(10),
  ]);

  const upcoming = (upcomingRows ?? []).map((item) => {
    // creative_spec is populated by prepareNearTermPackageItems (Section 9/B
    // of the quality campaign) with the concept + real quality score this
    // post actually passed at -- surfaced here so the dashboard reads as a
    // content studio with a visible quality state, not a bare AI form.
    // Never present for content prepared before that change; qualityScore
    // stays null rather than a fabricated number.
    const creativeSpec = (item.content_variants as { creative_spec?: Record<string, unknown> } | null)?.creative_spec ?? {};
    const qualityScore = typeof creativeSpec.qualityScore === "number" ? creativeSpec.qualityScore : null;
    const concept = typeof creativeSpec.concept === "string" ? creativeSpec.concept : null;
    return {
      id: item.id,
      sequence: item.package_sequence,
      scheduledAt: item.scheduled_at,
      scheduledWall: utcIsoToDatetimeLocalValue(item.scheduled_at, row.timezone),
      status: item.status,
      contentPillar: item.content_pillar,
      concept,
      qualityScore,
      blockedReason: item.status === "BLOCKED" && item.last_error ? packageErrorForClient(item.last_error) : null,
      platform: PLATFORM_LABEL[String((item.social_accounts as { platform?: string } | null)?.platform ?? "")] ?? null,
      accountLabel: (item.social_accounts as { display_name?: string; username?: string } | null)?.display_name || (item.social_accounts as { username?: string } | null)?.username || null,
      caption: (item.content_variants as { caption?: string } | null)?.caption ?? "",
      hashtags: (item.content_variants as { hashtags?: string[] } | null)?.hashtags ?? [],
    };
  });
  const history = (historyRows ?? []).map((item) => {
    const jobResult = Array.isArray(item.social_publishing_jobs)
      ? (item.social_publishing_jobs[0] as { result?: unknown } | undefined)?.result
      : (item.social_publishing_jobs as { result?: unknown } | null)?.result;
    const permalink = jobResult && typeof jobResult === "object" && typeof (jobResult as Record<string, unknown>).permalink === "string"
      ? ((jobResult as Record<string, unknown>).permalink as string)
      : null;
    return {
      id: item.id,
      sequence: item.package_sequence,
      status: item.status,
      platform: PLATFORM_LABEL[String((item.social_accounts as { platform?: string } | null)?.platform ?? "")] ?? null,
      accountLabel: (item.social_accounts as { display_name?: string; username?: string } | null)?.display_name || (item.social_accounts as { username?: string } | null)?.username || null,
      permalink,
      error: item.status === "FAILED" && item.last_error ? packageErrorForClient(item.last_error) : null,
    };
  });

  return NextResponse.json({ activated: true, ...overviewFromAuthorization(row, publishedCount ?? 0, upcoming, history) });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  const auth = await authorizeTenant(tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const service = createSupabaseServiceClient();
  try {
    switch (body.action) {
      case "activate": {
        const authorization = await activatePackageAutopilot(service as Parameters<typeof activatePackageAutopilot>[0], {
          tenantId,
          clientUserId: auth.userId,
          subscriptionId: String(body.subscriptionId ?? ""),
          entitlementId: String(body.entitlementId ?? ""),
          publishingMode: body.publishingMode === "REVIEW_BEFORE_PUBLISH" ? "REVIEW_BEFORE_PUBLISH" : "AUTO_PUBLISH",
          allowedPlatforms: Array.isArray(body.allowedPlatforms) ? body.allowedPlatforms.map(String) : [],
          timezone: typeof body.timezone === "string" ? body.timezone : undefined,
          maxPostsPerDay: typeof body.maxPostsPerDay === "number" ? body.maxPostsPerDay : undefined,
          brandProfileId: String(body.brandProfileId ?? ""),
        });
        // Section 1: instant day-one (+ day-two, via the real 5-day default
        // horizon) content preparation on activation, instead of waiting up
        // to ~59 minutes for the next hourly package-producer cron tick.
        triggerImmediatePackagePreparation(service, authorization.id);
        return NextResponse.json({ ok: true, authorization });
      }
      case "pause":
      case "resume":
      case "cancel": {
        const state = body.action === "pause" ? "PAUSED" : body.action === "resume" ? "ACTIVE" : "CANCELLED";
        const result = await setPackageAutopilotState(service as Parameters<typeof setPackageAutopilotState>[0], {
          authorizationId: String(body.authorizationId ?? ""),
          tenantId,
          clientUserId: auth.userId,
          state,
        });
        // A resumed authorization needs its queue refilled just as urgently
        // as a freshly-activated one -- same instant-preparation trigger,
        // never on pause/cancel.
        if (body.action === "resume") triggerImmediatePackagePreparation(service, String(body.authorizationId ?? ""));
        return NextResponse.json({ ok: true, result });
      }
      case "approve": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const publishNow = body.publishNow === true;
        const result = await approvePackageQueueItem(service as Parameters<typeof approvePackageQueueItem>[0], { queueItemId, publishNow });
        await recordAudit({ actorType: "USER", actorId: auth.userId, action: "social.package.approve", targetType: "social_autopilot_queue_item", targetId: queueItemId, summary: publishNow ? "Approved a reviewed post and requested immediate publish" : "Approved a reviewed post for its scheduled time", meta: { tenantId, publishNow } });
        // Section 3 ("on command"): don't make the customer wait for the
        // next 15-minute worker cron tick when they explicitly asked for
        // immediate publish -- same in-process pattern the admin "Run
        // worker now" action and the Copilot "post now" tool already use,
        // just scoped to the package batch executor.
        if (publishNow) {
          after(() => runPackageAutopilotBatch(service as Parameters<typeof runPackageAutopilotBatch>[0]).catch(() => {}));
        }
        return NextResponse.json({ ok: true, result });
      }
      case "updatePublishingMode": {
        const publishingMode = body.publishingMode === "REVIEW_BEFORE_PUBLISH"
          ? "REVIEW_BEFORE_PUBLISH"
          : body.publishingMode === "AUTO_PUBLISH"
            ? "AUTO_PUBLISH"
            : null;
        if (!publishingMode) return NextResponse.json({ error: "publishingMode must be AUTO_PUBLISH or REVIEW_BEFORE_PUBLISH" }, { status: 400 });
        const result = await setPackageAutopilotPublishingMode(service as Parameters<typeof setPackageAutopilotPublishingMode>[0], {
          authorizationId: String(body.authorizationId ?? ""),
          tenantId,
          clientUserId: auth.userId,
          publishingMode,
        });
        return NextResponse.json({ ok: true, result });
      }
      case "updateScope": {
        const result = await setPackageAutopilotScope(service as Parameters<typeof setPackageAutopilotScope>[0], {
          authorizationId: String(body.authorizationId ?? ""),
          tenantId,
          clientUserId: auth.userId,
          allowedPlatforms: Array.isArray(body.allowedPlatforms) ? body.allowedPlatforms.map(String) : [],
        });
        return NextResponse.json({ ok: true, result });
      }
      case "assignBrand": {
        const result = await assignBrandProfileToTenant(service as Parameters<typeof assignBrandProfileToTenant>[0], {
          tenantId,
          actorUserId: auth.userId,
        });
        return NextResponse.json({ ok: true, result });
      }
      case "assignAccount": {
        const platform = typeof body.platform === "string" ? body.platform : "";
        if (!platform) return NextResponse.json({ error: "platform is required" }, { status: 400 });
        const result = await assignSocialAccountToTenant(service as Parameters<typeof assignSocialAccountToTenant>[0], {
          tenantId,
          actorUserId: auth.userId,
          platform,
        });
        return NextResponse.json({ ok: true, result });
      }
      case "skip": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const result = await skipPackageQueueItem(service as Parameters<typeof skipPackageQueueItem>[0], {
          queueItemId,
          reason: typeof body.reason === "string" ? body.reason : undefined,
        });
        await recordAudit({ actorType: "USER", actorId: auth.userId, action: "social.package.skip", targetType: "social_autopilot_queue_item", targetId: queueItemId, summary: "Skipped an upcoming package post", meta: { tenantId } });
        return NextResponse.json({ ok: true, result });
      }
      case "preview": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const preview = await getPackageQueueItemPreview(service as Parameters<typeof getPackageQueueItemPreview>[0], { queueItemId, tenantId });
        if (!preview) return NextResponse.json({ error: "Preview is not available until this post is prepared." }, { status: 404 });
        return NextResponse.json({ ok: true, preview });
      }
      case "reschedule": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const scheduledWall = typeof body.scheduledWall === "string" ? body.scheduledWall : "";
        if (!scheduledWall) return NextResponse.json({ error: "scheduledWall is required" }, { status: 400 });
        const result = await reschedulePackageQueueItemInTimezone(service as Parameters<typeof reschedulePackageQueueItemInTimezone>[0], {
          queueItemId,
          tenantId,
          scheduledWall,
        });
        await recordAudit({ actorType: "USER", actorId: auth.userId, action: "social.package.reschedule", targetType: "social_autopilot_queue_item", targetId: queueItemId, summary: "Rescheduled an upcoming package post", meta: { tenantId, scheduledWall, scheduledAt: result.scheduled_at } });
        return NextResponse.json({ ok: true, result });
      }
      case "edit": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const result = await editPackageQueueItemContent(service as Parameters<typeof editPackageQueueItemContent>[0], {
          queueItemId,
          caption: typeof body.caption === "string" ? body.caption : undefined,
          hashtags: Array.isArray(body.hashtags) ? body.hashtags.map(String) : undefined,
        });
        await recordAudit({ actorType: "USER", actorId: auth.userId, action: "social.package.edit", targetType: "social_autopilot_queue_item", targetId: queueItemId, summary: "Edited an upcoming package post", meta: { tenantId } });
        return NextResponse.json({ ok: true, result });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: packageErrorForClient(error) }, { status: 400 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The route itself responds fast (triggerImmediatePackagePreparation and
// the "approve publishNow" batch trigger both run via after(), not before
// the response), but Vercel still bounds the WHOLE invocation -- including
// after() work -- by maxDuration. Both background paths can make real
// Gemini calls (prepareNearTermPackageItems) or reach real social-platform
// publish APIs (runPackageAutopilotBatch), so this needs the same 300s
// budget this codebase already uses everywhere else for long AI/publish
// chains (see app/api/platform/image-generations/route.ts's own comment) --
// not the platform default, which was exactly the root cause of the real,
// previously-fixed "The provider timed out" production incidents.
export const maxDuration = 300;
