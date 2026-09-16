"use server";

import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { getAgencyTenant } from "@/lib/tenants/admin-repository";
import { publishNextCampaignItemInProduction } from "@/lib/social/instagram-campaign-runtime";

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
