import type { ServiceClient } from "./db.ts";
import type { AgentPrincipal } from "./principal.ts";
import type { AgentLLMProvider, AgentTurnMessage } from "./provider.ts";
import { resolveAgentTools, toolSchemas, type AgentTool } from "./tools/registry.ts";
import { decideMutationPolicy } from "./policy/channel-policy.ts";
import { createActionConfirmation } from "./confirmations/repository.ts";
import {
  getOrCreateActiveSession,
  recordAgentMessage,
  startAgentRun,
  completeAgentRun,
  recordRunEvent,
  incrementToolCallCount,
  loadSessionMessages,
} from "./sessions/repository.ts";
import { auditAgentRun, auditToolInvocation, auditConfirmationProposed, auditFailedAction } from "./audit.ts";
import { summarizeToolResult, formatAgentReply, formatConfirmationPrompt } from "./formatter.ts";
import { buildBrainContext } from "./brain/context-builder.ts";

const MAX_TOOL_ROUNDS = 4;
const CONFIRMATION_TTL_MINUTES = 10;

/** PHASE 22: deterministic, channel-agnostic failure text for a linked
 *  principal. Never falls back to prospect/sales behavior for a linked
 *  principal — that fallback only exists for genuinely unlinked senders,
 *  handled entirely outside this module (see the worker router). */
const AGENT_UNAVAILABLE_TEXT =
  "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard.";

export interface RunAgentTurnInput {
  supabase: ServiceClient;
  principal: AgentPrincipal;
  provider: AgentLLMProvider;
  userText: string;
  /** WhatsApp Meta providerMessageId, for idempotent correlation. Omit for web channels. */
  providerMessageId?: string | null;
  /** App-layer-composed tools (e.g. social delegation) merged in alongside
   *  the built-in registries, still subject to the same permission filter. */
  extraTools?: AgentTool[];
}

export type RunAgentTurnStatus = "completed" | "failed" | "blocked" | "duplicate";

export interface RunAgentTurnResult {
  runId: string;
  sessionId: string;
  status: RunAgentTurnStatus;
  replyText: string;
  confirmationRequired: boolean;
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const { supabase, principal, provider } = input;

  const session = await getOrCreateActiveSession(supabase, principal);
  const runStart = await startAgentRun(supabase, {
    sessionId: session.id,
    channel: principal.channel,
    providerMessageId: input.providerMessageId ?? null,
  });

  if (runStart.outcome === "duplicate") {
    // PHASE 15 "WHATSAPP CORRELATION": redelivery of the same providerMessageId
    // must never re-invoke a tool or create a second confirmation.
    return {
      runId: runStart.run.id,
      sessionId: session.id,
      status: "duplicate",
      replyText: "",
      confirmationRequired: false,
    };
  }

  const runId = runStart.run.id;
  const priorHistory = await loadSessionMessages(supabase, session.id, 100);
  await recordAgentMessage(supabase, { sessionId: session.id, role: "user", content: input.userText });

  if (!provider.isConfigured()) {
    await completeAgentRun(supabase, runId, "failed", "provider_not_configured");
    await auditFailedAction(supabase, principal, { runId, reason: "provider_not_configured" });
    return {
      runId,
      sessionId: session.id,
      status: "failed",
      replyText: AGENT_UNAVAILABLE_TEXT,
      confirmationRequired: false,
    };
  }

  const tools = resolveAgentTools(principal, { extraTools: input.extraTools });
  const brain = await buildBrainContext({ supabase, principal, tools, history: priorHistory });
  const messages: AgentTurnMessage[] = [
    { role: "system", content: brain.systemPrompt },
    ...brain.history,
    { role: "user", content: input.userText },
  ];

  const toolSummaries: string[] = [];
  let finalText = "";
  let confirmationPending: { code: string; expiresAt: string } | null = null;
  let failureReason: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const completion = await provider.complete(messages, toolSchemas(tools));

      if (completion.toolCalls.length === 0) {
        finalText = completion.text;
        messages.push({ role: "assistant", content: completion.text });
        break;
      }

      messages.push({ role: "assistant", content: completion.text || "" });

      for (const call of completion.toolCalls) {
        // SECURITY: only ever invoke a tool that is in the principal-resolved
        // registry, looked up by exact name — never eval/invoke arbitrary
        // strings the model produced.
        const tool = tools.find((t) => t.schema.name === call.name);
        if (!tool) {
          messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: "error: unknown tool" });
          continue;
        }

        const decision = decideMutationPolicy(principal.channel, tool.risk);

        if (decision.action === "dashboard_only") {
          const note = `${tool.schema.name}: this action requires dashboard approval and was not executed here.`;
          toolSummaries.push(note);
          await recordRunEvent(supabase, {
            runId,
            eventType: "tool_blocked_dashboard_only",
            toolName: tool.schema.name,
            risk: tool.risk,
          });
          messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: "blocked: dashboard_only" });
          continue;
        }

        if (decision.action === "confirm_required") {
          const confirmation = await createActionConfirmation(supabase, {
            authUserId: principal.authUserId,
            channel: principal.channel,
            actionName: tool.schema.name,
            normalizedInput: call.arguments,
            agentRunId: runId,
          });
          await recordRunEvent(supabase, {
            runId,
            eventType: "confirmation_proposed",
            toolName: tool.schema.name,
            risk: tool.risk,
            metadata: { confirmationId: confirmation.id },
          });
          await auditConfirmationProposed(supabase, principal, {
            confirmationId: confirmation.id,
            actionName: tool.schema.name,
          });
          confirmationPending = { code: confirmation.code, expiresAt: confirmation.expiresAt };
          finalText = formatConfirmationPrompt({
            humanSummary: `Ready to run "${tool.schema.name}".`,
            code: confirmation.code,
            ttlMinutes: CONFIRMATION_TTL_MINUTES,
          });
          break; // stop processing further tool calls this round
        }

        // decision.action === "execute"
        const result = await tool.execute({ principal, supabase }, call.arguments);
        await incrementToolCallCount(supabase, runId);
        await recordRunEvent(supabase, {
          runId,
          eventType: "tool_invoked",
          toolName: tool.schema.name,
          risk: tool.risk,
        });
        await auditToolInvocation(supabase, principal, {
          runId,
          toolName: tool.schema.name,
          risk: tool.risk,
          mutating: tool.mutating,
        });
        const summary = summarizeToolResult(tool.schema.name, result);
        toolSummaries.push(summary);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result).slice(0, 2000),
        });
      }

      if (confirmationPending) break;
    }
  } catch (err) {
    failureReason = err instanceof Error ? err.message : "unknown_error";
  }

  const status: RunAgentTurnStatus = failureReason ? "failed" : confirmationPending ? "blocked" : "completed";
  const replyText = failureReason
    ? AGENT_UNAVAILABLE_TEXT
    : formatAgentReply({
        text: finalText,
        // Tool payloads are model context and audited telemetry, not a
        // second user-facing transcript. Fall back to privacy-safe summaries
        // only when the bounded loop produced no final synthesis.
        toolSummaries: !confirmationPending && !finalText.trim() ? toolSummaries : [],
      });

  await recordAgentMessage(supabase, { sessionId: session.id, role: "assistant", content: replyText });
  await completeAgentRun(supabase, runId, status, failureReason ?? undefined);
  await auditAgentRun(supabase, principal, { runId, status });
  if (failureReason) {
    await auditFailedAction(supabase, principal, { runId, reason: failureReason });
  }

  return { runId, sessionId: session.id, status, replyText, confirmationRequired: Boolean(confirmationPending) };
}
