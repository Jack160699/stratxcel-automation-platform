/**
 * Artifact-first local Copilot turns — no AI provider invocation.
 */

import type { OwnerContext } from "../db-context.ts";
import { insertMessage, setSessionStatus } from "../repositories/agent.ts";
import { completeRun, recordRunEvent } from "../repositories/agent-runs.ts";
import {
  classifySocialCopilotIntent,
  isArtifactDisplayIntent,
  type SocialCopilotIntent,
} from "./copilot-intents.ts";
import { isNaturalPublishPhrase } from "../workforce/authorization.ts";
import {
  buildResurfaceReviewResponse,
  buildShowVariantsResponse,
  loadCurrentReviewArtifact,
} from "./review-session.ts";

export async function handleLocalArtifactDisplayTurn(
  ctx: OwnerContext,
  sessionId: string,
  runId: string,
  userPrompt: string,
  intent: SocialCopilotIntent = classifySocialCopilotIntent(userPrompt),
): Promise<{
  handled: boolean;
  text?: string;
  proposedActions?: Array<{ id: string; tool: string; input: Record<string, unknown> }>;
  aiCalls: number;
  reviewArtifact?: Awaited<ReturnType<typeof loadCurrentReviewArtifact>>;
}> {
  if (!isArtifactDisplayIntent(intent)) {
    return { handled: false, aiCalls: 0 };
  }

  const existing = await loadCurrentReviewArtifact(ctx, sessionId);
  if (existing) {
    const response =
      intent === "SHOW_VARIANTS" || intent === "SHOW_CURRENT_REVIEW"
        ? buildShowVariantsResponse(existing)
        : buildResurfaceReviewResponse(existing);
    await insertMessage(ctx, sessionId, "AGENT", response.text, response.parts);
    await setSessionStatus(ctx, sessionId, "WAITING_FOR_CHOICE");
    await recordRunEvent(ctx, runId, {
      type: "RUN_COMPLETED",
      label: "Resurfaced persisted review artifact",
      status: "SUCCESS",
      meta: { intent, aiCalls: 0, variantCount: existing.variants.length },
    });
    await completeRun(ctx, runId, "COMPLETED");
    return {
      handled: true,
      text: response.text,
      proposedActions: existing.variants.filter((v) => v.actionId).map((v) => ({
        id: v.actionId!,
        tool: "schedule_post",
        input: { variantId: v.variantId, platform: v.platform, scheduledAt: v.scheduledAtIso },
      })),
      aiCalls: 0,
      reviewArtifact: existing,
    };
  }

  if (intent === "NATURAL_AFFIRMATION" || isNaturalPublishPhrase(userPrompt)) {
    const message =
      "No active review is ready yet. Tell me what to prepare, or use Plan this week — chat confirmations never publish.";
    await insertMessage(ctx, sessionId, "AGENT", message);
    await setSessionStatus(ctx, sessionId, "READY");
    await recordRunEvent(ctx, runId, {
      type: "RUN_COMPLETED",
      label: "Natural affirmation without review",
      status: "SUCCESS",
    });
    await completeRun(ctx, runId, "COMPLETED");
    return { handled: true, text: message, proposedActions: [], aiCalls: 0 };
  }

  return { handled: false, aiCalls: 0 };
}
