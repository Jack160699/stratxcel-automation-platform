// Pure, dependency-free classification helpers for publish-intent tool
// outcomes (mirrors activity-labels.ts / brand-sections.ts) — kept separate
// from publish-outcome.ts's DB/worker-touching runPublishNow() so this half
// can be unit tested standalone without hitting the extension-less relative
// imports elsewhere in the module graph that `node --experimental-strip-types`
// can't resolve on its own (same constraint noted in copilot-telemetry.test.ts).
//
// This is the ONE outcome classifier shared by both the direct "post now"
// turn loop (orchestrator.ts's runAgentTurn) and the human-approval path
// (orchestrator.ts's approveAgentAction) — see Section 11/13 of the
// workspace/execution-integrity brief: they must never diverge on wording.
import type { PublishingJobRow } from "../repositories/publishing.ts";

/**
 * Tools whose success/failure this turn determines whether a "publish"
 * mission actually succeeded. The orchestrator uses this to refuse a
 * false "Done."/"Posted."/"Published." reply when the real outcome of the
 * most recent one of these calls was not a proven live publication.
 */
export const PUBLISH_INTENT_TOOLS = new Set([
  "schedule_post",
  "execute_youtube_verification",
  "execute_private_youtube_verification",
]);

/** True when a publish-intent tool's own output proves a real live publication. */
export function isProvenLivePublish(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const record = output as Record<string, unknown>;
  if (record.jobStatus === "PUBLISHED" && record.mode && record.mode !== "shadow") return true;
  // execute_youtube_verification / execute_private_youtube_verification shape.
  if (record.status === "PUBLISHED" && typeof record.externalPostId === "string") return true;
  return false;
}

/** User-facing publish evidence — never fabricated, only what the tool/job actually returned. */
export interface PublishReceipt {
  platform?: string;
  accountLabel?: string;
  permalink?: string;
  externalPostId?: string;
  publishedAt?: string | null;
  shadow?: boolean;
}

function receiptFrom(output: unknown): PublishReceipt {
  if (!output || typeof output !== "object") return {};
  const record = output as Record<string, unknown>;
  return {
    platform: typeof record.platform === "string" ? record.platform : undefined,
    accountLabel: typeof record.accountLabel === "string" ? record.accountLabel : typeof record.account === "string" ? record.account : undefined,
    permalink: typeof record.permalink === "string" ? record.permalink : undefined,
    externalPostId: typeof record.externalPostId === "string" ? record.externalPostId : undefined,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : null,
    shadow: record.mode === "shadow",
  };
}

/**
 * Human-safe outcome summary for a completed publish-intent tool call,
 * derived only from the tool's own return value — used by the orchestrator
 * as the deterministic fallback/correction when the model's own reply would
 * otherwise claim an unproven "Done."/"Posted."/"Published.", and as the
 * ONLY message the (non-LLM) approval-execution path ever reports.
 */
export function describePublishAttempt(toolName: string, output: unknown): { succeeded: boolean; note: string; receipt: PublishReceipt } {
  const succeeded = isProvenLivePublish(output);
  const receipt = receiptFrom(output);
  const onPlatform = receipt.platform ? ` on ${platformLabel(receipt.platform)}` : "";
  const account = receipt.accountLabel ? ` (${receipt.accountLabel})` : "";
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.outcomeNote === "string") return { succeeded, note: record.outcomeNote, receipt };
    if (record.status === "PUBLISHED" && typeof record.permalink === "string") {
      return { succeeded: true, note: `Published successfully${onPlatform}${account}. Live permalink: ${record.permalink}`, receipt };
    }
    if (record.status === "PUBLISHED") return { succeeded: true, note: `Published successfully${onPlatform}${account}.`, receipt };
  }
  return { succeeded, note: `${toolName} did not confirm a live publication.`, receipt };
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
}

/**
 * Same wording discipline as outcomeNoteFor -- a real, honest, human-safe
 * summary of a non-OK GenerateImageOutcome (generate_image /
 * executeGenerateImageTool), never fabricated. Pulled out here (not left
 * inline in orchestrator.ts) for the exact reason this module exists at
 * all per its own header comment: pure, dependency-free, standalone-
 * testable classification logic.
 *
 * VERIFICATION INTEGRITY (autonomous-convergence-loop mission, section 10
 * -- "universalize the existing interpretOutcome architecture... applies
 * globally... to image"). generate_image has the exact same real,
 * non-throwing soft-failure surface that produced the live Update-9/10
 * incident on this function's OTHER caller (lib/agent-core/growth-media-
 * tools.ts, WhatsApp/Admin Copilot) -- outcome: FAILED/REVISION_REQUIRED/
 * NOT_CONFIGURED/WAITING_CONFIGURATION/PENDING, none of which throw. That
 * fix never touched Social Autopilot's own, separate agent loop even
 * though it calls the identical underlying function, so the same bug was
 * independently live here the whole time, unrelated to and unfixed by
 * Updates 10/13.
 */
export function describeImageGenerationOutcome(outcome: string, reason?: string): string {
  if (outcome === "REVISION_REQUIRED") return "The image candidates are ready but need your selection before anything is final.";
  if (outcome === "NOT_CONFIGURED" || outcome === "WAITING_CONFIGURATION") {
    return `Image generation isn't fully set up yet${reason ? ` (${reason})` : ""} — no image was created.`;
  }
  if (outcome === "PENDING") return "Image generation is still pending — nothing is ready yet.";
  return `Image generation did not succeed${reason ? ` (${reason})` : ""} — no image was created.`;
}

export function outcomeNoteFor(
  job: PublishingJobRow | null,
  wasImmediate: boolean,
  context: { platform?: string; accountLabel?: string } = {}
): string {
  const onPlatform = context.platform ? ` on ${platformLabel(context.platform)}` : "";
  const account = context.accountLabel ? ` (${context.accountLabel})` : "";
  if (!job) return "The publishing job could not be found after scheduling — treat this as not published.";
  const result = (job.result ?? {}) as Record<string, unknown>;
  if (job.status === "PUBLISHED") {
    if (result.mode === "shadow") {
      return `Draft prepared successfully, but Social Autopilot is in Shadow Mode, so nothing was published externally${onPlatform}${account} — there is no live post or permalink.`;
    }
    const permalink = typeof result.permalink === "string" ? result.permalink : undefined;
    return permalink
      ? `Published successfully${onPlatform}${account}. Live permalink: ${permalink}`
      : `Published successfully${onPlatform}${account}, but the provider did not return a live permalink for this platform.`;
  }
  if (job.status === "FAILED") {
    return `I couldn't publish this${onPlatform}${account}. ${job.last_error || "Unknown error."} No post was created — the prepared draft is still available.`;
  }
  if (job.status === "SCHEDULED" || job.status === "CLAIMED" || job.status === "RUNNING") {
    return wasImmediate
      ? `Approved. Publishing${onPlatform}${account} is still in progress — do not claim it published yet; it will show the real result once processing finishes.`
      : `Approved and queued for publishing${onPlatform}${account} at the requested future time. It is not live yet.`;
  }
  return `Publishing job status: ${job.status}. Treat this as not published unless status is PUBLISHED.`;
}
