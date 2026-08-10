import { NextResponse, type NextRequest } from "next/server";
import { requireClientContext } from "@/lib/tenants/client-context";
import { isMemberOfTenant } from "@/lib/tenants/current-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  activatePackageAutopilot,
  setPackageAutopilotState,
  setPackageAutopilotScope,
  skipPackageQueueItem,
  reschedulePackageQueueItem,
  editPackageQueueItemContent,
  type PackageAuthorizationRow,
} from "@/lib/social/package-autopilot";

async function authorizeTenant(tenantId: string) {
  const ctx = await requireClientContext();
  if (!ctx.ok) return { ok: false as const, status: 401 as const, error: ctx.error };
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
    destinations: authorization.allowed_platforms.map((platform) => PLATFORM_LABEL[platform] ?? platform),
    upcoming,
    history: recentHistory,
  };
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  const auth = await authorizeTenant(tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const service = createSupabaseServiceClient();
  const { data: authorization } = await service.from("social_autopilot_authorizations").select("*").eq("tenant_id", tenantId).order("activated_at", { ascending: false }).limit(1).maybeSingle();
  if (!authorization) {
    // Not yet activated — resolve real activation eligibility so the client
    // never has to guess subscriptionId/entitlementId, and so a missing
    // prerequisite (Section 8) is reported precisely rather than as a
    // generic failure.
    const { data: subscription } = await service.from("subscriptions").select("id, status, current_period_end").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const subscriptionActive = Boolean(subscription) && subscription!.status === "active" && new Date(subscription!.current_period_end).getTime() > Date.now();
    const { data: entitlement } = subscription
      ? await service.from("usage_entitlements").select("id, is_paused, limit_amount, current_usage").eq("tenant_id", tenantId).eq("subscription_id", subscription.id).eq("metric", "social_posts").maybeSingle()
      : { data: null };
    const { data: connectedAccounts } = await service.from("social_accounts").select("platform").eq("tenant_id", tenantId).eq("status", "CONNECTED");
    const { data: brand } = await service.from("social_brand_profiles").select("id").limit(1).maybeSingle();
    return NextResponse.json({
      activated: false,
      eligibility: {
        subscriptionActive,
        subscriptionId: subscription?.id ?? null,
        entitlementId: entitlement?.id ?? null,
        entitlementAvailable: Boolean(entitlement) && !entitlement!.is_paused && entitlement!.current_usage < entitlement!.limit_amount,
        remainingUnits: entitlement ? Math.max(0, entitlement.limit_amount - entitlement.current_usage) : 0,
        connectedPlatforms: [...new Set((connectedAccounts ?? []).map((row) => String(row.platform).toLowerCase()))],
        brandConfigured: Boolean(brand),
      },
    });
  }

  const row = authorization as PackageAuthorizationRow;
  const [{ count: publishedCount }, { data: upcomingRows }, { data: historyRows }] = await Promise.all([
    service.from("social_autopilot_queue_items").select("id", { count: "exact", head: true }).eq("authorization_id", row.id).eq("period_number", row.period_number).eq("status", "PUBLISHED"),
    service
      .from("social_autopilot_queue_items")
      .select("id, package_sequence, scheduled_at, status, content_pillar, last_error, account_id, social_accounts(platform, display_name, username)")
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

  const upcoming = (upcomingRows ?? []).map((item) => ({
    id: item.id,
    sequence: item.package_sequence,
    scheduledAt: item.scheduled_at,
    status: item.status,
    contentPillar: item.content_pillar,
    blockedReason: item.status === "BLOCKED" ? item.last_error : null,
    platform: PLATFORM_LABEL[String((item.social_accounts as { platform?: string } | null)?.platform ?? "")] ?? null,
    accountLabel: (item.social_accounts as { display_name?: string; username?: string } | null)?.display_name || (item.social_accounts as { username?: string } | null)?.username || null,
  }));
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
      error: item.status === "FAILED" ? item.last_error : null,
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
        });
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
      case "skip": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const result = await skipPackageQueueItem(service as Parameters<typeof skipPackageQueueItem>[0], {
          queueItemId,
          reason: typeof body.reason === "string" ? body.reason : undefined,
        });
        return NextResponse.json({ ok: true, result });
      }
      case "reschedule": {
        const queueItemId = String(body.queueItemId ?? "");
        if (!(await verifyQueueItemTenant(service, queueItemId, tenantId))) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
        const result = await reschedulePackageQueueItem(service as Parameters<typeof reschedulePackageQueueItem>[0], {
          queueItemId,
          scheduledAt: String(body.scheduledAt ?? ""),
        });
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
        return NextResponse.json({ ok: true, result });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
