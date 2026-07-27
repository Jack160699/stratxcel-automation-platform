"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { disconnectAccount } from "@/lib/social/repositories/accounts";
import { createCampaign } from "@/lib/social/repositories/campaigns";
import { createContentMaster, createContentVariant } from "@/lib/social/repositories/content";
import { scheduleJob, cancelJob } from "@/lib/social/repositories/publishing";
import { upsertAutomationSettings } from "@/lib/social/repositories/automation";
import { recordAudit } from "@/lib/social/repositories/system";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runWorkerBatch } from "@/lib/social/worker";

async function assertOwner() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function disconnectAccountAction(formData: FormData) {
  const ctx = await assertOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await disconnectAccount(ctx, id);
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "account.disconnect", targetType: "social_account", targetId: id, summary: "Disconnected a social account" });
  revalidatePath("/admin/social", "layout");
}

export async function setShadowModeAction(formData: FormData) {
  const ctx = await assertOwner();
  const shadowMode = String(formData.get("shadow_mode") ?? "true") === "true";
  await upsertAutomationSettings(ctx, { shadow_mode: shadowMode, dry_run: shadowMode });
  await recordAudit({
    actorType: "USER",
    actorId: ctx.ownerId,
    action: "settings.shadow_mode",
    summary: `Set shadow mode to ${shadowMode ? "ON" : "OFF (live publishing)"}`,
    meta: { shadow_mode: shadowMode },
  });
  revalidatePath("/admin/social", "layout");
}

export async function createCampaignAction(formData: FormData) {
  const ctx = await assertOwner();
  const name = String(formData.get("name") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  if (!name || !goal) return;
  await createCampaign(ctx, { name, goal, platforms: formData.getAll("platforms").map(String) });
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "campaign.create", summary: `Created campaign "${name}"` });
  revalidatePath("/admin/social", "layout");
}

/** Creates a content master idea plus its first platform variant in one step. */
export async function createContentItemAction(formData: FormData) {
  const ctx = await assertOwner();
  const title = String(formData.get("title") ?? "").trim();
  const masterIdea = String(formData.get("master_idea") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  if (!title || !masterIdea || !caption) return;

  const hashtags = String(formData.get("hashtags") ?? "")
    .split(/[,\s]+/)
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);
  const mediaUrls = String(formData.get("media_urls") ?? "")
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);

  const masterId = await createContentMaster(ctx, {
    campaignId: String(formData.get("campaign_id") ?? "") || null,
    title,
    masterIdea,
    objective: String(formData.get("objective") ?? "") || "awareness",
    contentPillar: String(formData.get("content_pillar") ?? "") || "educational",
  });

  await createContentVariant(ctx, {
    masterId,
    platform: String(formData.get("platform") ?? "instagram"),
    format: String(formData.get("format") ?? "post"),
    objective: String(formData.get("objective") ?? "") || "awareness",
    caption,
    hashtags,
    mediaUrls,
  });

  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "content.create", summary: `Created content "${title}"` });
  revalidatePath("/admin/social", "layout");
}

export async function schedulePostAction(formData: FormData) {
  const ctx = await assertOwner();
  const accountId = String(formData.get("account_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  if (!accountId || !variantId || !scheduledFor) return;

  const service = createSupabaseServiceClient();
  try {
    await scheduleJob(service, { accountId, variantId, scheduledAt: new Date(scheduledFor).toISOString() });
    await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "post.schedule", summary: `Scheduled a post for ${scheduledFor}` });
  } catch (err) {
    console.error("schedule insert failed:", err instanceof Error ? err.message : err);
  }
  revalidatePath("/admin/social", "layout");
}

export async function cancelScheduledPostAction(formData: FormData) {
  const ctx = await assertOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const service = createSupabaseServiceClient();
  await cancelJob(service, id);
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "post.cancel", targetId: id, summary: "Cancelled a scheduled post" });
  revalidatePath("/admin/social", "layout");
}

export async function runWorkerNowAction() {
  // Admin-gated server action that runs the SAME batch-claim logic as the
  // cron-triggered route, in-process. No HTTP round trip, no CRON_SECRET.
  const ctx = await assertOwner();
  try {
    const result = await runWorkerBatch();
    await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "worker.run", summary: `Worker batch processed ${result.processed} job(s)`, meta: { ...result } });
  } catch (err) {
    console.error("manual worker trigger failed:", err);
  }
  revalidatePath("/admin/social", "layout");
}
