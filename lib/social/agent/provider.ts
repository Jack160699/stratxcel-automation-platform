/**
 * AI provider adapter. Each provider implements the same shape so the Agent
 * orchestrator never branches on "which vendor" — it only ever calls
 * `complete()`. Nothing here fabricates a response: if the required env var
 * is absent, `resolveConfiguredProvider()` returns null and the orchestrator
 * is responsible for saying so honestly instead of pretending to think.
 */

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

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

export interface AIProvider {
  readonly name: "openai";
  readonly envKey: string;
  isConfigured(): boolean;
  complete(messages: AgentTurnMessage[], tools: ToolSchema[]): Promise<CompletionResult>;
}

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

/**
 * Returns the fixed official endpoint. Environment configuration cannot
 * redirect Copilot traffic to an OpenAI-compatible intermediary.
 */
export function resolveOpenAIChatCompletionsUrl(): string {
  return OPENAI_CHAT_COMPLETIONS_URL;
}

export function resolveOpenAIModel(): string {
  return OPENAI_MODEL;
}

export interface EffectiveProviderIdentity {
  provider: string;
  protocol: string;
  model: string;
  configured: boolean;
}

export function resolveEffectiveProviderIdentity(): EffectiveProviderIdentity {
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "OpenAI",
      protocol: "OpenAI API",
      model: OPENAI_MODEL,
      configured: true,
    };
  }
  return { provider: "Not configured", protocol: "—", model: "—", configured: false };
}

class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly envKey = "OPENAI_API_KEY";
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async complete(messages: AgentTurnMessage[], tools: ToolSchema[]): Promise<CompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const res = await fetch(resolveOpenAIChatCompletionsUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolveOpenAIModel(),
        messages: messages.map((m) => ({ role: m.role === "tool" ? "tool" : m.role, content: m.content, tool_call_id: m.toolCallId })),
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI request failed: HTTP ${res.status}`);
    const json = await res.json();
    const choice = json.choices?.[0]?.message;
    const toolCalls: ToolCallRequest[] = (choice?.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParseJson(tc.function.arguments),
    }));
    return { text: choice?.content ?? "", toolCalls };
  }
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const PROVIDERS: AIProvider[] = [new OpenAIProvider()];

export function listProviders(): AIProvider[] {
  return PROVIDERS;
}

/** First configured provider in preference order, or null if none. */
export function resolveConfiguredProvider(): AIProvider | null {
  return PROVIDERS.find((p) => p.isConfigured()) ?? null;
}
