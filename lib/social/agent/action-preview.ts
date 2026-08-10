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

export interface PublishActionPreview {
  actionId: string;
  tool: string;
  platform?: string;
  platformLabel?: string;
  accountLabel?: string;
  caption?: string;
  hashtags: string[];
  scheduledAt?: string;
  /** True when scheduledAt is "now"-ish (or the tool always publishes immediately, like YouTube verification). */
  isImmediate: boolean;
  mediaAssetIds: string[];
  shadowMode: boolean;
  /** YouTube-only visibility, when applicable. */
  visibility?: string;
}

const IMMEDIATE_WINDOW_MS = 2 * 60 * 1000;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

async function variantMediaAssetIds(ctx: OwnerContext, variantId: string, masterId: string | null): Promise<string[]> {
  const { data: variantMedia } = await ctx.supabase
    .from("social_content_variant_media")
    .select("asset_id")
    .eq("variant_id", variantId)
    .order("position");
  if (variantMedia?.length) return variantMedia.map((row) => row.asset_id as string);
  if (!masterId) return [];
  const { data: masterMedia } = await ctx.supabase
    .from("social_content_master_media")
    .select("asset_id")
    .eq("master_id", masterId)
    .order("position");
  return (masterMedia ?? []).map((row) => row.asset_id as string);
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
    const [{ data: account }, { data: variant }] = await Promise.all([
      accountId
        ? ctx.supabase.from("social_accounts").select("platform, username, display_name").eq("id", accountId).maybeSingle()
        : Promise.resolve({ data: null }),
      variantId
        ? ctx.supabase.from("content_variants").select("platform, caption, hashtags, master_id").eq("id", variantId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const platform = account?.platform ?? variant?.platform;
    const scheduledAt = str(input.scheduledAt);
    const hashtags = Array.isArray(variant?.hashtags) ? (variant.hashtags as string[]) : [];
    return {
      actionId,
      tool: action.tool_name,
      platform,
      platformLabel: platform ? platformLabel(platform) : undefined,
      accountLabel: account?.display_name || account?.username || undefined,
      caption: variant?.caption ? dedupeCaptionForPreview(variant.caption, hashtags) : undefined,
      hashtags,
      scheduledAt,
      // An omitted scheduledAt means "post now" — see schedule_post's tool
      // execute(), which defaults it the same way. Never read absence as a
      // future time.
      isImmediate: !scheduledAt || new Date(scheduledAt).getTime() <= Date.now() + IMMEDIATE_WINDOW_MS,
      mediaAssetIds: variantId ? await variantMediaAssetIds(ctx, variantId, variant?.master_id ?? null) : [],
      shadowMode: settings.shadow_mode,
    };
  }

  // execute_youtube_verification / execute_private_youtube_verification
  const assetId = str(input.assetId);
  const [{ data: account }, { data: variant }] = await Promise.all([
    accountId
      ? ctx.supabase.from("social_accounts").select("username, display_name").eq("id", accountId).maybeSingle()
      : Promise.resolve({ data: null }),
    variantId ? ctx.supabase.from("content_variants").select("caption, hashtags").eq("id", variantId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const visibility =
    action.tool_name === "execute_private_youtube_verification"
      ? "PRIVATE"
      : str(input.privacyStatus)?.toUpperCase();
  const youtubeHashtags = Array.isArray(variant?.hashtags) ? (variant.hashtags as string[]) : [];
  return {
    actionId,
    tool: action.tool_name,
    platform: "youtube",
    platformLabel: "YouTube",
    accountLabel: account?.display_name || account?.username || undefined,
    caption: variant?.caption ? dedupeCaptionForPreview(variant.caption, youtubeHashtags) : undefined,
    hashtags: youtubeHashtags,
    scheduledAt: undefined,
    isImmediate: true,
    mediaAssetIds: assetId ? [assetId] : [],
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
