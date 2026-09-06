import { buildUsage } from "../catalog/costs.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import { probeOpenRouterReadiness, ReadinessCache } from "../health/readiness.ts";
import type {
  AIMessage,
  AIReasoningLevel,
  AITextProviderAdapter,
  AIToolCall,
  AIToolSchema,
  FetchLike,
} from "../types.ts";

/**
 * Adapter for OpenRouter (https://openrouter.ai) — a real, opt-in resource
 * pool per the master brief's "Resource/Quota Manager" section, distinct
 * from StratExcel's business-decision model routing: OpenRouter itself never
 * decides which task/agent/tool runs, it is just another candidate a
 * routing policy may select for suitable low-cost/free work.
 *
 * Wire contract confirmed LIVE against OpenRouter's own published API
 * reference on 2026-09-07 (not recalled from training data):
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Authorization: Bearer <OPENROUTER_API_KEY>
 *   Body: { model, messages: [{role, content}], tools?, max_tokens? }
 *   -> 200 { choices: [{ message: { role, content, tool_calls? } }],
 *            usage: { prompt_tokens, completion_tokens, total_tokens } }
 *   Standard OpenAI-compatible Chat Completions shape (tools/tool_calls use
 *   the classic { type: "function", function: { name, arguments } } form —
 *   NOT the newer Responses API shape ai-runtime's own OpenAITextProvider
 *   uses for api.openai.com). 401 = missing/invalid key, 402 = insufficient
 *   credits, 429 = rate limited (all confirmed from OpenRouter's own docs).
 *
 * Opt-in only, mirroring providers/local-ai.ts's own pattern exactly: never
 * selected by any task-class routing policy unless OPENROUTER_ENABLED is
 * explicitly set (see policy/task-policies.ts's isOpenRouterRoutingEnabled),
 * so adding this file changes zero existing production behavior until a
 * deliberate opt-in.
 */
export interface OpenRouterAdapterOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  readinessCache?: ReadinessCache;
}

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterToolCallRaw {
  id?: string;
  function?: { name?: string; arguments?: string };
}

function parseToolCalls(raw: OpenRouterToolCallRaw[] | undefined): AIToolCall[] {
  if (!raw?.length) return [];
  const calls: AIToolCall[] = [];
  for (const call of raw) {
    if (!call.function?.name) continue;
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
    } catch {
      parsedArgs = {};
    }
    calls.push({ id: call.id ?? crypto.randomUUID(), name: call.function.name, arguments: parsedArgs });
  }
  return calls;
}

export class OpenRouterTextProvider implements AITextProviderAdapter {
  readonly provider = "openrouter" as const;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly readinessCache: ReadinessCache;

  constructor(options: OpenRouterAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readinessCache = options.readinessCache ?? new ReadinessCache();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(args: {
    model: string;
    messages: readonly AIMessage[];
    tools?: readonly AIToolSchema[];
    reasoningLevel: AIReasoningLevel;
    structuredOutputSchema?: Record<string, unknown>;
    enableWebSearch?: boolean;
    enableGoogleSearchGrounding?: boolean;
    timeoutMs: number;
    abortSignal?: AbortSignal;
  }) {
    if (!this.apiKey) throw new AIProviderError("NOT_CONFIGURED", "OPENROUTER_API_KEY not configured");

    // args.reasoningLevel is intentionally not forwarded: OpenRouter's
    // chat/completions contract has no dedicated reasoning-effort field
    // (confirmed against its published API reference) — a documented no-op
    // rather than a silently-invented request parameter.

    const tools = args.tools?.length
      ? args.tools.map((tool) => ({
          type: "function",
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        }))
      : undefined;

    const body: Record<string, unknown> = {
      model: args.model,
      messages: args.messages.map((m) => ({
        role: m.role === "developer" ? "system" : m.role,
        content: m.content,
        ...(m.role === "tool" ? { tool_call_id: m.toolCallId } : {}),
      })),
      ...(tools ? { tools } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const onAbort = () => controller.abort();
    args.abortSignal?.addEventListener("abort", onAbort);

    try {
      const response = await this.fetchImpl(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // OpenRouter's own documented vocabulary: 402 = insufficient
        // credits (maps to CREDIT, distinct from a generic 4xx).
        const category = response.status === 402 ? "CREDIT" : classifyHttpStatus(response.status);
        throw new AIProviderError(category, `OpenRouter HTTP ${response.status}`, response.status);
      }

      const json = (await response.json()) as {
        id?: string;
        choices?: Array<{ message?: { content?: string; tool_calls?: OpenRouterToolCallRaw[] } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const message = json.choices?.[0]?.message;
      const text = message?.content ?? "";
      const toolCalls = parseToolCalls(message?.tool_calls);

      let structuredOutput: unknown;
      if (args.structuredOutputSchema && text) {
        try {
          structuredOutput = JSON.parse(text);
        } catch {
          structuredOutput = undefined;
        }
      }

      const usage = buildUsage({
        model: args.model,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      });

      return {
        text,
        structuredOutput,
        toolCalls,
        usage,
        providerRequestId: json.id ?? null,
        safetyRefused: false,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError("TIMEOUT", "OpenRouter request timeout");
      }
      throw new AIProviderError("TRANSIENT", err instanceof Error ? err.message : "OpenRouter network failure");
    } finally {
      clearTimeout(timer);
      args.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  async probeReadiness(model?: string) {
    return probeOpenRouterReadiness({
      apiKey: this.apiKey,
      model,
      fetchImpl: this.fetchImpl,
      cache: this.readinessCache,
    });
  }
}
