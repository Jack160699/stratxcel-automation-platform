"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { disconnectAccount } from "@/lib/social/repositories/accounts";
import { createCampaign } from "@/lib/social/repositories/campaigns";
import { createContentMaster, createContentVariant } from "@/lib/social/repositories/content";
import { getBrandProfile } from "@/lib/social/repositories/brand";
import { scheduleJob, cancelJob } from "@/lib/social/repositories/publishing";
import { upsertAutomationSettings } from "@/lib/social/repositories/automation";
import { recordAudit } from "@/lib/social/repositories/system";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runWorkerBatch } from "@/lib/social/worker";
import { planPackagePeriod, prepareNearTermPackageItems, packageKillSwitchActive, runPackageAutopilotBatch } from "@/lib/social/package-autopilot";
import { normalizeYouTubePrivacyStatus } from "@/lib/social/providers/youtube-visibility";
import { attachMediaToMaster, attachMediaToVariant } from "@/lib/social/repositories/media-assets";
import {
  ContentDraftValidationError,
  parseCreateContentDraft,
} from "@/lib/social/content-options";

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
  try {
    await upsertAutomationSettings(ctx, { shadow_mode: shadowMode, dry_run: shadowMode });
    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action: "settings.shadow_mode",
      summary: `Set shadow mode to ${shadowMode ? "ON" : "OFF (live publishing)"}`,
      meta: { shadow_mode: shadowMode },
    });
    revalidatePath("/admin/social", "layout");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save publishing mode";
    redirect(`/admin/social/settings?status=error&message=${encodeURIComponent(message)}`);
  }
  redirect(`/admin/social/settings?status=saved&message=${shadowMode ? "Shadow+mode+enabled" : "Live+publishing+enabled"}`);
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

export interface CreateContentFormState {
  status: "idle" | "success" | "error";
  message: string;
}

/** Creates a content master idea plus its first platform variant in one step. */
export async function createContentItemAction(
  _previousState: CreateContentFormState,
  formData: FormData
): Promise<CreateContentFormState> {
  const owner = await requireOwnerContext();
  if (!owner.ok) {
    return {
      status: "error",
      message: owner.status === 401 ? "Please sign in again." : "You are not authorized to create content.",
    };
  }

  try {
    const profile = await getBrandProfile(owner);
    const input = parseCreateContentDraft(
      formData,
      profile.content_pillars.map((pillar) => pillar.name)
    );
    const mediaAssetIds = String(formData.get("media_asset_ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (input.campaignId) {
      const { data: campaign, error } = await owner.supabase
        .from("social_campaigns")
        .select("id")
        .eq("id", input.campaignId)
        .maybeSingle();
      if (error) throw new Error("Could not validate the selected campaign.");
      if (!campaign) throw new ContentDraftValidationError("Choose a campaign available to this account.");
    }

    const masterId = await createContentMaster(owner, {
      campaignId: input.campaignId,
      title: input.title,
      masterIdea: input.masterIdea,
      objective: input.objective,
      contentPillar: input.contentPillar,
    });

    try {
      const variant = await createContentVariant(owner, {
        masterId,
        platform: input.platform,
        format: input.format,
        objective: input.objective,
        caption: input.caption,
        hashtags: input.hashtags,
        mediaUrls: input.mediaUrls,
        creativeSpec:
          input.platform === "youtube"
            ? { youtube_privacy_status: normalizeYouTubePrivacyStatus(input.youtubePrivacyStatus) }
            : {},
      });
      if (mediaAssetIds.length) {
        await attachMediaToMaster(owner, masterId, mediaAssetIds, true);
        await attachMediaToVariant(owner, variant.id, mediaAssetIds, true);
      }
    } catch (error) {
      await owner.supabase.from("content_master").delete().eq("id", masterId);
      throw error;
    }

    await recordAudit({
      actorType: "USER",
      actorId: owner.ownerId,
      action: "content.create",
      summary: `Created content "${input.title}"`,
    });
    revalidatePath("/admin/social", "layout");
    return { status: "success", message: `Saved "${input.title}" as a ${input.platform} draft.` };
  } catch (error) {
    if (error instanceof ContentDraftValidationError) {
      return { status: "error", message: error.message };
    }
    console.error("content create failed:", error instanceof Error ? error.message : "Unknown error");
    return { status: "error", message: "Could not save this draft. Please review the fields and try again." };
  }
}

export async function schedulePostAction(formData: FormData) {
  const ctx = await assertOwner();
  const accountId = String(formData.get("account_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  if (!accountId || !variantId || !scheduledFor) return;

  const service = createSupabaseServiceClient();
  try {
    const [{ data: account }, { data: variant }] = await Promise.all([
      ctx.supabase.from("social_accounts").select("id, platform").eq("id", accountId).maybeSingle(),
      ctx.supabase.from("content_variants").select("id, platform").eq("id", variantId).maybeSingle(),
    ]);
    if (!account || !variant) throw new Error("Account or content variant is not available to this owner");
    if (account.platform !== variant.platform) {
      throw new Error(`The ${variant.platform} variant must use a ${variant.platform} account`);
    }
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
  const { data: ownedJob } = await ctx.supabase
    .from("social_publishing_jobs")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!ownedJob) return;
  const service = createSupabaseServiceClient();
  await cancelJob(service, id);
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "post.cancel", targetId: id, summary: "Cancelled a scheduled post" });
  revalidatePath("/admin/social", "layout");
}

export async function runWorkerNowAction() {
  // Admin-gated server action that runs the SAME batch-claim logic as the
  // cron-triggered route, in-process. No HTTP round trip, no CRON_SECRET.
  //
  // Real gap found live (Force Publish Now mission): this only ever called
  // runWorkerBatch (the generic publishing-job worker), never
  // runPackageAutopilotBatch -- even though the actual cron route this
  // button's own doc comment claims to mirror (/api/social/worker)
  // genuinely runs both on every tick. A Package Autopilot queue item due
  // for publish is claimed and settled entirely inside
  // runPackageAutopilotBatch (claim_social_package_post -> settle_social_
  // package_post); runWorkerBatch alone only advances the underlying
  // social_publishing_jobs row it doesn't own, so clicking this button did
  // nothing for a due package item -- confirmed live: a real PREPARED
  // package item, due now, was untouched by a real click before this fix.
  const ctx = await assertOwner();
  try {
    const result = await runWorkerBatch({ ownerId: ctx.ownerId });
    const packageResult = await runPackageAutopilotBatch(createSupabaseServiceClient() as Parameters<typeof runPackageAutopilotBatch>[0]).catch((err) => ({
      processed: 0,
      error: err instanceof Error ? err.message : "package batch failed",
    }));
    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action: "worker.run",
      summary: `Worker batch processed ${result.processed} job(s); package autopilot processed ${packageResult.processed}`,
      meta: { ...result, packageAutopilot: packageResult },
    });
  } catch (err) {
    console.error("manual worker trigger failed:", err);
  }
  revalidatePath("/admin/social", "layout");
}

/**
 * Retroactive Tenant Backfill mission: existing tenants whose Social
 * Autopilot was activated (or last resumed) BEFORE the "instant day-one
 * content" hardening (app/api/platform/social/autopilot/route.ts's
 * triggerImmediatePackagePreparation, only called from activate/resume)
 * never received that on-activation plan+prepare call -- their queue only
 * ever filled via whatever the hourly package-producer cron happened to
 * already do. This runs the SAME two idempotent, production-proven
 * functions the live activate/resume endpoints call for EVERY real
 * ACTIVE/NEEDS_ATTENTION authorization -- exactly like runWorkerNowAction
 * above wraps runWorkerBatch, so it inherits real Next.js module
 * resolution (no standalone-script import-graph issues) and this app's
 * existing admin-action security/audit model.
 *
 * A standalone equivalent lives at scripts/backfill-existing-tenant-
 * content.ts for read-only dry-run reporting; this server action is the
 * verified, real execution path -- see that script's own header comment
 * for why it can only run as a dry run outside this app's Next.js runtime.
 *
 * Never aborts the whole run for one tenant's failure -- caught, logged,
 * counted, continues -- and refuses to do any real work at all if the
 * package-autopilot kill switch is active (fail closed), exactly like
 * runPackageAutopilotBatch itself already does.
 */
export async function runTenantContentBackfillAction() {
  const ctx = await assertOwner();
  const service = createSupabaseServiceClient();
  try {
    const kill = await packageKillSwitchActive(service as Parameters<typeof packageKillSwitchActive>[0]);
    if (kill.active) {
      console.error(`Retroactive tenant content backfill refused: package autopilot kill switch is active (scope=${kill.scope ?? "unknown"}, reason=${kill.reason ?? "none given"}).`);
      revalidatePath("/admin/social", "layout");
      return;
    }

    const { data: authorizations, error } = await service
      .from("social_autopilot_authorizations")
      .select("id, tenant_id")
      .in("state", ["ACTIVE", "NEEDS_ATTENTION"]);
    if (error) throw new Error(`Could not query social_autopilot_authorizations: ${error.message}`);

    let planned = 0;
    let prepared = 0;
    let blocked = 0;
    let failures = 0;
    for (const auth of authorizations ?? []) {
      try {
        const planResult = await planPackagePeriod(service as Parameters<typeof planPackagePeriod>[0], auth.id);
        const prepareResult = await prepareNearTermPackageItems(service as Parameters<typeof prepareNearTermPackageItems>[0], auth.id);
        planned += planResult.planned;
        prepared += prepareResult.prepared;
        blocked += prepareResult.blocked;
      } catch (err) {
        failures++;
        console.error(`Retroactive backfill failed for authorization ${auth.id} (tenant ${auth.tenant_id}):`, err instanceof Error ? err.message : err);
      }
    }

    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action: "social.package.retroactive_backfill",
      summary: `Retroactive tenant content backfill: ${(authorizations ?? []).length} authorization(s) scanned, planned=${planned}, prepared=${prepared}, blocked=${blocked}, failures=${failures}`,
      meta: { authorizationCount: (authorizations ?? []).length, planned, prepared, blocked, failures },
    });
  } catch (err) {
    console.error("Retroactive tenant content backfill failed:", err);
  }
  revalidatePath("/admin/social", "layout");
}
