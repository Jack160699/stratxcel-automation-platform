import type { ToolSchema } from "./tools/contract.ts";

/**
 * Channel-independent LLM provider contract. Structurally compatible with
 * lib/social/agent/provider.ts's AgentTurnMessage/ToolCallRequest/
 * CompletionResult shapes (same field names) so a thin adapter around the
 * EXISTING configured provider (resolveConfiguredProvider() in that file)
 * can implement this interface without agent-core importing app-side code —
 * see lib/agent-core/provider-adapter.ts in the Next.js app for that adapter.
 *
 * The existing Gemini adapter supports live function calls and ordered,
 * multi-round tool-result conversations. Deterministic security/session
 * commands still bypass the model entirely.
 */
export interface AgentTurnMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCallRequest[];
}

export interface AgentLLMProvider {
  isConfigured(): boolean;
  complete(messages: AgentTurnMessage[], tools: ToolSchema[]): Promise<CompletionResult>;
}
