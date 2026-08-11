// Builds the display-only preview for a proposed publish-intent action —
// the data behind the Copilot's "Ready to publish" approval card. Resolved
// fresh from the real content_variants/social_accounts rows every time it's
// requested (never cached in the stored action), so an edit made after
// proposing still shows correctly, and the card never needs to display a
// raw UUID/tool name/internal payload (Section 3 of the follow-up brief).
import type { OwnerContext } from "../db-context";
import { getAction, updateActionInput } from "../repositories/agent";
import { getAutomationSettings } from "../repositories/automation";
import { updateContentVariant } from "../repositories/media-assets";
import { stripInternalInput } from "./dependencies";
import { PUBLISH_INTENT_TOOLS, platformLabel } from "./publish-outcome-classify";
import { dedupeCaptionForPreview } from "./caption-format";
import { formatAccountPresentation } from "./account-presentation.ts";

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
      reviewDisplayStatus: action.status === "SUPERSEDED" ? "SUPERSEDED" : "READY_FOR_APPROVAL",
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
 * Edit-before-approval (Section 8): patches the underlying content variant
 * (caption/hashtags live there, not in the proposed action's tool
 * arguments) and, for schedule_post, the proposed timing. Never touches
 * platform/account/media identity — those still come from trusted IDs the
 * model already resolved. Only a still-PROPOSED action can be edited.
 */
export async function editProposedPublishAction(
  ctx: OwnerContext,
  actionId: string,
  patch: { caption?: string; hashtags?: string[]; scheduledAt?: string }
): Promise<PublishActionPreview> {
  const action = await getAction(ctx, actionId);
  if (!action) throw new Error("Action not found.");
  if (action.status !== "PROPOSED") throw new Error("This action is no longer awaiting approval.");
  if (!PUBLISH_INTENT_TOOLS.has(action.tool_name)) throw new Error("This action cannot be edited.");

  const input = stripInternalInput(action.input ?? {});
  const variantId = str(input.variantId);
  if ((patch.caption !== undefined || patch.hashtags !== undefined) && variantId) {
    await updateContentVariant(ctx, {
      variantId,
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.hashtags !== undefined ? { hashtags: patch.hashtags } : {}),
    });
  }
  if (patch.scheduledAt !== undefined && action.tool_name === "schedule_post") {
    await updateActionInput(ctx, actionId, { ...action.input, scheduledAt: patch.scheduledAt });
  }

  const preview = await getActionPreview(ctx, actionId);
  if (!preview) throw new Error("Could not load the updated preview.");
  return preview;
}
