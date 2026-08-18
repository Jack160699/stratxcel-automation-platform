/**
 * Load / assemble the canonical current Social Copilot review from persisted actions.
 */

import { type AgentActorContext, isTenantAgentContext } from "../agent-tenant-types.ts";
import { getSessionDetail, type AgentActionRow } from "../repositories/agent.ts";
import { getBrandProfile } from "../repositories/brand.ts";
import { getAutomationSettings } from "../repositories/automation.ts";
import {
  buildSocialCopilotReviewArtifact,
  narrativeFromReview,
  reviewArtifactMessagePart,
  type SocialCopilotReviewArtifact,
  type SocialCopilotReviewVariant,
} from "./review-artifact.ts";
import { selectActionsToSupersede, reviewFamilyId } from "./action-supersession.ts";
import { aggregateVariantTrust } from "./review-trust.ts";
import { buildProductCapabilityEvidence, resolveImageGenerationRuntimeStatus } from "./capability-evidence.ts";
import { getImageProvider, BlockedImageProvider } from "@stratxcel/creative-studio";

const PUBLISH_TOOLS = new Set(["schedule_post", "execute_youtube_verification", "execute_private_youtube_verification"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function nextReviewRevision(actions: readonly AgentActionRow[], reviewId?: string | null): number {
  let max = 0;
  for (const action of actions) {
    if (reviewId && action.input?.reviewId !== reviewId) continue;
    const revision = Number(action.input?.revision);
    if (Number.isFinite(revision) && revision > max) max = revision;
  }
  return max + 1;
}

/** @deprecated Prefer reviewFamilyId — kept for callers that used session+revision naming. */
export function currentActiveReviewId(sessionId: string, revision: number): string {
  return reviewFamilyId(sessionId, null, `review_${sessionId}_default`);
}

export async function loadCurrentReviewArtifact(
  ctx: AgentActorContext,
  sessionId: string,
  options?: { reviewId?: string | null },
): Promise<SocialCopilotReviewArtifact | null> {
  const detail = await getSessionDetail(ctx, sessionId);
  let proposed = detail.actions.filter(
    (action) => action.status === "PROPOSED" && PUBLISH_TOOLS.has(action.tool_name),
  );
  if (options?.reviewId) {
    proposed = proposed.filter((action) => action.input?.reviewId === options.reviewId);
  }
  if (!proposed.length) return null;

  // Prefer the highest revision among active PROPOSED; keep one review family if mixed.
  const families = [...new Set(proposed.map((a) => str(a.input?.reviewId)).filter(Boolean))] as string[];
  const focusFamily = options?.reviewId || families[0] || reviewFamilyId(sessionId);
  const familyActions = proposed.filter((a) => (str(a.input?.reviewId) || focusFamily) === focusFamily);
  const revisions = familyActions.map((a) => Number(a.input?.revision)).filter((n) => Number.isFinite(n));
  const revision = revisions.length ? Math.max(...revisions) : 1;
  const reviewId = str(familyActions[0]?.input?.reviewId) || focusFamily;

  const variants: SocialCopilotReviewVariant[] = [];
  for (const action of familyActions.filter((a) => Number(a.input?.revision || revision) === revision || !a.input?.revision)) {
    const input = action.input ?? {};
    const variantId = str(input.variantId);
    if (!variantId) continue;
    const { data: variant } = await ctx.supabase
      .from("content_variants")
      .select("id, platform, format, caption, hashtags, creative_spec, master_id")
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

  const [brand, settings] = await Promise.all([getBrandProfile(ctx), getAutomationSettings(ctx)]);
  const imageProvider = getImageProvider();
  const capabilityEvidence = buildProductCapabilityEvidence({
    shadowMode: settings.shadow_mode !== false,
    dryRun: process.env.SOCIAL_DRY_RUN === "1",
    socialPublishExecutable: settings.shadow_mode === false,
    imageGenerationStatus: resolveImageGenerationRuntimeStatus({
      providerConfigured: Boolean(imageProvider) && !(imageProvider instanceof BlockedImageProvider),
    }),
  });

  const trust = aggregateVariantTrust({
    variants: variants.map((v) => ({ variantId: v.variantId, caption: v.caption })),
    blockedPhrases: brand.voice?.blocked_phrases ?? [],
    forbiddenClaims: brand.voice?.forbidden_claims ?? [],
    capabilityEvidence,
  });

  return buildSocialCopilotReviewArtifact({
    tenantId: isTenantAgentContext(ctx) ? ctx.tenantId : ctx.ownerId,
    missionId: str(familyActions[0]?.input?.missionId) || sessionId,
    sessionId,
    reviewId,
    revision,
    variants,
    trustStatus: trust.trustStatus,
    approvalAllowed: trust.approvalAllowed,
    trustReasons: trust.reasons,
    displayStatus: trust.displayStatus,
    contentMasterId: str(familyActions[0]?.input?.contentMasterId),
    capabilityReadiness: {
      shadowMode: String(capabilityEvidence.shadowMode),
      imageGeneration: capabilityEvidence.imageGenerationStatus,
    },
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
              artifactVersion: artifact.artifactVersion,
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
  const approvalHint = artifact.approvalAllowed
    ? "Use the explicit approval control to publish or schedule — chat confirmations do not publish."
    : "Needs revision before approval.";
  return {
    text: `${narrativeFromReview(artifact)} ${approvalHint}`,
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
              artifactVersion: artifact.artifactVersion,
            },
          })),
      },
    ],
  };
}

export function computeSupersedeIdsForNewRevision(
  actions: readonly AgentActionRow[],
  next: { reviewId: string; revision: number; contentMasterId?: string | null },
): string[] {
  return selectActionsToSupersede(
    actions.map((a) => ({ id: a.id, status: a.status, tool_name: a.tool_name, input: a.input ?? {} })),
    next,
  );
}
