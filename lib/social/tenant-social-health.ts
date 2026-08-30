import { createSupabaseServiceClient } from "../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL full-system closure brief, Section 9: real fix for a confirmed,
 * live production bug -- lib/social/health.ts's runHealthChecks was
 * DELIBERATELY designed to check the logged-in STAFF ADMIN's own identity
 * (lib/social/agent/tools.ts's own comment: "checks StratXcel-staff-
 * specific system health... not a per-tenant concept"), via
 * requireOwnerContext()'s ownerId = the current admin user's own auth.uid(),
 * never the tenant being viewed. That's a legitimate, intentional design
 * for the AI copilot's inspect_system_health tool.
 *
 * But app/admin/(shell)/social/system/page.tsx presents that SAME output
 * as if it described the selected "S Stratxcel" workspace (tenant-specific
 * "Backfill existing tenant content" button, "Image provider health
 * (StratXcel...)" section right above it) -- a real design mismatch.
 *
 * CONFIRMED LIVE (2026-08-30/31): the logged-in staff account
 * (shriyanshchandrakar@gmail.com) has its OWN real, unrelated
 * social_accounts rows under a completely different real tenant_id
 * (872723d5-0c21-4638-8921-99213c4ed63a) -- facebook/threads CONNECTED,
 * youtube DISCONNECTED. The admin page's "social:*"/"workers:publishing"/
 * "publishing_mode" rows were showing THAT data, not StratXcel's. Worse:
 * StratXcel's REAL social_automation_settings.shadow_mode is `false`
 * (LIVE/AUTOPILOT) -- the widget showed "SHADOW — publishing paused",
 * the OPPOSITE of the real state. A staff member trusting that widget
 * could believe a real action (e.g. Backfill) was shadow-safe when
 * StratXcel is actually live.
 *
 * This module is the real fix: genuinely tenant_id-scoped, resolving the
 * tenant's real owner_id from social_accounts itself (social_accounts is
 * the only real source of truth linking tenant_id -> owner_id in this
 * codebase; social_automation_settings has no tenant_id column of its
 * own) rather than a second hardcoded constant that could drift from the
 * first.
 */
export interface TenantSocialHealthResult {
  connectedPlatforms: Array<{ platform: string; status: string; tokenHealth: string }>;
  /** null when no real owner_id could be resolved for this tenant (no connected accounts yet) -- never guessed. */
  publishingMode: { shadowMode: boolean | null; autonomyLevel: string | null };
  jobCounts: { scheduled: number; running: number; failed: number; published: number };
  webhookEventCount: number;
}

export async function assessTenantSocialHealth(service: ServiceClient, tenantId: string): Promise<TenantSocialHealthResult> {
  const { data: accounts } = await service
    .from("social_accounts")
    .select("id, owner_id, platform, status, token_health")
    .eq("tenant_id", tenantId);
  const rows = accounts ?? [];
  const accountIds = rows.map((a) => a.id as string);
  const ownerId = (rows[0]?.owner_id as string | undefined) ?? null;

  const [{ data: jobs }, settingsResult, webhookResult] = await Promise.all([
    accountIds.length
      ? service.from("social_publishing_jobs").select("status").in("account_id", accountIds)
      : Promise.resolve({ data: [] as Array<{ status: string }> }),
    ownerId
      ? service.from("social_automation_settings").select("shadow_mode, autonomy_level").eq("owner_id", ownerId).maybeSingle()
      : Promise.resolve({ data: null }),
    accountIds.length
      ? service.from("social_webhook_events").select("id", { count: "exact", head: true }).in("account_id", accountIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const counts = (jobs ?? []).reduce<Record<string, number>>((acc, j) => {
    const status = j.status as string;
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    connectedPlatforms: rows.map((a) => ({ platform: a.platform as string, status: a.status as string, tokenHealth: a.token_health as string })),
    publishingMode: {
      shadowMode: (settingsResult.data as { shadow_mode?: boolean } | null)?.shadow_mode ?? null,
      autonomyLevel: (settingsResult.data as { autonomy_level?: string } | null)?.autonomy_level ?? null,
    },
    jobCounts: {
      scheduled: counts.SCHEDULED ?? 0,
      running: counts.RUNNING ?? 0,
      failed: counts.FAILED ?? 0,
      published: counts.PUBLISHED ?? 0,
    },
    webhookEventCount: ("count" in webhookResult ? webhookResult.count : null) ?? 0,
  };
}
