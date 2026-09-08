import type {
  CodeCraftConfig,
  CodeCraftChatResponse,
  CodeCraftModelsResponse,
  CodeCraftMessage,
  CodeCraftTool,
  CodeCraftToolCall,
  CodeCraftUsage,
} from "./types.ts";

export class CodeCraftClient {
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  readonly tokenLimit: number;
  readonly timeoutMs: number;
  private cumulativeTokens: number = 0;

  constructor(config: CodeCraftConfig = {}) {
    this.baseUrl = (config.baseUrl || "https://codecraftapi.com/v1").replace(/\/+$/, "");
    this.apiKey = config.apiKey || process.env.CODECRAFT_API_KEY;

    const envLimit = process.env.CODECRAFT_TEST_TOKEN_LIMIT
      ? parseInt(process.env.CODECRAFT_TEST_TOKEN_LIMIT, 10)
      : NaN;
    this.tokenLimit = Number.isFinite(config.tokenLimit)
      ? config.tokenLimit!
      : Number.isFinite(envLimit)
      ? envLimit
      : 100000;

    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getCumulativeTokens(): number {
    return this.cumulativeTokens;
  }

  resetCumulativeTokens(): void {
    this.cumulativeTokens = 0;
  }

  hasExceededTokenLimit(): boolean {
    return this.cumulativeTokens >= this.tokenLimit;
  }

  getMaskedAuthHeader(): string {
    if (!this.apiKey) return "[NONE]";
    return `Bearer ${this.apiKey.slice(0, 3)}...${this.apiKey.slice(-3)}`;
  }

  /**
   * Probe CodeCraft connectivity and fetch list of available models.
   */
  async probeConnection(): Promise<{
    reachable: boolean;
    status: number;
    models: string[];
    error?: string;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      const bodyText = await res.text().catch(() => "");
      let data: CodeCraftModelsResponse | null = null;
      try {
        data = JSON.parse(bodyText) as CodeCraftModelsResponse;
      } catch {
        // Non-JSON response
      }

      if (!res.ok) {
        const errorMsg = data?.error?.message || `HTTP ${res.status} ${res.statusText}`;
        return {
          reachable: true,
          status: res.status,
          models: [],
          error: errorMsg,
        };
      }

      const models = (data?.data || []).map((m) => m.id).filter(Boolean);
      return {
        reachable: true,
        status: res.status,
        models,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        reachable: false,
        status: 0,
        models: [],
        error: `Network/probe error: ${msg}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute chat completion against CodeCraft OpenAI-compatible endpoint.
   */
  async chatCompletion(args: {
    model: string;
    messages: CodeCraftMessage[];
    tools?: CodeCraftTool[];
    responseFormat?: { type: "json_object" } | Record<string, unknown>;
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
  }): Promise<{
    ok: boolean;
    text: string;
    toolCalls?: CodeCraftToolCall[];
    usage?: CodeCraftUsage;
    latencyMs: number;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        text: "",
        latencyMs: 0,
        error: "CODECRAFT_API_KEY not configured",
      };
    }

    if (this.hasExceededTokenLimit()) {
      return {
        ok: false,
        text: "",
        latencyMs: 0,
        error: `CODECRAFT_TOKEN_LIMIT_EXCEEDED: cumulative usage (${this.cumulativeTokens}) reached safety cap of ${this.tokenLimit} tokens`,
      };
    }

    const payload: Record<string, unknown> = {
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7,
    };

    if (args.maxTokens) payload.max_tokens = args.maxTokens;
    if (args.tools?.length) payload.tools = args.tools;
    if (args.responseFormat) payload.response_format = args.responseFormat;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    args.abortSignal?.addEventListener("abort", onAbort);

    const startedAt = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;
      const bodyText = await res.text().catch(() => "");
      let json: CodeCraftChatResponse | null = null;
      try {
        json = JSON.parse(bodyText) as CodeCraftChatResponse;
      } catch {
        // non-JSON response
      }

      if (!res.ok) {
        const errorMsg = json?.error?.message || `HTTP ${res.status}: ${bodyText.slice(0, 300)}`;
        return {
          ok: false,
          text: "",
          latencyMs,
          error: errorMsg,
        };
      }

      const choice = json?.choices?.[0];
      const text = choice?.message?.content ?? "";
      const toolCalls = choice?.message?.tool_calls;
      const usage = json?.usage ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      this.cumulativeTokens += usage.total_tokens || 0;

      return {
        ok: true,
        text,
        toolCalls,
        usage,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        text: "",
        latencyMs,
        error: `Request failed: ${msg}`,
      };
    } finally {
      clearTimeout(timer);
      args.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Execute embeddings probe if supported.
   */
  async embeddings(
    input: string | string[],
    model: string = "text-embedding-3-small"
  ): Promise<{
    ok: boolean;
    vectorDimension?: number;
    latencyMs: number;
    usage?: CodeCraftUsage;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        latencyMs: 0,
        error: "CODECRAFT_API_KEY not configured",
      };
    }

    if (this.hasExceededTokenLimit()) {
      return {
        ok: false,
        latencyMs: 0,
        error: "CODECRAFT_TOKEN_LIMIT_EXCEEDED",
      };
    }

    const startedAt = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input }),
      });

      const latencyMs = Date.now() - startedAt;
      const json = (await res.json().catch(() => null)) as {
        data?: Array<{ embedding: number[] }>;
        usage?: CodeCraftUsage;
        error?: { message: string };
      } | null;

      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          error: json?.error?.message || `HTTP ${res.status}`,
        };
      }

      const firstVector = json?.data?.[0]?.embedding;
      const usage = json?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      this.cumulativeTokens += usage.total_tokens || 0;

      return {
        ok: true,
        vectorDimension: firstVector?.length,
        latencyMs,
        usage,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
