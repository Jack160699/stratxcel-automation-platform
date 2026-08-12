import { recordAudit } from "../repositories/system";
import { getAutomationSettings, requiresApproval } from "../repositories/automation";
import {
  createAgentSession as createSessionRepo,
  setSessionStatus,
  insertMessage,
  loadHistory,
  proposeAction,
  recordExecutedAction,
  getAction,
  getSessionDetail,
  updateActionStatus,
  hasPendingActions,
  claimAgentAction,
  supersedeProposedActions,
} from "../repositories/agent";
import { startRun, completeRun, recordRunEvent, getLatestRun } from "../repositories/agent-runs";
import { resolveConfiguredProvider } from "./provider";
import { classifyCreativeRequestMode, classifySocialPromptIntent, requiresLocalMetaHandling, selectGeminiBrandInstructions } from "./gemini-boundary";
import {
  classifySocialCopilotIntent,
  isArtifactDisplayIntent,
  isSafePreparationIntent,
  requiresConcreteFutureSchedule,
} from "./copilot-intents";
import { handleLocalArtifactDisplayTurn } from "./local-artifact-turn";
import { planWeekSlots } from "../workforce/week-planner.ts";
import {
  computeSupersedeIdsForNewRevision,
  loadCurrentReviewArtifact,
} from "./review-session";
import { reviewFamilyId } from "./action-supersession";
import { narrativeFromReview, reviewArtifactMessagePart } from "./review-artifact";
import { calculateLocalMetricsSummary } from "../local-meta-summary";
import { listRecentMetrics } from "../repositories/analytics";
import { listAccounts } from "../repositories/accounts";
import { getBrandProfile } from "../repositories/brand";
import { getTool, toolSchemas, type AgentTool } from "./tools";
import { serializeToolOutput } from "./tool-output";
import { labelForTool, labelForApproval, PHASE_LABELS } from "./activity-labels";
import { summarizeForEvent } from "./tool-output-summary";
import type { AgentTurnMessage } from "./provider";
import type { OwnerContext } from "../db-context";
import {
  INTERNAL_DEPENDENTS_KEY,
  readDeferredActions,
  splitDependentCalls,
  stripInternalInput,
} from "./dependencies";
import { validateBrandEntities } from "./brand-validation";
import { PUBLISH_INTENT_TOOLS, describePublishAttempt, type PublishReceipt } from "./publish-outcome-classify";
import { sanitizeUserFacingText } from "./user-facing-text";
import {
  attachmentPart,
  bindAttachmentsToMessage,
  getAttachmentsByIds,
  loadImageAttachmentsForModel,
} from "../repositories/agent-attachments";
import { evaluateBrandTrustHardGate, canShowApprovalControl } from "./trust-hard-gate";
import { buildProductCapabilityEvidence, resolveImageGenerationRuntimeStatus } from "./capability-evidence";
import { getImageProvider, BlockedImageProvider } from "@stratxcel/creative-studio";
import { decideManualPublishGate } from "../workforce/authorization.ts";

const SYSTEM_PROMPT = `You are the Stratxcel Social Autopilot Agent — an operational copilot for Stratxcel's own
Instagram, Facebook, Threads, LinkedIn, and YouTube presence. You plan, draft, schedule, and analyze
social content using the tools available to you.

Ground every content, campaign, or strategy decision in Brand Brain via inspect_brand. It takes a
\`section\` argument: "summary" (identity, voice, and counts of everything — the default), "identity",
"products", "audiences", "pillars", "sources", "rules", or "all" (the complete profile in one call).
Call it with the section(s) the task actually needs — product-specific content needs section="products",
audience-specific content needs section="audiences", a claims/compliance question needs section="rules".
For a request to summarize or fully understand Stratxcel's brand, inspect enough sections to cover
identity, products, audiences, pillars, sources, and rules — section="all" returns everything in one
call for the current profile size, but if its response ever includes a "_truncated": true field on a
section, call inspect_brand again with that specific section to get the rest before answering. Never
state that a section is empty or absent without having actually retrieved it. Don't force a full Brand
Brain read for questions unrelated to brand content, e.g. "are connected accounts healthy?" only needs
inspect_accounts or inspect_health.

You are outcome-oriented, not tool-oriented. For a bounded publishing request like "post this on
Threads", autonomously do ALL of the safe preparation yourself — inspecting the attachment, resolving
media, reading Brand Brain, choosing the canonical content pillar, writing the caption, creating/reusing
the content master, creating the platform variant, attaching the media, checking the connected account —
without asking the user to approve or confirm any of those internal steps. Do not ask "should I create a
content item?", "which content pillar?", "should I attach the media?", or "should I schedule it?" as chat
questions — just do the preparation, then let the one real publish action (schedule_post /
execute_*_youtube_verification) speak for itself; that is the single point where a human approves. Do not
create a campaign unless the user explicitly asked for one or the content genuinely belongs to an existing
campaign they named — pass campaignId as omitted/null for an ordinary one-off post. If the user asked to
post on multiple platforms, prepare every platform's variant before proposing any publish action, so they
all surface together as one approval rather than one at a time. Only ask a clarifying question before
preparing content when information truly cannot be inferred safely: multiple connected accounts on the
target platform with no reasonable default, no publishing-capable account for the requested platform, a
genuinely unreadable attachment the content depends on, or a named campaign that cannot be identified.

Natural language such as "connected accounts", platform names, or Hinglish phrases like "alag version
bana do" is destination context, not automatically an analytics request. When the user asks where content
would fit, inspect only the safe connected-platform projection, recommend sensible destinations, and make
meaningfully different variants: Instagram gets a visual hook, concise engaging copy and appropriate
hashtags; LinkedIn gets a professional founder/operator angle, business context and useful CTA; Facebook
gets broad accessible language and a conversational CTA; Threads gets short, direct, natural copy. Use
the same source media where appropriate. For schedule_post, pass the platform and let the server resolve
the connected account locally; do not ask for or repeat account IDs, provider IDs, permissions, or metadata.
When recommending destinations, include recommendationTier (recommended or optional) and one concise
recommendationReason on each schedule_post based on Brand Brain, image/content format, the user's goal,
and normal platform communication style. Prepare all variants before the single combined approval.
Once publish actions are proposed, keep the chat reply to a brief readiness/recommendation summary. Do not
repeat full captions, hashtags, technical tool names, or internal references in chat because the combined
approval artifact renders the real platform previews and controls.

When a message includes a creative image but no specific content instruction, review the actual image and
respond with a short, natural explanation of what it communicates and why it could be useful for the
brand. Then offer 4-6 relevant capability-oriented next actions, such as platform-specific posts, captions,
best-platform recommendations, a founder angle, an educational angle, promotional copy, or approval-ready
preparation. Tailor the options to the image instead of listing every feature. Do not claim to understand
details that are not visible, and do not begin publishing preparation until the user chooses a direction.

State wording must be evidence-based, not aspirational. Before a publish action is approved, no publishing
job exists yet — describe that state as "prepared and awaiting your approval", never "queued", "scheduled",
or "in progress". Only say something is queued/scheduled once an approved schedule_post call has actually
returned a job. When the user says "post it", "publish it", "post now", or gives no requested time, call
schedule_post without guessing a specific future clock time — omit scheduledAt entirely (it defaults to
right now) rather than inventing a time like "4:30 PM" that nobody asked for. Only pass a specific
scheduledAt when the user actually requested a future date/time.

CRITICAL WEEK PLANNING: When the user asks to "plan this week" / "plan my week" / prepare this week's
posts, that authorizes INTERNAL draft preparation only — NOT external publish. Do NOT ask "Should I
proceed with drafting?", "Would you like me to create these?", or "Should I generate the variants?".
Prepare drafts automatically. For EVERY schedule_post in a week plan you MUST pass the exact
scheduledAt / timeZone / wallClockLabel values provided in the [Deterministic week plan slots] block —
never invent timestamps and never omit scheduledAt for weekly plans (omitting would incorrectly mean NOW).

Natural language like "yes", "haan", "kar do", "go ahead", "push it", "post kar do" never authorizes
external publish and must not regenerate variants when a review already exists — resurface the review
and wait for the explicit approval control.

Ask a short clarifying question instead of guessing when the goal is ambiguous. Never claim an action
succeeded unless a tool call actually returned success. Every internal database ID you use — attachmentId,
mediaAssetId, campaignId, masterId, variantId, accountId, assetId, publishingJobId — must come from a
trusted source: a "Trusted attachment context" block, or the output of list_/inspect_/create_* tool calls.
Never invent, guess, or reconstruct an ID; if you don't have one, call the tool that looks it up first, or
for an optional field like campaignId, omit it. When a message includes a "Trusted attachment context"
block, that is the exact real attachmentId for that upload — pass it verbatim to ingest_media, which
returns the canonical mediaAssetId to use with attach_media_to_content / update_content_variant. Never
reuse an attachmentId where a mediaAssetId is required. Never silently reuse media from older sessions
or older missions — only current-message attachments or explicitly selected library media.

Publishing completion wording is safety-critical. Only say "Published" / "Posted" / "Done" for a publish
request when a schedule_post or execute_*_youtube_verification tool result shows jobStatus/status
"PUBLISHED" with a live (non-shadow) mode — quote the tool's outcomeNote/permalink rather than
paraphrasing an assumption. If the tool result shows Shadow Mode, say plainly that a draft was prepared
but nothing was published externally because Social Autopilot is in Shadow Mode. If it failed, say you
couldn't publish it and give the real reason. If it's still queued for a future time, say it's queued and
not live yet. If it requires human approval, say it's ready and waiting for approval. Never use "Done."
as a substitute for reporting the real outcome of a publish request.

For private YouTube verification while SHADOW is active, only use execute_private_youtube_verification
when the user explicitly requested that exact private upload. Keep responses concise and operational, not
hype-y.`;

// Media publishing may require: attachment identity, content lookup, variant
// inspection, account selection, policy validation, then the final proposal.
// Keep the loop bounded, but leave enough room for those real prerequisites.
const MAX_TOOL_ROUNDS = 8;

interface AttachmentContextEntry {
  id: string;
  name: string;
  mimeType: string;
}

function isAttachmentsPart(part: unknown): part is { type: "attachments"; attachments: AttachmentContextEntry[] } {
  return (
    Boolean(part) &&
    typeof part === "object" &&
    (part as { type?: unknown }).type === "attachments" &&
    Array.isArray((part as { attachments?: unknown }).attachments)
  );
}

/**
 * The model must never guess a database attachment ID — it can only use one
 * actually present in its context, and previously none ever was (the
 * conversation only carried `message.content`; the real attachment identity
 * lived solely in the `parts` column, rendered for the UI but never sent to
 * the provider). This deterministically appends the real, server-persisted
 * attachmentId for a message — built from the DB-backed `parts` column,
 * never from anything the model wrote — so the model has the exact ID to
 * pass to ingest_media instead of inventing one. Only attachmentId is
 * exposed here; the canonical mediaAssetId is deliberately NOT pre-supplied
 * — the model must resolve it via ingest_media(attachmentId), the same
 * trusted, ownership-checked round trip as before, keeping this addition
 * narrowly scoped to the one identifier that was actually missing.
 */
function attachmentContextSuffix(parts: unknown[]): string {
  const attachmentsPart = (parts ?? []).find(isAttachmentsPart);
  if (!attachmentsPart || attachmentsPart.attachments.length === 0) return "";
  const lines = attachmentsPart.attachments.map(
    (attachment) =>
      `- attachmentId=${attachment.id} name=${attachment.name} mimeType=${attachment.mimeType}`
  );
  return `\n\n[Trusted attachment context — the real attachmentId(s) for this message, use verbatim with ingest_media, never invent your own]\n${lines.join("\n")}`;
}

function strOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function createAgentSession(ctx: OwnerContext, title: string | null) {
  return createSessionRepo(ctx, title);
}

export async function acceptAgentMission(
  ctx: OwnerContext,
  sessionId: string | null,
  userText: string,
  attachmentIds: string[] = []
) {
  const id = sessionId ?? (await createAgentSession(ctx, userText.slice(0, 60)));
  const attachments = await getAttachmentsByIds(ctx, id, attachmentIds);
  if (attachments.length !== attachmentIds.length) throw new Error("One or more attachments do not belong to this session.");
  const messageId = await insertMessage(ctx, id, "USER", userText, attachments.length ? [attachmentPart(attachments)] : []);
  await setSessionStatus(ctx, id, "GENERATING");
  const runId = await startRun(ctx, id);
  if (attachments.length && messageId) {
    await bindAttachmentsToMessage(ctx, id, attachments.map((attachment) => attachment.id), messageId, runId);
  }
  await recordRunEvent(ctx, runId, { type: "RUN_STARTED", label: PHASE_LABELS.RUN_STARTED });
  return { sessionId: id, runId };
}

/**
 * Executes one full agent turn: persist the user's message, ask the
 * configured provider what to do, execute any tool calls that don't need
 * human approval under the current autonomy level/guardrails, queue the
 * rest as proposed actions, and persist the agent's reply.
 *
 * If no AI provider is configured, this is honest about it instead of
 * fabricating a response — the whole point of "no fake functionality".
 */
export async function runAgentTurn(ctx: OwnerContext, sessionId: string, runId: string) {
  const history = await loadHistory(ctx, sessionId);
  const latestUserMessage = [...history].reverse().find((message) => message.role === "USER");
  const latestUserPrompt = latestUserMessage?.content ?? "";
  const copilotIntent = classifySocialCopilotIntent(latestUserPrompt);
  const promptIntent = classifySocialPromptIntent(latestUserPrompt);

  // Artifact-first local paths: no AI call required to display persisted variants/review.
  if (isArtifactDisplayIntent(copilotIntent)) {
    const local = await handleLocalArtifactDisplayTurn(ctx, sessionId, runId, latestUserPrompt, copilotIntent);
    if (local.handled) {
      return {
        blocked: false as const,
        failed: false as const,
        text: local.text ?? "",
        proposedActions: local.proposedActions ?? [],
        runId,
        reviewArtifact: local.reviewArtifact,
        aiCalls: 0,
      };
    }
  }

  if (requiresLocalMetaHandling(latestUserPrompt)) {
    const [metrics, accounts] = await Promise.all([listRecentMetrics(ctx, 50), listAccounts(ctx)]);
    const summary = calculateLocalMetricsSummary(metrics);
    const connectedCount = accounts.filter((account) => account.status === "CONNECTED").length;
    const message = `${summary.text} Connected-account state is handled locally: ${connectedCount} of ${accounts.length} configured accounts are currently connected. No external generative AI received this request or its data.`;
    await insertMessage(ctx, sessionId, "AGENT", message);
    await setSessionStatus(ctx, sessionId, "IDLE");
    await recordRunEvent(ctx, runId, { type: "RUN_COMPLETED", label: "Local Platform-data summary", status: "SUCCESS" });
    await completeRun(ctx, runId, "COMPLETED");
    return { blocked: false as const, failed: false as const, text: message, proposedActions: [], runId };
  }

  const provider = resolveConfiguredProvider();
  if (!provider) {
    const message =
      "No AI provider is configured yet, so I can't plan or generate content. " +
      "Add GEMINI_API_KEY in Integrations → AI Providers and I'll pick it up automatically. " +
      "I can still run direct tools for you if you ask a specific yes/no operational question through the UI.";
    await insertMessage(ctx, sessionId, "AGENT", message);
    await setSessionStatus(ctx, sessionId, "BLOCKED");
    await recordRunEvent(ctx, runId, { type: "RUN_FAILED", label: PHASE_LABELS.RUN_FAILED, status: "FAILED", meta: { reason: "AI provider not configured" } });
    await completeRun(ctx, runId, "FAILED", "AI provider not configured");
    return { blocked: true as const, reason: "ai_not_configured", message, runId };
  }

  // Resolve real tenants.id for billable AI — never use ownerId or a fake session string.
  const { resolveCurrentTenant } = await import("../../tenants/current-tenant.ts");
  const tenantResolution = await resolveCurrentTenant(ctx.supabase, ctx.ownerId);
  const tenantId = tenantResolution.active?.tenantId;
  if (!tenantId) {
    const message =
      "No active client tenant is selected, so AI processing cannot be attributed safely. " +
      "Select a client in the admin switcher and try again.";
    await insertMessage(ctx, sessionId, "AGENT", message);
    await setSessionStatus(ctx, sessionId, "BLOCKED");
    await recordRunEvent(ctx, runId, { type: "RUN_FAILED", label: PHASE_LABELS.RUN_FAILED, status: "FAILED", meta: { reason: "tenant_required_for_billable_ai" } });
    await completeRun(ctx, runId, "FAILED", "tenant_required_for_billable_ai");
    return { blocked: true as const, reason: "tenant_required", message, runId };
  }

  const settings = await getAutomationSettings(ctx);
  const brandProfile = await getBrandProfile(ctx);
  // Current mission media only: attachments on the latest user message — never old-session fallback.
  const creativeImages = latestUserMessage?.id
    ? await loadImageAttachmentsForModel(ctx, latestUserMessage.id)
    : [];
  const creativeRequestMode =
    isSafePreparationIntent(copilotIntent) || requiresConcreteFutureSchedule(copilotIntent)
      ? "EXECUTE"
      : classifyCreativeRequestMode(latestUserPrompt, creativeImages.length > 0);

  const tenantTimeZone = "Asia/Kolkata";
  const weekSlots =
    copilotIntent === "PREPARE_WEEK_PLAN"
      ? planWeekSlots({
          timeZone: tenantTimeZone,
          itemCount: Math.max(3, creativeImages.length || 3),
          scheduleSource: "SYSTEM_DEFAULT",
        })
      : null;

  const detailForRevision = await getSessionDetail(ctx, sessionId);
  const activeProposed = detailForRevision.actions.filter(
    (a) => a.status === "PROPOSED" && PUBLISH_INTENT_TOOLS.has(a.tool_name),
  );
  const focusReviewId =
    copilotIntent === "REVISE_CURRENT_ARTIFACT" && typeof activeProposed[0]?.input?.reviewId === "string"
      ? String(activeProposed[0].input.reviewId)
      : reviewFamilyId(sessionId);
  const priorMaxRevision = detailForRevision.actions.reduce((max, action) => {
    if (action.input?.reviewId && action.input.reviewId !== focusReviewId) return max;
    const revision = Number(action.input?.revision);
    return Number.isFinite(revision) && revision > max ? revision : max;
  }, 0);
  // Fresh preparation into an empty family stays at revision 1; replacement/revise bumps.
  const reviewRevision =
    priorMaxRevision > 0 && (copilotIntent === "REVISE_CURRENT_ARTIFACT" || isSafePreparationIntent(copilotIntent))
      ? priorMaxRevision + 1
      : Math.max(1, priorMaxRevision || 1);
  const activeReviewId = focusReviewId;
  const contentMasterId =
    typeof activeProposed.find((a) => a.input?.reviewId === focusReviewId)?.input?.contentMasterId === "string"
      ? String(activeProposed.find((a) => a.input?.reviewId === focusReviewId)!.input.contentMasterId)
      : null;

  if (reviewRevision > priorMaxRevision && priorMaxRevision > 0) {
    // Scope supersession to this review family only — never cancel unrelated session reviews.
    const supersedeIds = computeSupersedeIdsForNewRevision(detailForRevision.actions, {
      reviewId: activeReviewId,
      revision: reviewRevision,
      contentMasterId,
    });
    await supersedeProposedActions(ctx, sessionId, supersedeIds);
  }

  const roleMap: Record<string, AgentTurnMessage["role"]> = { USER: "user", AGENT: "assistant", SYSTEM: "system" };
  const messages: AgentTurnMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((message) => ({
      role: roleMap[message.role] ?? "user",
      content: message.content + attachmentContextSuffix(message.parts),
    })),
  ];

  if (promptIntent === "MIXED") {
    const [metrics, accounts] = await Promise.all([listRecentMetrics(ctx, 50), listAccounts(ctx)]);
    const summary = calculateLocalMetricsSummary(metrics);
    const trend = summary.reachTrendPercent === null
      ? "insufficient local history for a trend"
      : summary.reachTrendPercent >= 0 ? "recent reach trend is improving" : "recent reach trend is declining";
    const connectedPlatforms = [...new Set(accounts
      .filter((account) => account.status === "CONNECTED")
      .map((account) => account.platform.toLowerCase()))];
    messages[0].content += `\n\nSafe locally-derived creative guidance: ${trend}. Publishing-capable destination candidates: ${connectedPlatforms.join(", ") || "none"}. Raw metrics, account records, identifiers, permissions, and provider metadata remain local. Continue the user's creative task; do not request raw Platform data.`;
  }
  if (creativeRequestMode === "EXECUTE") {
    messages[0].content += `\n\nExecution intent is explicit. The user has authorized safe draft preparation. Infer the strongest Brand Brain-grounded angle and the best connected publishing-capable destinations, create the real content master and platform variants, attach the supplied media in order, and propose the final combined publish approval now. Do not answer with angle suggestions, ask which option they prefer, or say "Would you like me to prepare". Creative preference ambiguity is not a reason to stop. Do not ask intermediate drafting confirmation questions.`;
  }
  if (weekSlots) {
    const slotLines = weekSlots
      .map((slot, index) => `${index + 1}. scheduledAt=${slot.scheduledAtIso} timeZone=${slot.timeZone} wallClockLabel=${slot.wallClockLabel} scheduleSource=${slot.scheduleSource}`)
      .join("\n");
    messages[0].content += `\n\n[Deterministic week plan slots — REQUIRED for every schedule_post in this turn]\n${slotLines}\nPass requiresFutureSchedule=true, reviewId=${activeReviewId}, revision=${reviewRevision}, timeZone, wallClockLabel, scheduleSource, and the exact scheduledAt for each item. Never omit scheduledAt.`;
  }
  messages[0].content += `\n\n[Review scope] reviewId=${activeReviewId} revision=${reviewRevision} missionId=${sessionId} sessionId=${sessionId}. Include these on create_content_variant and schedule_post inputs for idempotency and supersession.`;

  await setSessionStatus(ctx, sessionId, "GENERATING");

  // Execution telemetry: a real, append-only trace of what this turn actually
  // did (provider round-trips, tool calls, approval gates) — never the
  // model's internal reasoning. See lib/social/repositories/agent-runs.ts.
  await recordRunEvent(ctx, runId, { type: "UNDERSTANDING_REQUEST", label: PHASE_LABELS.UNDERSTANDING_REQUEST, meta: { intent: copilotIntent } });

  const proposedActions: Array<{ id: string; tool: string; input: Record<string, unknown> }> = [];
  let finalText = "";
  let executionRecoveryAttempted = false;
  // Tracks the most recent schedule_post / execute_*_youtube_verification
  // outcome this turn — the deterministic backstop against a false
  // "Done."/"Posted."/"Published." reply (see Section 10 of the integrity brief).
  let lastPublishOutcome: { succeeded: boolean; note: string; receipt: PublishReceipt } | null = null;
  let weekSlotCursor = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      await recordRunEvent(ctx, runId, { type: "PROVIDER_REQUEST_STARTED", label: PHASE_LABELS.PROVIDER_REQUEST_STARTED });
      const providerStarted = Date.now();
      const result = await provider.complete(messages, toolSchemas(), {
        brandInstructions: selectGeminiBrandInstructions(brandProfile),
        creativeImages,
        tenantId,
        // Social session UUID is NOT missions.id — never write it into mission_id FK.
        missionId: null,
        sessionId,
        copilotIntent,
        authorizationClient: ctx.supabase as never,
        supabase: ctx.supabase as never,
      });
      await recordRunEvent(ctx, runId, {
        type: "PROVIDER_RESPONSE_RECEIVED",
        label: PHASE_LABELS.PROVIDER_RESPONSE_RECEIVED,
        status: "SUCCESS",
        meta: { durationMs: Date.now() - providerStarted },
      });
      if (result.text) finalText = result.text;

      if (result.toolCalls.length === 0) {
        if (creativeRequestMode === "EXECUTE" && creativeImages.length > 0 && proposedActions.length === 0 && !executionRecoveryAttempted) {
          executionRecoveryAttempted = true;
          messages.push({ role: "assistant", content: result.text || "" });
          messages.push({ role: "user", content: "Prepare the real editable artifacts now using the available tools. Do not return suggestions or ask me to choose an angle. Stop only after the combined final publish approval has been proposed." });
          continue;
        }
        break;
      }

      // Record the model's own turn before appending tool results — without
      // this, a later round replays tool-result messages with no preceding
      // assistant turn to anchor them to. Attach toolCalls for OpenAI Responses linkage.
      messages.push({
        role: "assistant",
        content: result.text || "",
        toolCalls: result.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
      });

      const { ready: toolCalls, deferredByUpstream } = splitDependentCalls(result.toolCalls);
      for (const call of toolCalls) {
        const tool: AgentTool | undefined = getTool(call.name);
        if (!tool) {
          messages.push({ role: "tool", content: `Unknown tool: ${call.name}`, toolCallId: call.id, toolName: call.name });
          continue;
        }

        const blockedDependency = call.arguments.__blockedDependency;
        if (typeof blockedDependency === "string") {
          messages.push({
            role: "tool",
            content: `Blocked: required upstream output "${blockedDependency}" does not exist yet. No action was proposed or executed.`,
            toolCallId: call.id,
            toolName: call.name,
          });
          continue;
        }

        // A conversational/manual mission always requires a deliberate UI or
        // WhatsApp control at the external publish boundary. Subscription
        // standing authorization is evaluated by the separate package queue,
        // never inferred from chat text or global AUTOPILOT settings.
        const needsApproval = PUBLISH_INTENT_TOOLS.has(tool.schema.name) ||
          (tool.mutating && requiresApproval(tool.schema.name, settings, 0.75));

        if (needsApproval) {
          const dependents = deferredByUpstream.get(call.id) ?? [];
          let publicInput: Record<string, unknown>;
          try {
            // Canonicalize/validate brand entities (pillar/audience/product)
            // before queuing for approval. A mismatch (e.g. an invented
            // pillar) must become a normal, retryable tool error — not an
            // uncaught throw that crashes the whole run (see Section 7).
            publicInput = await validateBrandEntities(ctx, tool.schema.name, stripInternalInput(call.arguments));
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "invalid input";
            await recordRunEvent(ctx, runId, {
              type: "TOOL_FAILED",
              label: labelForTool(tool.schema.name),
              toolName: tool.schema.name,
              status: "FAILED",
              meta: { reason: errorMessage },
            });
            messages.push({ role: "tool", content: `Error: ${errorMessage}`, toolCallId: call.id, toolName: call.name });
            continue;
          }

          // Enrich schedule_post with deterministic week slots + review scope.
          if (tool.schema.name === "schedule_post") {
            publicInput = {
              ...publicInput,
              reviewId: activeReviewId,
              revision: reviewRevision,
              missionId: sessionId,
              sessionId,
            };
            if (weekSlots) {
              const slot = weekSlots[Math.min(weekSlotCursor, weekSlots.length - 1)];
              weekSlotCursor += 1;
              if (!strOrEmpty(publicInput.scheduledAt) && slot) {
                publicInput.scheduledAt = slot.scheduledAtIso;
                publicInput.timeZone = slot.timeZone;
                publicInput.wallClockLabel = slot.wallClockLabel;
                publicInput.scheduleSource = slot.scheduleSource;
              }
              publicInput.requiresFutureSchedule = true;
              if (!strOrEmpty(publicInput.scheduledAt)) {
                messages.push({
                  role: "tool",
                  content: "Error: weekly plan schedule_post requires a concrete scheduledAt — proposal blocked.",
                  toolCallId: call.id,
                  toolName: call.name,
                });
                continue;
              }
            }
          }
          if (tool.schema.name === "create_content_variant") {
            publicInput = {
              ...publicInput,
              reviewId: activeReviewId,
              revision: reviewRevision,
              missionId: sessionId,
              sessionId,
            };
          }

          const storedInput = dependents.length
            ? { ...publicInput, [INTERNAL_DEPENDENTS_KEY]: dependents }
            : publicInput;
          const actionId = await proposeAction(ctx, sessionId, tool.schema.name, storedInput);
          if (actionId) proposedActions.push({ id: actionId, tool: tool.schema.name, input: publicInput });
          await recordRunEvent(ctx, runId, {
            type: "APPROVAL_REQUIRED",
            label: labelForApproval(tool.schema.name),
            toolName: tool.schema.name,
            status: "PENDING",
          });
          // Deliberately avoids the word "queued" — nothing is scheduled or
          // queued for publishing yet, only proposed for a human decision.
          // The model has previously paraphrased "queued" into a false
          // "the post ... is currently queued" reply before any publishing
          // job existed (see Section 1 of the live-progress cleanup brief).
          messages.push({
            role: "tool",
            content: `Action "${tool.schema.name}" is prepared and awaiting your approval. Nothing has been scheduled or published yet — no publishing job exists until it is approved.`,
            toolCallId: call.id,
            toolName: call.name,
          });
          continue;
        }

        const toolLabel = labelForTool(tool.schema.name);
        await recordRunEvent(ctx, runId, { type: "TOOL_STARTED", label: toolLabel, toolName: tool.schema.name });
        const toolStarted = Date.now();
        try {
          const validInput = await validateBrandEntities(ctx, tool.schema.name, stripInternalInput(call.arguments));
          const output = await tool.execute(ctx, validInput);
          await recordExecutedAction(ctx, sessionId, tool.schema.name, validInput, output, "SUCCEEDED");
          if (tool.mutating) {
            await recordAudit({
              actorType: "AGENT",
              action: `agent.${tool.schema.name}`,
              summary: `Agent executed ${tool.schema.name} automatically (autonomy: ${settings.autonomy_level})`,
              meta: { input: call.arguments },
            });
          }
          await recordRunEvent(ctx, runId, {
            type: "TOOL_COMPLETED",
            label: toolLabel,
            toolName: tool.schema.name,
            status: "SUCCESS",
            meta: { durationMs: Date.now() - toolStarted, ...summarizeForEvent(output) },
          });
          if (PUBLISH_INTENT_TOOLS.has(tool.schema.name)) {
            lastPublishOutcome = describePublishAttempt(tool.schema.name, output);
          }
          messages.push({ role: "tool", content: serializeToolOutput(output, tool.outputBudget, tool.schema.name), toolCallId: call.id, toolName: call.name });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "tool execution failed";
          await recordExecutedAction(ctx, sessionId, tool.schema.name, call.arguments, null, "FAILED", errorMessage);
          await recordRunEvent(ctx, runId, {
            type: "TOOL_FAILED",
            label: toolLabel,
            toolName: tool.schema.name,
            status: "FAILED",
            meta: { durationMs: Date.now() - toolStarted, reason: errorMessage },
          });
          if (PUBLISH_INTENT_TOOLS.has(tool.schema.name)) {
            lastPublishOutcome = { succeeded: false, note: `Publishing failed: ${errorMessage}. No post was created.`, receipt: {} };
          }
          messages.push({ role: "tool", content: `Error: ${errorMessage}`, toolCallId: call.id, toolName: call.name });
        }
      }
    }

    // Outcome-aware completion: a publish mission that did not prove a live
    // publication this turn must never be reported as "Done."/"Posted."/
    // "Published." — replace only an empty reply or a bare success template
    // with the tool-derived truth, and never touch a longer, already-honest
    // model reply (see Section 10/13 of the integrity brief).
    // Deterministic persisted-data backstop: if the provider prepared real
    // variants but omitted final schedule tool calls, construct the manual
    // approval actions from those successful variant records. The artifact
    // renderer therefore depends on stored Social data, not model Markdown.
    if (creativeRequestMode === "EXECUTE" && !proposedActions.some((action) => PUBLISH_INTENT_TOOLS.has(action.tool))) {
      const detail = await getSessionDetail(ctx, sessionId);
      const variants: Array<{ id: string; platform: string }> = [];
      for (const action of detail.actions) {
        if (action.tool_name !== "create_content_variant" || action.status !== "SUCCEEDED") continue;
        const output = action.output;
        let id: string | null = null;
        let platformRaw: unknown = action.input?.platform;
        if (typeof output === "string") {
          id = output;
        } else if (output && typeof output === "object" && typeof (output as { id?: unknown }).id === "string") {
          id = (output as { id: string }).id;
          platformRaw = (output as { platform?: unknown }).platform ?? platformRaw;
        }
        if (!id) continue;
        variants.push({
          id,
          platform: typeof platformRaw === "string" ? platformRaw.toLowerCase() : "",
        });
      }
      for (const variant of variants) {
        const platform = variant.platform;
        const slot = weekSlots?.[Math.min(weekSlotCursor, Math.max(weekSlots.length - 1, 0))];
        if (weekSlots) weekSlotCursor += 1;
        const input: Record<string, unknown> = {
          variantId: variant.id,
          platform,
          recommendationTier: platform === "facebook" ? "optional" : "recommended",
          recommendationReason: platform === "facebook" ? "Useful as an optional secondary destination." : "Strong fit for this prepared creative and brand context.",
          reviewId: activeReviewId,
          revision: reviewRevision,
          missionId: sessionId,
          sessionId,
          ...(slot
            ? {
                scheduledAt: slot.scheduledAtIso,
                timeZone: slot.timeZone,
                wallClockLabel: slot.wallClockLabel,
                scheduleSource: slot.scheduleSource,
                requiresFutureSchedule: true,
              }
            : {}),
        };
        if (weekSlots && !slot?.scheduledAtIso) continue;
        const id = await proposeAction(ctx, sessionId, "schedule_post", input);
        if (id) proposedActions.push({ id, tool: "schedule_post", input });
      }
    }

    const hasPublishArtifact = proposedActions.some((action) => PUBLISH_INTENT_TOOLS.has(action.tool));
    if (creativeRequestMode === "EXECUTE" && !hasPublishArtifact) {
      const safeFailure = "We couldn’t prepare the review artifact. Please retry.";
      await insertMessage(ctx, sessionId, "AGENT", safeFailure);
      await setSessionStatus(ctx, sessionId, "ATTENTION_REQUIRED");
      await recordRunEvent(ctx, runId, { type: "RUN_FAILED", label: "Review artifact needs attention", status: "FAILED", meta: { reason: "persisted_publish_artifact_missing" } });
      await completeRun(ctx, runId, "FAILED", "persisted publish artifact missing");
      return { blocked: false as const, failed: true as const, text: safeFailure, proposedActions: [], runId, reason: "review_artifact_missing" };
    }

    const BARE_SUCCESS_CLAIM = /^(done|posted|published)\.?$/i;
    let responseText = finalText;
    if (lastPublishOutcome) {
      const trimmed = responseText.trim();
      if (!trimmed || (!lastPublishOutcome.succeeded && BARE_SUCCESS_CLAIM.test(trimmed))) {
        responseText = lastPublishOutcome.note;
      }
    } else if (!responseText.trim()) {
      responseText = "Done.";
    }
    if (hasPublishArtifact) responseText = "Prepared for review.";
    responseText = sanitizeUserFacingText(responseText);

    const parts: Array<Record<string, unknown>> = [];
    if (proposedActions.length) parts.push({ type: "proposed_actions", actions: proposedActions });
    if (hasPublishArtifact) {
      const review = await loadCurrentReviewArtifact(ctx, sessionId);
      if (review) {
        parts.unshift(reviewArtifactMessagePart(review));
        responseText = narrativeFromReview(review);
      }
    }
    if (lastPublishOutcome?.succeeded && lastPublishOutcome.receipt.permalink) {
      parts.push({ type: "publish_receipt", ...lastPublishOutcome.receipt });
    }
    await insertMessage(ctx, sessionId, "AGENT", responseText, parts);
    const terminalSessionStatus = lastPublishOutcome && !lastPublishOutcome.succeeded
      ? "ATTENTION_REQUIRED"
      : proposedActions.length
        ? "WAITING_FOR_CHOICE"
        : "IDLE";
    await setSessionStatus(ctx, sessionId, terminalSessionStatus);
    // A mission's terminal event reflects whether the user's requested
    // outcome was actually achieved, not just that the run executed without
    // crashing — a failed publish attempt must never look like a clean
    // success in the trace.
    const missionOutcome = lastPublishOutcome
      ? (lastPublishOutcome.succeeded ? "COMPLETED" : "FAILED")
      : proposedActions.length
        ? "WAITING_FOR_APPROVAL"
        : "COMPLETED";
    await recordRunEvent(ctx, runId, {
      type: "RUN_COMPLETED",
      label: PHASE_LABELS.RUN_COMPLETED,
      status: missionOutcome === "FAILED" ? "FAILED" : "SUCCESS",
      meta: { missionOutcome, intent: copilotIntent },
    });
    await completeRun(ctx, runId, "COMPLETED");

    return { blocked: false as const, failed: false as const, text: responseText, proposedActions, runId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Agent run failed unexpectedly.";
    await recordRunEvent(ctx, runId, { type: "RUN_FAILED", label: PHASE_LABELS.RUN_FAILED, status: "FAILED", meta: { reason: errorMessage } });
    await completeRun(ctx, runId, "FAILED", errorMessage);
    await insertMessage(ctx, sessionId, "AGENT", `I hit an error and couldn't finish: ${errorMessage}`);
    await setSessionStatus(ctx, sessionId, "FAILED");
    return { blocked: false as const, failed: true as const, text: "", proposedActions: [], runId, reason: errorMessage };
  }
}

/**
 * Executes a human-approved action and — for a publish-intent tool — closes
 * the loop the direct "post now" turn loop already closes: determine the
 * REAL outcome (via the exact same publish-outcome-classify module, so the
 * two paths can never diverge on wording), write it into the run's
 * telemetry, and insert an honest Copilot chat message reporting it. Before
 * this fix, approving a publish action executed it but the conversation
 * never learned what actually happened — a known, explicitly flagged PR #15
 * gap (Section 11 of the follow-up brief).
 */
export async function approveAgentAction(ctx: OwnerContext, actionId: string) {
  const action = await getAction(ctx, actionId);
  if (!action) throw new Error("action not found");
  if (action.status === "SUPERSEDED") {
    throw new Error("This review was superseded. Approve the current review instead.");
  }

  const tool = getTool(action.tool_name);
  if (!tool) throw new Error(`unknown tool: ${action.tool_name}`);

  const run = action.session_id ? await getLatestRun(ctx, action.session_id) : null;
  const isPublishIntent = PUBLISH_INTENT_TOOLS.has(action.tool_name);

  // Trust hard gate + workforce binding before claim/execute.
  if (isPublishIntent) {
    const brand = await getBrandProfile(ctx);
    const caption = typeof action.input?.caption === "string" ? action.input.caption : "";
    let variantCaption = caption;
    if (!variantCaption && typeof action.input?.variantId === "string") {
      const { data: variant } = await ctx.supabase
        .from("content_variants")
        .select("caption")
        .eq("id", action.input.variantId)
        .maybeSingle();
      variantCaption = typeof variant?.caption === "string" ? variant.caption : "";
    }
    const settings = await getAutomationSettings(ctx);
    const imageProvider = getImageProvider();
    const capabilityEvidence = buildProductCapabilityEvidence({
      shadowMode: settings.shadow_mode !== false,
      dryRun: process.env.SOCIAL_DRY_RUN === "1",
      socialPublishExecutable: settings.shadow_mode === false,
      imageGenerationStatus: resolveImageGenerationRuntimeStatus({
        providerConfigured: Boolean(imageProvider) && !(imageProvider instanceof BlockedImageProvider),
      }),
    });
    const trust = evaluateBrandTrustHardGate({
      caption: variantCaption,
      blockedPhrases: brand.voice?.blocked_phrases ?? [],
      forbiddenClaims: brand.voice?.forbidden_claims ?? [],
      capabilityEvidence,
      isSelfMarketing: /\bstratxcel\b/i.test(variantCaption),
    });
    if (!canShowApprovalControl(trust.decision)) {
      throw new Error(`Trust gate blocked approval (${trust.decision}): ${trust.reasons.join("; ") || "needs revision"}`);
    }

    const exactVersion = typeof action.input?.artifactVersion === "string"
      ? action.input.artifactVersion
      : typeof action.input?.revision === "number"
        ? `v${action.input.revision}`
        : undefined;
    const previewVersion = typeof action.input?.previewArtifactVersion === "string"
      ? action.input.previewArtifactVersion
      : exactVersion;
    if (previewVersion && exactVersion && previewVersion !== exactVersion) {
      throw new Error("Exact artifact version mismatch: preview revision does not match approval revision.");
    }

    const gate = decideManualPublishGate({
      explicitApprovalControl: true,
      actionId,
      shadowMode: settings.shadow_mode !== false,
      qualityStatus: trust.decision === "PASS" ? "PASS" : "REVISE",
      complianceStatus: trust.decision === "PASS" ? "PASS" : "REVISE",
      releaseReadiness: exactVersion
        ? { readyToRelease: trust.decision === "PASS", reviewedArtifactVersion: exactVersion }
        : undefined,
      exactArtifactVersion: exactVersion,
    });
    // Shadow still allows preparation execution through existing executor (simulated).
    // Hard trust/version failures must block.
    if (!gate.allowed && !gate.shadowBlocked) {
      throw new Error(`Publish gate blocked: ${gate.reason}`);
    }
  }

  if (!(await claimAgentAction(ctx, actionId, "EXECUTING"))) return { alreadyResolved: true };
  if (run) {
    await recordRunEvent(ctx, run.id, {
      type: "APPROVAL_APPROVED",
      label: `Approved — ${labelForTool(action.tool_name)}`,
      toolName: action.tool_name,
      status: "SUCCESS",
    });
    await recordRunEvent(ctx, run.id, {
      type: "TOOL_STARTED",
      label: labelForTool(action.tool_name),
      toolName: action.tool_name,
    });
  }
  try {
    const publicInput = stripInternalInput(action.input ?? {});
    const validInput = await validateBrandEntities(ctx, action.tool_name, publicInput);
    const output = await tool.execute(ctx, validInput);
    await updateActionStatus(ctx, actionId, "SUCCEEDED", { output });

    // Same classifier, same wording rules as runAgentTurn's lastPublishOutcome.
    const publishOutcome = isPublishIntent ? describePublishAttempt(action.tool_name, output) : null;

    if (run) {
      await recordRunEvent(ctx, run.id, {
        type: "TOOL_COMPLETED",
        label: labelForTool(action.tool_name),
        toolName: action.tool_name,
        status: "SUCCESS",
        meta: {
          ...summarizeForEvent(output),
          ...(publishOutcome ? { missionOutcome: publishOutcome.succeeded ? "COMPLETED" : "FAILED" } : {}),
        },
      });
    }
    for (const deferred of readDeferredActions(action.input ?? {})) {
      if (!action.session_id) continue;
      const boundInput = await validateBrandEntities(ctx, deferred.tool, {
        ...deferred.input,
        [deferred.bind.inputKey]: output,
      });
      const dependentId = await proposeAction(ctx, action.session_id, deferred.tool, boundInput);
      if (dependentId && run) {
        await recordRunEvent(ctx, run.id, {
          type: "APPROVAL_REQUIRED",
          label: labelForApproval(deferred.tool),
          toolName: deferred.tool,
          status: "PENDING",
        });
      }
    }
    await recordAudit({
      actorType: "AGENT",
      action: `agent.${action.tool_name}`,
      summary: `Agent action "${action.tool_name}" approved and executed`,
      meta: { input: action.input },
    });

    if (action.session_id) {
      if (publishOutcome) {
        const parts = publishOutcome.succeeded && publishOutcome.receipt.permalink
          ? [{ type: "publish_receipt", ...publishOutcome.receipt }]
          : [];
        await insertMessage(ctx, action.session_id, "AGENT", publishOutcome.note, parts);
      }
      // Only return the session to READY once nothing else is still
      // awaiting a decision (e.g. a dependent action this approval just
      // created) — never leave it permanently stuck on "Waiting approval".
      if (!(await hasPendingActions(ctx, action.session_id))) {
        await setSessionStatus(ctx, action.session_id, "IDLE");
      }
    }
    return output;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "execution failed";
    await updateActionStatus(ctx, actionId, "FAILED", { reason: errorMessage });
    if (run) {
      await recordRunEvent(ctx, run.id, {
        type: "TOOL_FAILED",
        label: labelForTool(action.tool_name),
        toolName: action.tool_name,
        status: "FAILED",
        meta: { reason: errorMessage, ...(isPublishIntent ? { missionOutcome: "FAILED" } : {}) },
      });
    }
    if (action.session_id) {
      const failureNote = isPublishIntent
        ? `I couldn't publish this. ${errorMessage} The prepared draft is still available.`
        : `I couldn't complete "${labelForTool(action.tool_name)}". ${errorMessage}`;
      await insertMessage(ctx, action.session_id, "AGENT", failureNote);
      if (!(await hasPendingActions(ctx, action.session_id))) {
        await setSessionStatus(ctx, action.session_id, "ATTENTION_REQUIRED");
      }
    }
    throw err;
  }
}

export async function rejectAgentAction(ctx: OwnerContext, actionId: string) {
  const action = await getAction(ctx, actionId);
  if (!action) throw new Error("action not found");
  if (!(await claimAgentAction(ctx, actionId, "REJECTED"))) return { alreadyResolved: true };
  if (action.session_id) {
    const run = await getLatestRun(ctx, action.session_id);
    if (run) {
      await recordRunEvent(ctx, run.id, {
        type: "APPROVAL_REJECTED",
        label: `Rejected — ${labelForTool(action.tool_name)}`,
        toolName: action.tool_name,
        status: "FAILED",
      });
    }
    // Cancelling never publishes anything and never discards the prepared
    // work — the underlying content master/variant/media stay exactly as
    // they were, just unscheduled (see Section 9 of the follow-up brief).
    const cancelNote = PUBLISH_INTENT_TOOLS.has(action.tool_name)
      ? "Publishing cancelled. Nothing was published. Your prepared draft is still available."
      : `Cancelled — "${labelForTool(action.tool_name)}" was not performed.`;
    await insertMessage(ctx, action.session_id, "AGENT", cancelNote);
    if (!(await hasPendingActions(ctx, action.session_id))) {
      await setSessionStatus(ctx, action.session_id, "IDLE");
    }
  }
}
