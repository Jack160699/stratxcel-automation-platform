/**
 * Load / assemble the canonical current Social Copilot review from persisted actions.
 */

import type { OwnerContext } from "../db-context";
import { getSessionDetail, type AgentActionRow } from "../repositories/agent";
import {
  buildSocialCopilotReviewArtifact,
  narrativeFromReview,
  reviewArtifactMessagePart,
  type SocialCopilotReviewArtifact,
  type SocialCopilotReviewVariant,
} from "./review-artifact";
import { selectActionsToSupersede } from "./action-supersession";

const PUBLISH_TOOLS = new Set(["schedule_post", "execute_youtube_verification", "execute_private_youtube_verification"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function nextReviewRevision(actions: readonly AgentActionRow[]): number {
  let max = 0;
  for (const action of actions) {
    const revision = Number(action.input?.revision);
    if (Number.isFinite(revision) && revision > max) max = revision;
  }
  return max + 1;
}

export function currentActiveReviewId(sessionId: string, revision: number): string {
  return `review_${sessionId}_${revision}`;
}

export async function loadCurrentReviewArtifact(
  ctx: OwnerContext,
  sessionId: string,
): Promise<SocialCopilotReviewArtifact | null> {
  const detail = await getSessionDetail(ctx, sessionId);
  const proposed = detail.actions.filter(
    (action) => action.status === "PROPOSED" && PUBLISH_TOOLS.has(action.tool_name),
  );
  if (!proposed.length) {
    // Fall back to latest superseded/history only when nothing active — still return null for "show"
    // so callers know there is no current review.
    return null;
  }

  const revisions = proposed.map((a) => Number(a.input?.revision)).filter((n) => Number.isFinite(n));
  const revision = revisions.length ? Math.max(...revisions) : 1;
  const reviewId =
    str(proposed[0]?.input?.reviewId) || currentActiveReviewId(sessionId, revision);

  const variants: SocialCopilotReviewVariant[] = [];
  for (const action of proposed.filter((a) => Number(a.input?.revision || revision) === revision || !a.input?.revision)) {
    const input = action.input ?? {};
    const variantId = str(input.variantId);
    if (!variantId) continue;
    const { data: variant } = await ctx.supabase
      .from("content_variants")
      .select("id, platform, format, caption, hashtags, creative_spec")
      .eq("id", variantId)
      .maybeSingle();
    if (!variant) continue;
    const { data: mediaRows } = await ctx.supabase
      .from("social_content_variant_media")
      .select("asset_id")
      .eq("variant_id", variantId)
      .order("position", { ascending: true });
    variants.push({
      variantId: variant.id,
      platform: String(variant.platform),
      format: String(variant.format ?? "post"),
      caption: String(variant.caption ?? ""),
      hashtags: Array.isArray(variant.hashtags) ? variant.hashtags.map(String) : [],
      mediaAssetIds: (mediaRows ?? []).map((row) => String(row.asset_id)),
      scheduledAtIso: str(input.scheduledAt),
      timeZone: str(input.timeZone),
      wallClockLabel: str(input.wallClockLabel),
      scheduleSource: str(input.scheduleSource),
      recommendationTier: str(input.recommendationTier),
      recommendationReason: str(input.recommendationReason),
      actionId: action.id,
      generationKey: str(asRecord(variant.creative_spec).generationKey),
    });
  }

  if (!variants.length) return null;

  const trustFail = variants.some((v) => {
    // Trust decision may be stored on creative_spec via create path; default READY_FOR_APPROVAL.
    return false;
  });

  return buildSocialCopilotReviewArtifact({
    tenantId: ctx.ownerId,
    missionId: str(proposed[0]?.input?.missionId) || sessionId,
    sessionId,
    revision,
    variants,
    trustStatus: trustFail ? "REVISE" : "PASS",
    displayStatus: "READY_FOR_APPROVAL",
    contentMasterId: str(proposed[0]?.input?.contentMasterId),
    active: true,
  });
}

export function buildShowVariantsResponse(artifact: SocialCopilotReviewArtifact): {
  text: string;
  parts: Array<Record<string, unknown>>;
} {
  return {
    text: "Here are the current variants.",
    parts: [
      reviewArtifactMessagePart(artifact),
      {
        type: "proposed_actions",
        actions: artifact.variants
          .filter((v) => v.actionId)
          .map((v) => ({
            id: v.actionId,
            tool: "schedule_post",
            input: {
              variantId: v.variantId,
              platform: v.platform,
              scheduledAt: v.scheduledAtIso,
              timeZone: v.timeZone,
              wallClockLabel: v.wallClockLabel,
              recommendationTier: v.recommendationTier,
              recommendationReason: v.recommendationReason,
              reviewId: artifact.reviewId,
              revision: artifact.revision,
            },
          })),
      },
    ],
  };
}

export function buildResurfaceReviewResponse(artifact: SocialCopilotReviewArtifact): {
  text: string;
  parts: Array<Record<string, unknown>>;
} {
  return {
    text: `${narrativeFromReview(artifact)} Use the explicit approval control to publish or schedule — chat confirmations do not publish.`,
    parts: [
      reviewArtifactMessagePart(artifact),
      {
        type: "proposed_actions",
        actions: artifact.variants
          .filter((v) => v.actionId)
          .map((v) => ({
            id: v.actionId,
            tool: "schedule_post",
            input: {
              variantId: v.variantId,
              platform: v.platform,
              scheduledAt: v.scheduledAtIso,
              timeZone: v.timeZone,
              wallClockLabel: v.wallClockLabel,
              recommendationTier: v.recommendationTier,
              recommendationReason: v.recommendationReason,
              reviewId: artifact.reviewId,
              revision: artifact.revision,
            },
          })),
      },
    ],
  };
}

export function computeSupersedeIdsForNewRevision(
  actions: readonly AgentActionRow[],
  next: { reviewId: string; revision: number; contentMasterId?: string | null; missionId?: string | null },
): string[] {
  return selectActionsToSupersede(
    actions.map((a) => ({ id: a.id, status: a.status, tool_name: a.tool_name, input: a.input ?? {} })),
    next,
  );
}
