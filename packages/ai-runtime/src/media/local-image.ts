import { AIProviderError, classifyHttpStatus, classifyProviderError } from "../errors.ts";
import type { FetchLike } from "../types.ts";

/**
 * Standalone image-generation client for the remote local AI server.
 * Deliberately NOT folded into ImageMediaRuntime (media/image.ts) — that
 * class is the tested, live Gemini/OpenAI image pipeline with several
 * hard-won incident fixes, and section 9 of the connection brief is explicit
 * about not modifying the existing content pipeline unnecessarily. This
 * gives the remote server a real, working image path without touching that
 * file; a future deliberate decision can fold it in as a third
 * ImageMediaRuntime branch once this path has run in production for a while.
 *
 * Request/response shape confirmed live against ai.stratxcel.in:
 *
 *   POST /v1/images/generate  { prompt: string, quality?: "fast"|"quality"|"premium" }
 *     -> { status, image_id, file_name, url, model_tier, provider,
 *          quality_score, quality_gate_passed, candidates_evaluated,
 *          resolution, generation_time_sec }
 *
 * `quality` (NOT `tier`/`model_tier`) is the real field name — confirmed by
 * observing model_tier flip in the response only when the field was named
 * `quality`; other names were silently ignored (defaulting to "quality").
 *
 * The initial response carries no image bytes, only a relative `url` — a
 * second authenticated GET against that path returns the actual PNG. This
 * client does that second fetch itself so callers get a ready-to-use
 * `data:` URI, matching the convention ImageCandidateResult already uses
 * elsewhere in this package.
 */
export interface LocalImageGenerateRequest {
  prompt: string;
  /** "fast" | "quality" | "premium" — maps to the remote server's sd-fast/sdxl-quality/sdxl-premium models. */
  quality?: "fast" | "quality" | "premium";
  timeoutMs?: number;
}

export interface LocalImageCandidate {
  id: string;
  uri: string;
  mimeType: string;
  provider: "local";
  model: string;
  qualityScore?: number;
  qualityGatePassed?: boolean;
  candidatesEvaluated?: number;
}

export interface LocalImageGenerationResult {
  outcome: "OK" | "NOT_CONFIGURED" | "FAILED";
  candidates: LocalImageCandidate[];
  provider: "local" | null;
  model: string | null;
  reason?: string;
}

export interface LocalAIImageProviderOptions {
  apiUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  defaultTimeoutMs?: number;
}

export class LocalAIImageProvider {
  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly defaultTimeoutMs: number;

  constructor(options: LocalAIImageProviderOptions = {}) {
    const rawUrl = options.apiUrl ?? process.env.LOCAL_AI_API_URL;
    this.apiUrl = rawUrl ? rawUrl.replace(/\/+$/, "") : undefined;
    this.apiKey = options.apiKey ?? process.env.LOCAL_AI_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? Number(process.env.LOCAL_AI_IMAGE_TIMEOUT_MS ?? 120_000);
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  async generate(request: LocalImageGenerateRequest): Promise<LocalImageGenerationResult> {
    if (!this.apiUrl || !this.apiKey) {
      return { outcome: "NOT_CONFIGURED", candidates: [], provider: null, model: null, reason: "local_ai_not_configured" };
    }

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const authHeaders = { Authorization: `Bearer ${this.apiKey}` };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.apiUrl}/v1/images/generate`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: request.prompt, quality: request.quality ?? "quality" }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new AIProviderError(
          classifyHttpStatus(response.status),
          `Local AI image HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
          response.status,
        );
      }

      const json = (await response.json()) as {
        status?: string;
        image_id?: string;
        url?: string;
        model_tier?: string;
        provider?: string;
        quality_score?: number;
        quality_gate_passed?: boolean;
        candidates_evaluated?: number;
        detail?: string;
      };

      if (json.status !== "success" || !json.url) {
        return {
          outcome: "FAILED",
          candidates: [],
          provider: "local",
          model: json.model_tier ?? null,
          reason: json.detail ?? "empty_or_failed_generation",
        };
      }

      // The generate response carries no image bytes — fetch them separately.
      const imageUrl = json.url.startsWith("http") ? json.url : `${this.apiUrl}${json.url}`;
      const imageResponse = await this.fetchImpl(imageUrl, { headers: authHeaders, signal: controller.signal });
      if (!imageResponse.ok) {
        return {
          outcome: "FAILED",
          candidates: [],
          provider: "local",
          model: json.model_tier ?? null,
          reason: `image_fetch_http_${imageResponse.status}`,
        };
      }
      const mimeType = imageResponse.headers.get("content-type") ?? "image/png";
      const bytes = new Uint8Array(await imageResponse.arrayBuffer());
      const base64 = Buffer.from(bytes).toString("base64");

      const candidate: LocalImageCandidate = {
        id: json.image_id ?? crypto.randomUUID(),
        uri: `data:${mimeType};base64,${base64}`,
        mimeType,
        provider: "local",
        model: json.model_tier ?? "unknown",
        qualityScore: json.quality_score,
        qualityGatePassed: json.quality_gate_passed,
        candidatesEvaluated: json.candidates_evaluated,
      };

      return { outcome: "OK", candidates: [candidate], provider: "local", model: candidate.model };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { outcome: "FAILED", candidates: [], provider: "local", model: null, reason: "local_ai_image_timeout" };
      }
      return {
        outcome: "FAILED",
        candidates: [],
        provider: "local",
        model: null,
        reason: `${classifyProviderError(err)}:${err instanceof Error ? err.message.slice(0, 160) : "local_ai_image_failed"}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
