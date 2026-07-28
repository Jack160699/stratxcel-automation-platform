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
  updateActionStatus,
} from "../repositories/agent";
import { startRun, completeRun, recordRunEvent, getLatestRun } from "../repositories/agent-runs";
import { resolveConfiguredProvider } from "./provider";
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
import {
  attachmentPart,
  bindAttachmentsToMessage,
  getAttachmentsByIds,
  listAttachmentsForMessages,
} from "../repositories/agent-attachments";

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

Ask a short clarifying question instead of guessing when the goal is ambiguous. Never claim an action
succeeded unless a tool call actually returned success. Media attachments include both an attachment ID
and a canonical media asset ID. Use those exact IDs with ingest_media / attach_media_to_content /
update_content_variant; never invent a storage URL or media ID. For private YouTube verification while
SHADOW is active, only use execute_private_youtube_verification when the user explicitly requested that
exact private upload. Keep responses concise and operational, not hype-y.`;

// Media publishing may require: attachment identity, content lookup, variant
// inspection, account selection, policy validation, then the final proposal.
// Keep the loop bounded, but leave enough room for those real prerequisites.
const MAX_TOOL_ROUNDS = 8;

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
  const provider = resolveConfiguredProvider();
  if (!provider) {
    const message =
      "No AI provider is configured yet, so I can't plan or generate content. " +
      "Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Integrations → AI Providers and I'll pick it up automatically. " +
      "I can still run direct tools for you if you ask a specific yes/no operational question through the UI.";
    await insertMessage(ctx, sessionId, "AGENT", message);
    await setSessionStatus(ctx, sessionId, "BLOCKED");
    await recordRunEvent(ctx, runId, { type: "RUN_FAILED", label: PHASE_LABELS.RUN_FAILED, status: "FAILED", meta: { reason: "AI provider not configured" } });
    await completeRun(ctx, runId, "FAILED", "AI provider not configured");
    return { blocked: true as const, reason: "ai_not_configured", message, runId };
  }

  const settings = await getAutomationSettings(ctx);
  const history = await loadHistory(ctx, sessionId);
  const attachments = await listAttachmentsForMessages(ctx, history.map((message) => message.id));
  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const group = attachmentsByMessage.get(attachment.message_id ?? "") ?? [];
    group.push(attachment);
    attachmentsByMessage.set(attachment.message_id ?? "", group);
  }
  const roleMap: Record<string, AgentTurnMessage["role"]> = { USER: "user", AGENT: "assistant", SYSTEM: "system" };
  const messages: AgentTurnMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((message) => {
      const messageAttachments = attachmentsByMessage.get(message.id) ?? [];
      const attachmentContext = messageAttachments.map((attachment) =>
        attachment.processing_status === "EXTRACTED" && attachment.extracted_text
          ? `\n\n[Attached file accessed: ${attachment.original_name}]\n${attachment.extracted_text}`
          : attachment.media_asset_id
            ? `\n\n[Attached media available to tools: ${attachment.original_name} (${attachment.mime_type}, ${attachment.size_bytes} bytes); attachmentId=${attachment.id}; mediaAssetId=${attachment.media_asset_id}]`
            : `\n\n[Attached file stored but not readable by this Agent: ${attachment.original_name} (${attachment.mime_type})]`
      ).join("");
      return { role: roleMap[message.role] ?? "user", content: `${message.content}${attachmentContext}` };
    }),
  ];

  await setSessionStatus(ctx, sessionId, "GENERATING");

  // Execution telemetry: a real, append-only trace of what this turn actually
  // did (provider round-trips, tool calls, approval gates) — never the
  // model's internal reasoning. See lib/social/repositories/agent-runs.ts.
  await recordRunEvent(ctx, runId, { type: "UNDERSTANDING_REQUEST", label: PHASE_LABELS.UNDERSTANDING_REQUEST });
  for (const attachment of attachments.filter((item) =>
    (item.processing_status === "EXTRACTED" && item.extracted_text) || item.media_asset_id
  )) {
    await recordRunEvent(ctx, runId, {
      type: "ATTACHMENT_ACCESSED",
      label: attachment.media_asset_id
        ? `Accessing media · ${attachment.original_name}`
        : `Reading attachment · ${attachment.original_name}`,
      status: "SUCCESS",
      meta: {
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        ...(attachment.media_asset_id ? { mediaAssetId: attachment.media_asset_id } : {}),
      },
    });
  }

  const proposedActions: Array<{ id: string; tool: string; input: Record<string, unknown> }> = [];
  let finalText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      await recordRunEvent(ctx, runId, { type: "PROVIDER_REQUEST_STARTED", label: PHASE_LABELS.PROVIDER_REQUEST_STARTED });
      const providerStarted = Date.now();
      const result = await provider.complete(messages, toolSchemas());
      await recordRunEvent(ctx, runId, {
        type: "PROVIDER_RESPONSE_RECEIVED",
        label: PHASE_LABELS.PROVIDER_RESPONSE_RECEIVED,
        status: "SUCCESS",
        meta: { durationMs: Date.now() - providerStarted },
      });
      if (result.text) finalText = result.text;

      if (result.toolCalls.length === 0) break;

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

        const needsApproval = tool.mutating && requiresApproval(tool.schema.name, settings, 0.75);

        if (needsApproval) {
          const dependents = deferredByUpstream.get(call.id) ?? [];
          const publicInput = await validateBrandEntities(ctx, tool.schema.name, stripInternalInput(call.arguments));
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
          messages.push({
            role: "tool",
            content: `Action "${tool.schema.name}" requires approval and has been queued (not executed).`,
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
          messages.push({ role: "tool", content: serializeToolOutput(output, tool.outputBudget), toolCallId: call.id, toolName: call.name });
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
          messages.push({ role: "tool", content: `Error: ${errorMessage}`, toolCallId: call.id, toolName: call.name });
        }
      }
    }

    const parts = proposedActions.length ? [{ type: "proposed_actions", actions: proposedActions }] : [];
    await insertMessage(ctx, sessionId, "AGENT", finalText || "Done.", parts);
    await setSessionStatus(ctx, sessionId, proposedActions.length ? "WAITING_FOR_CHOICE" : "READY");
    await recordRunEvent(ctx, runId, { type: "RUN_COMPLETED", label: PHASE_LABELS.RUN_COMPLETED, status: "SUCCESS" });
    await completeRun(ctx, runId, "COMPLETED");

    return { blocked: false as const, failed: false as const, text: finalText, proposedActions, runId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Agent run failed unexpectedly.";
    await recordRunEvent(ctx, runId, { type: "RUN_FAILED", label: PHASE_LABELS.RUN_FAILED, status: "FAILED", meta: { reason: errorMessage } });
    await completeRun(ctx, runId, "FAILED", errorMessage);
    await insertMessage(ctx, sessionId, "AGENT", `I hit an error and couldn't finish: ${errorMessage}`);
    await setSessionStatus(ctx, sessionId, "FAILED");
    return { blocked: false as const, failed: true as const, text: "", proposedActions: [], runId, reason: errorMessage };
  }
}

export async function approveAgentAction(ctx: OwnerContext, actionId: string) {
  const action = await getAction(ctx, actionId);
  if (!action) throw new Error("action not found");

  const tool = getTool(action.tool_name);
  if (!tool) throw new Error(`unknown tool: ${action.tool_name}`);

  const run = action.session_id ? await getLatestRun(ctx, action.session_id) : null;
  await updateActionStatus(ctx, actionId, "EXECUTING");
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
    if (run) {
      await recordRunEvent(ctx, run.id, {
        type: "TOOL_COMPLETED",
        label: labelForTool(action.tool_name),
        toolName: action.tool_name,
        status: "SUCCESS",
        meta: summarizeForEvent(output),
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
        meta: { reason: errorMessage },
      });
    }
    throw err;
  }
}

export async function rejectAgentAction(ctx: OwnerContext, actionId: string) {
  const action = await getAction(ctx, actionId);
  await updateActionStatus(ctx, actionId, "REJECTED");
  if (action?.session_id) {
    const run = await getLatestRun(ctx, action.session_id);
    if (run) {
      await recordRunEvent(ctx, run.id, {
        type: "APPROVAL_REJECTED",
        label: `Rejected — ${labelForTool(action.tool_name)}`,
        toolName: action.tool_name,
        status: "FAILED",
      });
    }
  }
}
