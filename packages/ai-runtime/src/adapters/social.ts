import type { AIExecutionRequest, AIExecutionResult, AIMessage, AITaskClass, AIToolSchema } from "../types.ts";
import { resolveDepartmentTaskClass } from "../policy/department-map.ts";
import { getAIRuntime, type AIRuntimeDeps } from "../runtime.ts";

/**
 * Social Copilot → AI Runtime bridge.
 * Preserves AgentTurnMessage / tool schemas while routing via central policy.
 * Gemini platform-data boundary sanitize is applied by the caller before messages reach here
 * (or via GeminiTextProvider.applySocialBoundarySanitize).
 */
export interface SocialTurnInput {
  tenantId: string;
  missionId?: string | null;
  sessionHint?: "operations" | "creation" | "strategy";
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
    toolName?: string;
  }>;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  budgetEnvelope?: AIExecutionRequest["budgetEnvelope"];
}

export function resolveSocialTaskClass(hint?: SocialTurnInput["sessionHint"]): AITaskClass {
  return resolveDepartmentTaskClass("social", hint);
}

export async function executeSocialTurn(
  input: SocialTurnInput,
  deps?: AIRuntimeDeps,
): Promise<AIExecutionResult> {
  const taskClass = resolveSocialTaskClass(input.sessionHint);
  const messages: AIMessage[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
    toolCallId: m.toolCallId,
    toolName: m.toolName,
  }));
  const tools: AIToolSchema[] | undefined = input.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  return getAIRuntime(deps).execute({
    tenantId: input.tenantId,
    missionId: input.missionId,
    department: "social",
    taskClass,
    messages,
    tools,
    budgetEnvelope: input.budgetEnvelope,
  });
}
