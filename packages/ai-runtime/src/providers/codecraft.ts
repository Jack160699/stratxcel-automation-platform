import { buildUsage } from "../catalog/costs.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import { ReadinessCache } from "../health/readiness.ts";
import type {
  AIMessage,
  AIProviderHealth,
  AIReasoningLevel,
  AITextProviderAdapter,
  AIToolCall,
  AIToolSchema,
  FetchLike,
} from "../types.ts";

export interface CodeCraftAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  readinessCache?: ReadinessCache;
  tokenLimit?: number;
}

export function toCodeCraftMessages(messages: readonly AIMessage[]): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  return messages.map((m) => {
    const role =
      m.role === "developer" || m.role === "system"
        ? ("system" as const)
        : m.role === "assistant"
        ? ("assistant" as const)
        : ("user" as const);
    return {
      role,
      content: m.content || "",
    };
  });
}

export class CodeCraftTextProvider implements AITextProviderAdapter {
  readonly provider = "codecraft" as const;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly readinessCache: ReadinessCache;
  private readonly tokenLimit: number;
  private cumulativeTokens: number = 0;

  constructor(options: CodeCraftAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.CODECRAFT_API_KEY;
    this.baseUrl = (options.baseUrl ?? process.env.CODECRAFT_BASE_URL ?? "https://codecraftapi.com/v1").replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readinessCache = options.readinessCache ?? new ReadinessCache();
    const envLimit = process.env.CODECRAFT_TEST_TOKEN_LIMIT
      ? parseInt(process.env.CODECRAFT_TEST_TOKEN_LIMIT, 10)
      : NaN;
    this.tokenLimit = Number.isFinite(options.tokenLimit)
      ? options.tokenLimit!
      : Number.isFinite(envLimit)
      ? envLimit
      : 100_000;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getCumulativeTokens(): number {
    return this.cumulativeTokens;
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
    if (!this.apiKey) {
      throw new AIProviderError("NOT_CONFIGURED", "CODECRAFT_API_KEY not configured");
    }

    if (this.cumulativeTokens >= this.tokenLimit) {
      throw new AIProviderError(
        "BUDGET_EXHAUSTED",
        `CodeCraft safety token ceiling exceeded: ${this.cumulativeTokens} >= ${this.tokenLimit}`,
      );
    }

    const tools: Array<Record<string, unknown>> = [];
    if (args.tools?.length) {
      for (const tool of args.tools) {
        tools.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        });
      }
    }

    const payload: Record<string, unknown> = {
      model: args.model,
      messages: toCodeCraftMessages(args.messages),
      temperature: 0.7,
    };

    if (tools.length) payload.tools = tools;
    if (args.structuredOutputSchema) {
      payload.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const onAbort = () => controller.abort();
    args.abortSignal?.addEventListener("abort", onAbort);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let message = `CodeCraft HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) message = parsed.error.message;
        } catch {
          if (errorText) message += `: ${errorText.slice(0, 100)}`;
        }
        throw new AIProviderError(classifyHttpStatus(response.status), message, response.status);
      }

      const json = (await response.json()) as {
        id?: string;
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: {
                name?: string;
                arguments?: string;
              };
            }>;
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? "";

      const toolCalls: AIToolCall[] = [];
      for (const tc of choice?.message?.tool_calls ?? []) {
        if (tc.function?.name) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
          } catch {
            parsedArgs = {};
          }
          toolCalls.push({
            id: tc.id ?? crypto.randomUUID(),
            name: tc.function.name,
            arguments: parsedArgs,
          });
        }
      }

      let structuredOutput: unknown;
      if (args.structuredOutputSchema && text) {
        try {
          structuredOutput = JSON.parse(text);
        } catch {
          structuredOutput = undefined;
        }
      }

      const promptTokens = json.usage?.prompt_tokens ?? 0;
      const completionTokens = json.usage?.completion_tokens ?? 0;
      const totalTokens = json.usage?.total_tokens ?? promptTokens + completionTokens;
      this.cumulativeTokens += totalTokens;

      const usage = buildUsage({
        model: args.model,
        inputTokens: promptTokens,
        cachedInputTokens: 0,
        outputTokens: completionTokens,
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
        throw new AIProviderError("TIMEOUT", "CodeCraft request timeout");
      }
      throw new AIProviderError("TRANSIENT", err instanceof Error ? err.message : "CodeCraft network failure");
    } finally {
      clearTimeout(timer);
      args.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  async probeReadiness(model?: string): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">> {
    const cacheKey = `codecraft:${model ?? "default"}`;
    const cached = this.readinessCache.get(cacheKey);
    if (cached) return cached;

    const now = new Date().toISOString();
    if (!this.apiKey) {
      const result = {
        configured: false,
        reachable: false,
        modelAvailable: false,
        lastCheckedAt: now,
        safeErrorCode: "CODECRAFT_NOT_CONFIGURED",
      };
      this.readinessCache.set(cacheKey, result);
      return result;
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const result = {
          configured: true,
          reachable: response.status < 500,
          modelAvailable: false,
          lastCheckedAt: now,
          safeErrorCode: `CODECRAFT_HTTP_${response.status}`,
        };
        this.readinessCache.set(cacheKey, result);
        return result;
      }

      const json = (await response.json()) as { data?: Array<{ id: string }> };
      const modelAvailable = model
        ? (json.data ?? []).some((m) => m.id === model)
        : (json.data?.length ?? 0) > 0;

      const result = {
        configured: true,
        reachable: true,
        modelAvailable,
        lastCheckedAt: now,
        safeErrorCode: null,
      };
      this.readinessCache.set(cacheKey, result);
      return result;
    } catch {
      const result = {
        configured: true,
        reachable: false,
        modelAvailable: false,
        lastCheckedAt: now,
        safeErrorCode: "CODECRAFT_NETWORK_FAILURE",
      };
      this.readinessCache.set(cacheKey, result);
      return result;
    }
  }
}
