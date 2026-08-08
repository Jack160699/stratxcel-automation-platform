import type { ToolSchema } from "./tools/contract.ts";

/**
 * Channel-independent LLM provider contract. Structurally compatible with
 * lib/social/agent/provider.ts's AgentTurnMessage/ToolCallRequest/
 * CompletionResult shapes (same field names) so a thin adapter around the
 * EXISTING configured provider (resolveConfiguredProvider() in that file)
 * can implement this interface without agent-core importing app-side code —
 * see lib/agent-core/provider-adapter.ts in the Next.js app for that adapter.
 *
 * KNOWN LIMITATION (documented, not hidden): the current concrete Gemini
 * provider behind lib/social/agent/provider.ts does not yet perform live
 * tool-calling round-trips — its complete() always returns toolCalls: [].
 * The orchestrator below is written generically against this interface so
 * that once a tool-calling-capable provider is wired in, no orchestrator
 * change is required; until then, non-deterministic (LLM) turns answer in
 * text only and do not invoke tools. Deterministic commands (LINK, WHOAMI,
 * CONFIRM, etc. — see command-parser.ts) never depend on this at all.
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
