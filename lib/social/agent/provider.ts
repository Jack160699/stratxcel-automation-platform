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
  readonly name: "openai" | "anthropic" | "google";
  readonly envKey: string;
  isConfigured(): boolean;
  complete(messages: AgentTurnMessage[], tools: ToolSchema[]): Promise<CompletionResult>;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * Builds the Chat Completions URL from OPENAI_BASE_URL, defaulting to
 * OpenAI itself so existing behavior is unchanged when the var is unset.
 * Exported so the endpoint construction (including trailing-slash
 * normalization) can be unit tested without mocking fetch. This is
 * intentionally generic — it never special-cases OpenRouter or any other
 * specific OpenAI-compatible vendor.
 */
export function resolveOpenAIChatCompletionsUrl(): string {
  const base = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

export interface EffectiveProviderIdentity {
  provider: string;
  protocol: string;
  model: string;
  configured: boolean;
}

export function resolveEffectiveProviderIdentity(): EffectiveProviderIdentity {
  const base = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).toLocaleLowerCase();
  if (process.env.OPENAI_API_KEY) {
    const provider = base.includes("openrouter.ai") ? "OpenRouter" : base.includes("api.openai.com") ? "OpenAI" : "OpenAI-compatible provider";
    return {
      provider,
      protocol: "OpenAI-compatible",
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini",
      configured: true,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "Anthropic",
      protocol: "Anthropic Messages",
      model: process.env.ANTHROPIC_AGENT_MODEL || "claude-haiku-4-5-20251001",
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
        model: process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini",
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

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly envKey = "ANTHROPIC_API_KEY";
  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }
  async complete(messages: AgentTurnMessage[], tools: ToolSchema[]): Promise<CompletionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_AGENT_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system,
        messages: rest.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic request failed: HTTP ${res.status}`);
    const json = await res.json();
    const blocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = json.content ?? [];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const toolCalls: ToolCallRequest[] = blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id!, name: b.name!, arguments: b.input ?? {} }));
    return { text, toolCalls };
  }
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const PROVIDERS: AIProvider[] = [new OpenAIProvider(), new AnthropicProvider()];

export function listProviders(): AIProvider[] {
  return PROVIDERS;
}

/** First configured provider in preference order, or null if none. */
export function resolveConfiguredProvider(): AIProvider | null {
  return PROVIDERS.find((p) => p.isConfigured()) ?? null;
}
