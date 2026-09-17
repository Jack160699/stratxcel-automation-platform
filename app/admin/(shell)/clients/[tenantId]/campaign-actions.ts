"use server";

import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { getAgencyTenant } from "@/lib/tenants/admin-repository";
import { publishNextCampaignItemInProduction } from "@/lib/social/instagram-campaign-runtime";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runWorkerBatch } from "@/lib/social/worker";
import { recordAudit } from "@/lib/social/repositories/system";

/**
 * Staff-only: publish exactly ONE eligible item of a client's Instagram
 * campaign, through the paced publisher's full check sequence. One post per
 * submit keeps publishing deliberate -- publish, confirm, record, continue.
 */
export async function publishNextCampaignItemAction(tenantId: string, campaignId: string): Promise<never> {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) redirect("/admin");
  if (!(await getAgencyTenant(tenantId))) redirect("/admin/clients?error=TENANT_NOT_FOUND");

  let query: URLSearchParams;
  try {
    const step = await publishNextCampaignItemInProduction({ tenantId, campaignId, actorUserId: ctx.ownerId });
    query = new URLSearchParams({ campaign: campaignId, publishOutcome: step.outcome });
    if (step.assetName) query.set("asset", step.assetName);
    if (step.mediaId) query.set("mediaId", step.mediaId);
    if (step.quota) query.set("quota", `${step.quota.usage}/${step.quota.total}`);
    if (step.message) query.set("message", step.message.slice(0, 240));
  } catch (err) {
    query = new URLSearchParams({ campaign: campaignId, publishOutcome: "error", message: (err instanceof Error ? err.message : "Unknown error").slice(0, 240) });
  }
  redirect(`/admin/clients/${tenantId}?${query.toString()}`);
}

/**
 * Staff-only: runs the SAME canonical worker batch the Vercel Cron route and
 * the admin "Run worker now" button already use (lib/social/worker.ts
 * runWorkerBatch, unmodified), but scoped to one named client tenant instead
 * of the clicking staff member's own owner_id. That distinction matters:
 * "Run worker now" resolves ownerId from the logged-in admin's own session,
 * so a staff member viewing a client in support mode never accidentally
 * processes that client's jobs with it -- there was no existing entry point
 * to run a specific tenant's due jobs from an admin session. This adds one,
 * gated exactly like publishNextCampaignItemAction above: verified staff
 * session + a real agency tenant. It claims only that tenant owner's own due
 * SCHEDULED jobs (claimDueJobs' existing ownerId filter) and runs them
 * through the exact same processJob path (shadow-mode gate, caption
 * validation, token refresh, provider call, verification).
 */
export async function runTenantWorkerNowAction(tenantId: string): Promise<never> {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) redirect("/admin");
  if (!(await getAgencyTenant(tenantId))) redirect("/admin/clients?error=TENANT_NOT_FOUND");

  const service = createSupabaseServiceClient();
  let query: URLSearchParams;
  try {
    const { data: account, error } = await service
      .from("social_accounts")
      .select("owner_id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to resolve the tenant's owner: ${error.message}`);
    if (!account) throw new Error("This tenant has no connected account, so it has no owner to run jobs for.");

    const result = await runWorkerBatch({ ownerId: account.owner_id as string });
    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action: "social.worker.run_for_tenant",
      targetType: "tenant",
      targetId: tenantId,
      summary: `Ran the publishing worker for this tenant's own owner: ${result.processed} job(s) claimed`,
      meta: { tenant_id: tenantId, worker_id: result.workerId, results: result.results },
    });
    query = new URLSearchParams({ workerOutcome: "ran", processed: String(result.processed) });
    if (result.results[0]) query.set("firstResult", `${result.results[0].jobId}:${result.results[0].outcome}`);
  } catch (err) {
    query = new URLSearchParams({ workerOutcome: "error", message: (err instanceof Error ? err.message : "Unknown error").slice(0, 240) });
  }
  redirect(`/admin/clients/${tenantId}?${query.toString()}`);
}
