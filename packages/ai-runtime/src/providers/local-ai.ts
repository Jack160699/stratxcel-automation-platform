import { buildUsage } from "../catalog/costs.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import { probeLocalAIReadiness, ReadinessCache } from "../health/readiness.ts";
import type {
  AIMessage,
  AIReasoningLevel,
  AITextProviderAdapter,
  AIToolCall,
  AIToolSchema,
  FetchLike,
} from "../types.ts";

/**
 * Adapter for the owner's remote, self-hosted "StratXcel Unified Local AI
 * Server" (LOCAL_AI_API_URL / LOCAL_AI_API_KEY) — a FastAPI service, paired
 * via a one-time POST /v1/pair exchange (see scripts/lib/*-pair.mjs history /
 * the pairing flow docs) that hands back a long-lived `machine_api_key`.
 *
 * The request/response shapes below are NOT a generic convention (this is
 * not OpenAI-compatible) — they were confirmed against the real, live server
 * (ai.stratxcel.in) via authenticated requests during connection setup:
 *
 *   POST /v1/chat  { messages: [{role, content}] }
 *     -> { status, provider, model, content, prompt_tokens, completion_tokens,
 *          total_tokens, tokens_per_second, latency_ms, fallback, fallback_reason }
 *
 *   POST /v1/code  { prompt: string }
 *     -> { status, provider, model, generated_code, patch, diff_stat,
 *          target_file, latency_ms }  (no token usage reported)
 *
 * Chat and coding are genuinely separate endpoints on this server (unlike
 * Gemini/OpenAI, where one text endpoint serves every task class), so this
 * adapter dispatches on `args.model` — see catalog/models.ts's LOCAL_CHAT
 * ("auto") vs LOCAL_CODING ("auto-code") sentinel ids. The remote server
 * still owns which underlying local model actually serves the request
 * (reported back per-call as `model`/`provider` — e.g. "local"/"qwen2.5:7b",
 * or "gemini"/cloud fallback when the server's own Gemini fallback fires).
 *
 * Neither endpoint's tool-calling / structured-output support has been
 * confirmed live; both are handled best-effort (never thrown on) so an
 * unsupported feature degrades to plain text rather than breaking the call.
 */
export interface LocalAIAdapterOptions {
  apiUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  readinessCache?: ReadinessCache;
}

/** Sentinel model id (catalog/models.ts LOCAL_CODING) that routes to POST /v1/code instead of /v1/chat. */
export const LOCAL_AI_CODING_MODEL_SENTINEL = "auto-code";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** /v1/code takes one prompt string, not a message list — flatten in order, system/developer first. */
function flattenMessagesToPrompt(messages: readonly AIMessage[]): string {
  const system = messages.filter((m) => m.role === "system" || m.role === "developer").map((m) => m.content);
  const rest = messages.filter((m) => m.role !== "system" && m.role !== "developer").map((m) => m.content);
  return [...system, ...rest].filter(Boolean).join("\n\n");
}

/** This server's error body is FastAPI/Pydantic-shaped: `detail` is either a plain string or a list of field errors. */
function extractLocalAiErrorDetail(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { detail?: string | Array<{ loc?: string[]; msg?: string }> };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      return parsed.detail.map((d) => `${(d.loc ?? []).join(".")}: ${d.msg ?? "invalid"}`).join("; ");
    }
  } catch {
    // fall through to raw text below
  }
  return bodyText.slice(0, 200);
}

export class LocalAITextProvider implements AITextProviderAdapter {
  readonly provider = "local" as const;
  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly readinessCache: ReadinessCache;

  constructor(options: LocalAIAdapterOptions = {}) {
    const rawUrl = options.apiUrl ?? process.env.LOCAL_AI_API_URL;
    this.apiUrl = rawUrl ? normalizeBaseUrl(rawUrl) : undefined;
    this.apiKey = options.apiKey ?? process.env.LOCAL_AI_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readinessCache = options.readinessCache ?? new ReadinessCache();
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
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
    if (!this.apiUrl || !this.apiKey) {
      throw new AIProviderError("NOT_CONFIGURED", "LOCAL_AI_API_URL/LOCAL_AI_API_KEY not configured");
    }

    const isCoding = args.model === LOCAL_AI_CODING_MODEL_SENTINEL;
    const endpoint = isCoding ? "/v1/code" : "/v1/chat";
    const body: Record<string, unknown> = isCoding
      ? { prompt: flattenMessagesToPrompt(args.messages) }
      : { messages: args.messages.map((m) => ({ role: m.role === "developer" ? "system" : m.role, content: m.content })) };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const onAbort = () => controller.abort();
    args.abortSignal?.addEventListener("abort", onAbort);

    try {
      const response = await this.fetchImpl(`${this.apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        const detail = extractLocalAiErrorDetail(bodyText);
        throw new AIProviderError(classifyHttpStatus(response.status), `Local AI ${endpoint} HTTP ${response.status}: ${detail}`, response.status);
      }

      const json = (await response.json()) as {
        status?: string;
        provider?: string;
        model?: string;
        content?: string;
        generated_code?: string;
        prompt_tokens?: number;
        completion_tokens?: number;
        fallback?: boolean;
        fallback_reason?: string | null;
        detail?: unknown;
      };

      if (json.status && json.status !== "success") {
        const message = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail ?? json.status);
        const lower = message.toLowerCase();
        if (lower.includes("safety") || lower.includes("refus") || lower.includes("blocked")) {
          throw new AIProviderError("SAFETY_REFUSAL", `Local AI safety refusal: ${message}`);
        }
        throw new AIProviderError("PROVIDER_FAILURE", `Local AI ${endpoint} error: ${message}`);
      }

      const text = (isCoding ? json.generated_code : json.content) ?? "";

      // Neither endpoint has confirmed tool-calling support live — best-effort only.
      const toolCalls: AIToolCall[] = [];

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
        inputTokens: json.prompt_tokens ?? 0,
        cachedInputTokens: 0,
        outputTokens: json.completion_tokens ?? 0,
      });

      return {
        text,
        structuredOutput,
        toolCalls,
        usage,
        // The remote server's own provider/model (e.g. "local"/"qwen2.5:7b", or its
        // own cloud-fallback identity when json.fallback is true) — not a request id,
        // but the closest safe, non-secret per-call identifier this API returns.
        providerRequestId: json.provider && json.model ? `${json.provider}:${json.model}` : null,
        safetyRefused: false,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError("TIMEOUT", "Local AI request timeout");
      }
      throw new AIProviderError("TRANSIENT", err instanceof Error ? err.message : "Local AI network failure");
    } finally {
      clearTimeout(timer);
      args.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  async probeReadiness(model?: string) {
    return probeLocalAIReadiness({
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
      model,
      fetchImpl: this.fetchImpl,
      cache: this.readinessCache,
    });
  }
}
