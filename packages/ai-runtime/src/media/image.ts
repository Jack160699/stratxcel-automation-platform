import { estimateImageCostUsd } from "../catalog/costs.ts";
import { assertActiveModel, isForbiddenModel, resolveModelId } from "../catalog/models.ts";
import { AIProviderError, classifyHttpStatus, classifyProviderError, isNonHopError } from "../errors.ts";
import { ProviderCircuitBreaker } from "../health/circuit-breaker.ts";
import type { FetchLike } from "../types.ts";

export type ImageTier = "fast" | "standard" | "premium";

export interface ImageGenerateRequest {
  tenantId: string;
  missionId: string;
  prompt: string;
  aspectRatio?: string;
  size?: string;
  referenceImages?: Array<{ mimeType: string; data: string }>;
  tier?: ImageTier;
  candidateCount?: number;
}

export interface ImageCandidateResult {
  id: string;
  uri: string;
  mimeType: string;
  provider: "google" | "openai";
  model: string;
  estimatedCostUsd: number;
  width?: number;
  height?: number;
}

export interface ImageGenerationOutcome {
  outcome: "OK" | "NOT_CONFIGURED" | "FAILED" | "SAFETY_REFUSAL";
  candidates: ImageCandidateResult[];
  selected: ImageCandidateResult | null;
  reason?: string;
  provider: "google" | "openai" | null;
  model: string | null;
}

export interface ImageMediaDeps {
  geminiApiKey?: string;
  openaiApiKey?: string;
  fetchImpl?: FetchLike;
  circuitBreaker?: ProviderCircuitBreaker;
}

function modelForTier(tier: ImageTier, env = process.env): string {
  if (tier === "fast") return resolveModelId("GOOGLE_IMAGE_FAST", env);
  if (tier === "premium") return resolveModelId("GOOGLE_IMAGE_PREMIUM", env);
  return resolveModelId("GOOGLE_IMAGE_STANDARD", env);
}

export class ImageMediaRuntime {
  private readonly geminiKey?: string;
  private readonly openaiKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly circuit: ProviderCircuitBreaker;

  constructor(deps: ImageMediaDeps = {}) {
    this.geminiKey = Object.prototype.hasOwnProperty.call(deps, "geminiApiKey")
      ? deps.geminiApiKey
      : process.env.GEMINI_API_KEY;
    this.openaiKey = Object.prototype.hasOwnProperty.call(deps, "openaiApiKey")
      ? deps.openaiApiKey
      : process.env.OPENAI_API_KEY;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.circuit = deps.circuitBreaker ?? new ProviderCircuitBreaker();
  }

  isConfigured(): boolean {
    return Boolean(this.geminiKey || this.openaiKey);
  }

  async generate(request: ImageGenerateRequest): Promise<ImageGenerationOutcome> {
    if (!this.isConfigured()) {
      return {
        outcome: "NOT_CONFIGURED",
        candidates: [],
        selected: null,
        reason: "image_provider_not_configured",
        provider: null,
        model: null,
      };
    }

    const tier = request.tier ?? "standard";
    const primaryModel = modelForTier(tier);
    assertActiveModel(primaryModel);

    try {
      if (this.geminiKey && !this.circuit.isOpen("google", primaryModel)) {
        const candidates = await this.generateGemini(request, primaryModel);
        this.circuit.recordSuccess("google", primaryModel);
        const selected = candidates[0] ?? null;
        return {
          outcome: selected ? "OK" : "FAILED",
          candidates,
          selected,
          reason: selected ? undefined : "empty_candidates",
          provider: "google",
          model: primaryModel,
        };
      }
    } catch (err) {
      const category = classifyProviderError(err);
      this.circuit.recordFailure("google", primaryModel);
      if (isNonHopError(category) || category === "SAFETY_REFUSAL") {
        return {
          outcome: "SAFETY_REFUSAL",
          candidates: [],
          selected: null,
          reason: "safety_refusal",
          provider: "google",
          model: primaryModel,
        };
      }
    }

    const fallbackModel = resolveModelId("OPENAI_IMAGE_FALLBACK");
    if (isForbiddenModel(fallbackModel)) {
      return { outcome: "FAILED", candidates: [], selected: null, reason: "forbidden_fallback", provider: null, model: null };
    }

    if (!this.openaiKey) {
      return {
        outcome: "FAILED",
        candidates: [],
        selected: null,
        reason: "google_failed_openai_not_configured",
        provider: null,
        model: null,
      };
    }

    try {
      const candidates = await this.generateOpenAI(request, fallbackModel);
      this.circuit.recordSuccess("openai", fallbackModel);
      const selected = candidates[0] ?? null;
      return {
        outcome: selected ? "OK" : "FAILED",
        candidates,
        selected,
        provider: "openai",
        model: fallbackModel,
      };
    } catch (err) {
      this.circuit.recordFailure("openai", fallbackModel);
      return {
        outcome: "FAILED",
        candidates: [],
        selected: null,
        reason: err instanceof Error ? err.message.slice(0, 120) : "openai_image_failed",
        provider: "openai",
        model: fallbackModel,
      };
    }
  }

  private async generateGemini(request: ImageGenerateRequest, model: string): Promise<ImageCandidateResult[]> {
    const count = Math.max(1, Math.min(request.candidateCount ?? 1, 4));
    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
    for (const ref of request.referenceImages ?? []) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
    }
    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(request.aspectRatio ? { imageConfig: { aspectRatio: request.aspectRatio } } : {}),
      },
    };
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": this.geminiKey!, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new AIProviderError(classifyHttpStatus(response.status), `Gemini image HTTP ${response.status}`, response.status);
    }
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> } }>;
    };
    const out: ImageCandidateResult[] = [];
    for (const cand of json.candidates ?? []) {
      for (const part of cand.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? "image/png";
          out.push({
            id: crypto.randomUUID(),
            uri: `data:${mime};base64,${part.inlineData.data}`,
            mimeType: mime,
            provider: "google",
            model,
            estimatedCostUsd: estimateImageCostUsd(model, 1),
          });
        }
      }
    }
    return out.slice(0, count);
  }

  private async generateOpenAI(request: ImageGenerateRequest, model: string): Promise<ImageCandidateResult[]> {
    const count = Math.max(1, Math.min(request.candidateCount ?? 1, 4));
    const body = {
      model,
      prompt: request.prompt,
      n: count,
      size: request.size ?? "1024x1024",
    };
    const response = await this.fetchImpl("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openaiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new AIProviderError(classifyHttpStatus(response.status), `OpenAI image HTTP ${response.status}`, response.status);
    }
    const json = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    return (json.data ?? []).map((item) => {
      const uri = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url ?? "";
      return {
        id: crypto.randomUUID(),
        uri,
        mimeType: "image/png",
        provider: "openai" as const,
        model,
        estimatedCostUsd: estimateImageCostUsd(model, 1),
      };
    }).filter((c) => Boolean(c.uri));
  }
}
