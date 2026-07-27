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
import { resolveConfiguredProvider } from "./provider";
import { getTool, toolSchemas, type AgentTool } from "./tools";
import type { AgentTurnMessage } from "./provider";
import type { OwnerContext } from "../db-context";

const SYSTEM_PROMPT = `You are the Stratxcel Social Autopilot Agent — an operational copilot for Stratxcel's own
Instagram, Facebook, Threads, LinkedIn, and YouTube presence. You plan, draft, schedule, and analyze
social content using the tools available to you. Ground every content decision in Brand Brain
(call inspect_brand first if you haven't already this session). Ask a short clarifying question
instead of guessing when the goal is ambiguous. Never claim an action succeeded unless a tool call
actually returned success. Keep responses concise and operational, not hype-y.`;

const MAX_TOOL_ROUNDS = 4;

export async function createAgentSession(ctx: OwnerContext, title: string | null) {
  return createSessionRepo(ctx, title);
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
export async function runAgentTurn(ctx: OwnerContext, sessionId: string, userText: string) {
  await insertMessage(ctx, sessionId, "USER", userText);

  const provider = resolveConfiguredProvider();
  if (!provider) {
    const message =
      "No AI provider is configured yet, so I can't plan or generate content. " +
      "Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Integrations → AI Providers and I'll pick it up automatically. " +
      "I can still run direct tools for you if you ask a specific yes/no operational question through the UI.";
    await insertMessage(ctx, sessionId, "AGENT", message);
    await setSessionStatus(ctx, sessionId, "BLOCKED");
    return { blocked: true as const, reason: "ai_not_configured", message };
  }

  const settings = await getAutomationSettings(ctx);
  const history = await loadHistory(ctx, sessionId);
  const roleMap: Record<string, AgentTurnMessage["role"]> = { USER: "user", AGENT: "assistant", SYSTEM: "system" };
  const messages: AgentTurnMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: roleMap[m.role] ?? "user", content: m.content })),
  ];

  await setSessionStatus(ctx, sessionId, "GENERATING");

  const proposedActions: Array<{ id: string; tool: string; input: Record<string, unknown> }> = [];
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await provider.complete(messages, toolSchemas());
    if (result.text) finalText = result.text;

    if (result.toolCalls.length === 0) break;

    for (const call of result.toolCalls) {
      const tool: AgentTool | undefined = getTool(call.name);
      if (!tool) {
        messages.push({ role: "tool", content: `Unknown tool: ${call.name}`, toolCallId: call.id, toolName: call.name });
        continue;
      }

      const needsApproval = tool.mutating && requiresApproval(tool.schema.name, settings, 0.75);

      if (needsApproval) {
        const actionId = await proposeAction(ctx, sessionId, tool.schema.name, call.arguments);
        if (actionId) proposedActions.push({ id: actionId, tool: tool.schema.name, input: call.arguments });
        messages.push({
          role: "tool",
          content: `Action "${tool.schema.name}" requires approval and has been queued (not executed).`,
          toolCallId: call.id,
          toolName: call.name,
        });
        continue;
      }

      try {
        const output = await tool.execute(ctx, call.arguments);
        await recordExecutedAction(ctx, sessionId, tool.schema.name, call.arguments, output, "SUCCEEDED");
        if (tool.mutating) {
          await recordAudit({
            actorType: "AGENT",
            action: `agent.${tool.schema.name}`,
            summary: `Agent executed ${tool.schema.name} automatically (autonomy: ${settings.autonomy_level})`,
            meta: { input: call.arguments },
          });
        }
        messages.push({ role: "tool", content: JSON.stringify(output).slice(0, 4000), toolCallId: call.id, toolName: call.name });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "tool execution failed";
        await recordExecutedAction(ctx, sessionId, tool.schema.name, call.arguments, null, "FAILED", errorMessage);
        messages.push({ role: "tool", content: `Error: ${errorMessage}`, toolCallId: call.id, toolName: call.name });
      }
    }
  }

  const parts = proposedActions.length ? [{ type: "proposed_actions", actions: proposedActions }] : [];
  await insertMessage(ctx, sessionId, "AGENT", finalText || "Done.", parts);
  await setSessionStatus(ctx, sessionId, proposedActions.length ? "WAITING_FOR_CHOICE" : "READY");

  return { blocked: false as const, text: finalText, proposedActions };
}

export async function approveAgentAction(ctx: OwnerContext, actionId: string) {
  const action = await getAction(ctx, actionId);
  if (!action) throw new Error("action not found");

  const tool = getTool(action.tool_name);
  if (!tool) throw new Error(`unknown tool: ${action.tool_name}`);

  await updateActionStatus(ctx, actionId, "EXECUTING");
  try {
    const output = await tool.execute(ctx, action.input ?? {});
    await updateActionStatus(ctx, actionId, "SUCCEEDED", { output });
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
    throw err;
  }
}

export async function rejectAgentAction(ctx: OwnerContext, actionId: string) {
  await updateActionStatus(ctx, actionId, "REJECTED");
}
