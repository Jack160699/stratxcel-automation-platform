// Builds the display-only preview for a proposed publish-intent action —
// the data behind the Copilot's "Ready to publish" approval card. Resolved
// fresh from the real content_variants/social_accounts rows every time it's
// requested (never cached in the stored action), so an edit made after
// proposing still shows correctly, and the card never needs to display a
// raw UUID/tool name/internal payload (Section 3 of the follow-up brief).
import type { OwnerContext } from "../db-context.ts";
import {
  getAction,
  getSessionDetail,
  proposeAction,
  supersedeProposedActions,
} from "../repositories/agent.ts";
import { getAutomationSettings } from "../repositories/automation.ts";
import { getBrandProfile } from "../repositories/brand.ts";
import { createContentVariant } from "../repositories/content.ts";
import { stripInternalInput } from "./dependencies.ts";
import { PUBLISH_INTENT_TOOLS, platformLabel } from "./publish-outcome-classify.ts";
import { dedupeCaptionForPreview } from "./caption-format.ts";
import { formatAccountPresentation } from "./account-presentation.ts";
import { reviewFamilyId, selectActionsToSupersede } from "./action-supersession.ts";
import { aggregateVariantTrust } from "./review-trust.ts";
import { buildProductCapabilityEvidence, resolveImageGenerationRuntimeStatus } from "./capability-evidence.ts";
import { getImageProvider, BlockedImageProvider } from "@stratxcel/creative-studio";
import { buildVariantGenerationKey } from "./variant-idempotency.ts";

export { formatAccountPresentation } from "./account-presentation.ts";
export type { AccountPresentationRow } from "./account-presentation.ts";

export interface PublishActionPreview {
  actionId: string;
  tool: string;
  platform?: string;
  platformLabel?: string;
  accountLabel?: string;
  accountHandle?: string;
  accountAvatarUrl?: string;
  caption?: string;
  hashtags: string[];
  scheduledAt?: string;
  /** Tenant timezone for scheduled wall-clock display. */
  timeZone?: string;
  /** Deterministic local wall-clock label (YYYY-MM-DDTHH:mm). */
  wallClockLabel?: string;
  scheduleSource?: string;
  reviewDisplayStatus?: string;
  trustStatus?: "PASS" | "REVISE" | "BLOCK" | "PENDING";
  approvalAllowed?: boolean;
  trustReasons?: string[];
  reviewId?: string;
  revision?: number;
  artifactVersion?: string;
  /** True when scheduledAt is "now"-ish (or the tool always publishes immediately, like YouTube verification). */
  isImmediate: boolean;
  mediaAssetIds: string[];
  /** Ordered mime types aligned with mediaAssetIds (same length when available). */
  mediaMimeTypes?: string[];
  shadowMode: boolean;
  /** YouTube-only visibility, when applicable. */
  visibility?: string;
  recommendationTier?: "recommended" | "optional";
  recommendationReason?: string;
  /** Human-readable media preview failure when assets exist but cannot be signed. */
  mediaPreviewError?: string;
}

const IMMEDIATE_WINDOW_MS = 2 * 60 * 1000;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

type AccountRow = {
  id: string;
  platform: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Mirror schedule_post execute-time account resolution for preview display.
 * Prefer explicit accountId; otherwise resolve the CONNECTED account for the
 * platform. Never leaves the UI stuck on "Not resolved" when a real destination exists.
 */
export async function resolveConnectedAccountForPreview(
  ctx: OwnerContext,
  input: { accountId?: string; platform?: string }
): Promise<AccountRow | null> {
  const accountId = input.accountId;
  const platform = input.platform;
  let query = ctx.supabase
    .from("social_accounts")
    .select("id, platform, username, display_name, avatar_url")
    .eq("status", "CONNECTED");
  query = accountId ? query.eq("id", accountId) : platform ? query.ilike("platform", platform) : query.limit(0);
  if (!accountId && !platform) return null;
  const { data } = await query.limit(2);
  if (!data?.length) return null;
  // Multiple connected accounts for a platform: still show the first for
  // presentation (execute will require an explicit choice). Prefer matching
  // accountId when provided.
  return data[0] as AccountRow;
}

/** Presentation identity for cards/modals — never provider IDs, never "Not resolved". */
// formatAccountPresentation lives in account-presentation.ts (pure, unit-testable).

async function variantMediaAssetIds(ctx: OwnerContext, variantId: string, masterId: string | null): Promise<string[]> {
  const { data: variantMedia } = await ctx.supabase
    .from("social_content_variant_media")
    .select("asset_id")
    .eq("variant_id", variantId)
    .order("position", { ascending: true });
  if (variantMedia?.length) return variantMedia.map((row) => row.asset_id as string);
  if (!masterId) return [];
  const { data: masterMedia } = await ctx.supabase
    .from("social_content_master_media")
    .select("asset_id")
    .eq("master_id", masterId)
    .order("position", { ascending: true });
  return (masterMedia ?? []).map((row) => row.asset_id as string);
}

async function mediaMimeTypesFor(ctx: OwnerContext, assetIds: string[]): Promise<string[]> {
  if (!assetIds.length) return [];
  const { data } = await ctx.supabase.from("social_media_assets").select("id, mime_type").in("id", assetIds);
  const byId = new Map((data ?? []).map((row) => [row.id as string, String(row.mime_type || "")]));
  return assetIds.map((id) => byId.get(id) || "application/octet-stream");
}

/** Returns null for a non-publish-intent action (nothing to preview — the generic approval card handles those). */
export async function getActionPreview(ctx: OwnerContext, actionId: string): Promise<PublishActionPreview | null> {
  const action = await getAction(ctx, actionId);
  if (!action || !PUBLISH_INTENT_TOOLS.has(action.tool_name)) return null;
  const input = stripInternalInput(action.input ?? {});
  const settings = await getAutomationSettings(ctx);
  const accountId = str(input.accountId);
  const variantId = str(input.variantId);

  if (action.tool_name === "schedule_post") {
    const { data: variant } = variantId
      ? await ctx.supabase.from("content_variants").select("platform, caption, hashtags, master_id").eq("id", variantId).maybeSingle()
      : { data: null };
    const platform = str(input.platform) || variant?.platform || undefined;
    const account = await resolveConnectedAccountForPreview(ctx, { accountId, platform });
    const presentation = formatAccountPresentation(account, platform);
    const scheduledAt = str(input.scheduledAt);
    const hashtags = Array.isArray(variant?.hashtags) ? (variant.hashtags as string[]) : [];
    const mediaAssetIds = variantId ? await variantMediaAssetIds(ctx, variantId, variant?.master_id ?? null) : [];
    const mediaMimeTypes = await mediaMimeTypesFor(ctx, mediaAssetIds);
    const wallClockLabel = str(input.wallClockLabel);
    const timeZone = str(input.timeZone);
    const brand = await getBrandProfile(ctx);
    const imageProvider = getImageProvider();
    const capabilityEvidence = buildProductCapabilityEvidence({
      shadowMode: settings.shadow_mode !== false,
      dryRun: process.env.SOCIAL_DRY_RUN === "1",
      socialPublishExecutable: settings.shadow_mode === false,
      imageGenerationStatus: resolveImageGenerationRuntimeStatus({
        providerConfigured: Boolean(imageProvider) && !(imageProvider instanceof BlockedImageProvider),
      }),
    });
    const captionText = variant?.caption ? String(variant.caption) : "";
    const trust = aggregateVariantTrust({
      variants: [{ variantId: variantId || "unknown", caption: captionText }],
      blockedPhrases: brand.voice?.blocked_phrases ?? [],
      forbiddenClaims: brand.voice?.forbidden_claims ?? [],
      capabilityEvidence,
    });
    const revision = typeof input.revision === "number" ? input.revision : Number(input.revision) || undefined;
    return {
      actionId,
      tool: action.tool_name,
      platform,
      platformLabel: platform ? platformLabel(platform) : undefined,
      accountLabel: presentation.accountLabel,
      accountHandle: presentation.accountHandle,
      accountAvatarUrl: presentation.accountAvatarUrl,
      caption: variant?.caption ? dedupeCaptionForPreview(variant.caption, hashtags) : undefined,
      hashtags,
      scheduledAt,
      timeZone,
      wallClockLabel,
      scheduleSource: str(input.scheduleSource),
      reviewDisplayStatus: action.status === "SUPERSEDED" ? "SUPERSEDED" : trust.displayStatus,
      trustStatus: trust.trustStatus,
      approvalAllowed: trust.approvalAllowed && action.status === "PROPOSED",
      trustReasons: trust.reasons,
      reviewId: str(input.reviewId),
      revision,
      artifactVersion: revision ? `v${revision}` : str(input.artifactVersion),
      // An omitted scheduledAt means "post now" — see schedule_post's tool
      // execute(), which defaults it the same way. Never read absence as a
      // future time.
      isImmediate: !scheduledAt || new Date(scheduledAt).getTime() <= Date.now() + IMMEDIATE_WINDOW_MS,
      mediaAssetIds,
      mediaMimeTypes,
      shadowMode: settings.shadow_mode,
      recommendationTier: input.recommendationTier === "optional" ? "optional" : input.recommendationTier === "recommended" ? "recommended" : undefined,
      recommendationReason: str(input.recommendationReason),
    };
  }

  // execute_youtube_verification / execute_private_youtube_verification
  const assetId = str(input.assetId);
  const [{ data: variant }, account] = await Promise.all([
    variantId ? ctx.supabase.from("content_variants").select("caption, hashtags").eq("id", variantId).maybeSingle() : Promise.resolve({ data: null }),
    resolveConnectedAccountForPreview(ctx, { accountId, platform: "youtube" }),
  ]);
  const presentation = formatAccountPresentation(account, "youtube");
  const visibility =
    action.tool_name === "execute_private_youtube_verification"
      ? "PRIVATE"
      : str(input.privacyStatus)?.toUpperCase();
  const youtubeHashtags = Array.isArray(variant?.hashtags) ? (variant.hashtags as string[]) : [];
  const mediaAssetIds = assetId ? [assetId] : [];
  const mediaMimeTypes = await mediaMimeTypesFor(ctx, mediaAssetIds);
  return {
    actionId,
    tool: action.tool_name,
    platform: "youtube",
    platformLabel: "YouTube",
    accountLabel: presentation.accountLabel,
    accountHandle: presentation.accountHandle,
    accountAvatarUrl: presentation.accountAvatarUrl,
    caption: variant?.caption ? dedupeCaptionForPreview(variant.caption, youtubeHashtags) : undefined,
    hashtags: youtubeHashtags,
    scheduledAt: undefined,
    isImmediate: true,
    mediaAssetIds,
    mediaMimeTypes,
    shadowMode: settings.shadow_mode,
    visibility,
  };
}

/**
 * Edit-before-approval creates a NEW review revision.
 * Historic revision content/actions remain immutable; prior PROPOSED rows become SUPERSEDED.
 * Returns the preview for the NEW action identity.
 */
export async function editProposedPublishAction(
  ctx: OwnerContext,
  actionId: string,
  patch: { caption?: string; hashtags?: string[]; scheduledAt?: string }
): Promise<PublishActionPreview> {
  const action = await getAction(ctx, actionId);
  if (!action) throw new Error("Action not found.");
  if (action.status === "SUPERSEDED") throw new Error("This review was superseded. Edit the current review instead.");
  if (action.status !== "PROPOSED") throw new Error("This action is no longer awaiting approval.");
  if (!PUBLISH_INTENT_TOOLS.has(action.tool_name)) throw new Error("This action cannot be edited.");
  if (!action.session_id) throw new Error("Action is missing session scope.");

  const input = stripInternalInput(action.input ?? {});
  const variantId = str(input.variantId);
  if (!variantId) throw new Error("Action is missing a content variant.");

  const { data: oldVariant } = await ctx.supabase
    .from("content_variants")
    .select("id, master_id, platform, format, objective, caption, hashtags, media_urls, creative_spec")
    .eq("id", variantId)
    .maybeSingle();
  if (!oldVariant) throw new Error("Content variant not found");

  const sessionId = action.session_id;
  const detail = await getSessionDetail(ctx, sessionId);
  const contentMasterId = str(input.contentMasterId) || String(oldVariant.master_id);
  const reviewId =
    str(input.reviewId) || reviewFamilyId(sessionId, contentMasterId);
  const priorRevision = Number(input.revision);
  const nextRevision = Number.isFinite(priorRevision) && priorRevision > 0 ? priorRevision + 1 : 2;

  const newCaption = patch.caption !== undefined ? patch.caption : String(oldVariant.caption ?? "");
  const newHashtags =
    patch.hashtags !== undefined
      ? patch.hashtags
      : Array.isArray(oldVariant.hashtags)
        ? (oldVariant.hashtags as string[])
        : [];
  const newScheduledAt = patch.scheduledAt !== undefined ? patch.scheduledAt : str(input.scheduledAt);

  const generationKey = buildVariantGenerationKey({
    tenantId: ctx.ownerId,
    missionId: str(input.missionId) || sessionId,
    sessionId,
    contentSlot: `${oldVariant.platform}:${oldVariant.format ?? "post"}`,
    masterId: String(oldVariant.master_id),
    platform: String(oldVariant.platform),
    format: String(oldVariant.format ?? "post"),
    briefVersion: `edit-v${nextRevision}`,
    revision: nextRevision,
  });

  // Create a NEW variant row — never mutate the historic revision's caption/media.
  const created = await createContentVariant(ctx, {
    masterId: String(oldVariant.master_id),
    platform: String(oldVariant.platform),
    format: String(oldVariant.format ?? "post"),
    objective: String(oldVariant.objective ?? "ENGAGEMENT"),
    caption: newCaption,
    hashtags: newHashtags,
    mediaUrls: Array.isArray(oldVariant.media_urls) ? (oldVariant.media_urls as string[]) : [],
    generationKey,
    creativeSpec: {
      ...(typeof oldVariant.creative_spec === "object" && oldVariant.creative_spec ? (oldVariant.creative_spec as Record<string, unknown>) : {}),
      parentVariantId: oldVariant.id,
      parentRevision: Number.isFinite(priorRevision) ? priorRevision : 1,
      revision: nextRevision,
    },
  });

  // Copy media attachments from the parent variant to the new revision.
  const { data: mediaRows } = await ctx.supabase
    .from("social_content_variant_media")
    .select("asset_id, position")
    .eq("variant_id", oldVariant.id)
    .order("position", { ascending: true });
  if (mediaRows?.length) {
    await ctx.supabase.from("social_content_variant_media").insert(
      mediaRows.map((row) => ({
        variant_id: created.id,
        asset_id: row.asset_id,
        position: row.position,
      })),
    );
  }

  // Supersede all PROPOSED actions in this review family (scoped — unrelated families untouched).
  const supersedeIds = selectActionsToSupersede(
    detail.actions.map((a) => ({ id: a.id, status: a.status, tool_name: a.tool_name, input: a.input ?? {} })),
    { reviewId, revision: nextRevision, contentMasterId },
  );
  await supersedeProposedActions(ctx, sessionId, supersedeIds);

  const newInput: Record<string, unknown> = {
    ...input,
    variantId: created.id,
    scheduledAt: newScheduledAt ?? undefined,
    reviewId,
    revision: nextRevision,
    artifactVersion: `v${nextRevision}`,
    previewArtifactVersion: `v${nextRevision}`,
    contentMasterId,
    parentActionId: actionId,
    parentVariantId: oldVariant.id,
  };

  const newActionId = await proposeAction(ctx, sessionId, action.tool_name, newInput);
  if (!newActionId) throw new Error("Could not create the revised review action.");

  const preview = await getActionPreview(ctx, newActionId);
  if (!preview) throw new Error("Could not load the updated preview.");
  return preview;
}
