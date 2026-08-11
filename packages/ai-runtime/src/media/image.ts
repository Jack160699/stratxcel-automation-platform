import { estimateImageCostUsd } from "../catalog/costs.ts";
import { assertActiveModel, isForbiddenModel, resolveModelId } from "../catalog/models.ts";
import { AIProviderError, classifyHttpStatus, classifyProviderError, isNonHopError } from "../errors.ts";
import { ProviderCircuitBreaker } from "../health/circuit-breaker.ts";
import type { FetchLike } from "../types.ts";
import {
  decodeDataUri,
  type CanonicalMediaStorage,
  type CanonicalStoredAsset,
} from "./canonical-storage.ts";

export type ImageTier = "fast" | "standard" | "premium";

export interface ImageGenerateRequest {
  tenantId: string;
  missionId: string;
  prompt: string;
  aspectRatio?: string;
  size?: string;
  quality?: "low" | "medium" | "high";
  resolution?: "0.5K" | "1K" | "2K" | "4K";
  referenceImages?: Array<{ mimeType: string; data: string }>;
  /** Tenant-owned asset IDs — resolved via storage when provided. */
  referenceAssetIds?: readonly string[];
  tier?: ImageTier;
  candidateCount?: number;
  /** Persist candidates to canonical storage (required for production release assets). */
  persistCanonical?: boolean;
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
  /** Set when persisted — never a data: URI. */
  storedAsset?: CanonicalStoredAsset;
}

export interface ImageGenerationOutcome {
  outcome: "OK" | "NOT_CONFIGURED" | "FAILED" | "SAFETY_REFUSAL" | "WAITING_CONFIGURATION";
  candidates: ImageCandidateResult[];
  selected: ImageCandidateResult | null;
  reason?: string;
  provider: "google" | "openai" | null;
  model: string | null;
  storageReady: boolean;
}

export interface ImageMediaDeps {
  geminiApiKey?: string;
  openaiApiKey?: string;
  fetchImpl?: FetchLike;
  circuitBreaker?: ProviderCircuitBreaker;
  storage?: CanonicalMediaStorage;
  /** When true, OPERATIONAL generate requires writable storage. */
  requireStorageForOperational?: boolean;
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
  private readonly storage?: CanonicalMediaStorage;
  private readonly requireStorageForOperational: boolean;

  constructor(deps: ImageMediaDeps = {}) {
    this.geminiKey = Object.prototype.hasOwnProperty.call(deps, "geminiApiKey")
      ? deps.geminiApiKey
      : process.env.GEMINI_API_KEY;
    this.openaiKey = Object.prototype.hasOwnProperty.call(deps, "openaiApiKey")
      ? deps.openaiApiKey
      : process.env.OPENAI_API_KEY;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.circuit = deps.circuitBreaker ?? new ProviderCircuitBreaker();
    this.storage = deps.storage;
    this.requireStorageForOperational = deps.requireStorageForOperational ?? Boolean(deps.storage);
  }

  isConfigured(): boolean {
    return Boolean(this.geminiKey || this.openaiKey);
  }

  async isStorageReady(): Promise<boolean> {
    if (!this.storage) return false;
    return this.storage.isWritable();
  }

  async generate(request: ImageGenerateRequest): Promise<ImageGenerationOutcome> {
    const storageReady = await this.isStorageReady();
    if (!this.isConfigured()) {
      return {
        outcome: "NOT_CONFIGURED",
        candidates: [],
        selected: null,
        reason: "image_provider_not_configured",
        provider: null,
        model: null,
        storageReady,
      };
    }

    if (this.requireStorageForOperational && !storageReady) {
      return {
        outcome: "WAITING_CONFIGURATION",
        candidates: [],
        selected: null,
        reason: "image_storage_not_ready",
        provider: null,
        model: null,
        storageReady: false,
      };
    }

    const tier = request.tier ?? "standard";
    const primaryModel = modelForTier(tier);
    assertActiveModel(primaryModel);

    let referenceImages = [...(request.referenceImages ?? [])];
    if (request.referenceAssetIds?.length) {
      if (!this.storage) {
        return {
          outcome: "FAILED",
          candidates: [],
          selected: null,
          reason: "reference_resolver_unavailable",
          provider: null,
          model: null,
          storageReady,
        };
      }
      try {
        const resolved = await this.storage.resolveReferenceImages({
          tenantId: request.tenantId,
          missionId: request.missionId,
          referenceAssetIds: request.referenceAssetIds,
        });
        referenceImages = [
          ...referenceImages,
          ...resolved.map((r) => ({ mimeType: r.mimeType, data: r.data })),
        ];
      } catch (err) {
        return {
          outcome: "FAILED",
          candidates: [],
          selected: null,
          reason: err instanceof Error ? err.message.slice(0, 160) : "reference_resolve_failed",
          provider: null,
          model: null,
          storageReady,
        };
      }
    }

    const enrichedRequest: ImageGenerateRequest = { ...request, referenceImages };

    try {
      if (this.geminiKey && !this.circuit.isOpen("google", primaryModel)) {
        const candidates = await this.generateGemini(enrichedRequest, primaryModel);
        this.circuit.recordSuccess("google", primaryModel);
        const persisted = await this.maybePersist(request, candidates);
        // Never auto-release candidate[0] as final — leave selected null for QA/selection.
        return {
          outcome: persisted.length ? "OK" : "FAILED",
          candidates: persisted,
          selected: null,
          reason: persisted.length ? "candidate_selection_required" : "empty_candidates",
          provider: "google",
          model: primaryModel,
          storageReady,
        };
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("cross_tenant_reference_forbidden")) {
        return {
          outcome: "FAILED",
          candidates: [],
          selected: null,
          reason: err.message,
          provider: null,
          model: null,
          storageReady,
        };
      }
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
          storageReady,
        };
      }
    }

    const fallbackModel = resolveModelId("OPENAI_IMAGE_FALLBACK");
    if (isForbiddenModel(fallbackModel)) {
      return {
        outcome: "FAILED",
        candidates: [],
        selected: null,
        reason: "forbidden_fallback",
        provider: null,
        model: null,
        storageReady,
      };
    }

    if (!this.openaiKey) {
      return {
        outcome: "FAILED",
        candidates: [],
        selected: null,
        reason: "google_failed_openai_not_configured",
        provider: null,
        model: null,
        storageReady,
      };
    }

    try {
      const candidates = await this.generateOpenAI(enrichedRequest, fallbackModel);
      this.circuit.recordSuccess("openai", fallbackModel);
      const persisted = await this.maybePersist(request, candidates);
      return {
        outcome: persisted.length ? "OK" : "FAILED",
        candidates: persisted,
        selected: null,
        reason: persisted.length ? "candidate_selection_required" : "empty_candidates",
        provider: "openai",
        model: fallbackModel,
        storageReady,
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
        storageReady,
      };
    }
  }

  private async maybePersist(
    request: ImageGenerateRequest,
    candidates: ImageCandidateResult[],
  ): Promise<ImageCandidateResult[]> {
    if (!request.persistCanonical || !this.storage) {
      // Strip data URIs from release surface when storage is required.
      if (this.requireStorageForOperational) {
        return [];
      }
      return candidates;
    }

    const out: ImageCandidateResult[] = [];
    for (const cand of candidates) {
      const decoded = decodeDataUri(cand.uri);
      if (!decoded) {
        // Already a non-data URI — keep only if storage-safe.
        if (!/^data:/i.test(cand.uri)) {
          out.push(cand);
        }
        continue;
      }
      const stored = await this.storage.persistGeneratedImage({
        tenantId: request.tenantId,
        missionId: request.missionId,
        mimeType: decoded.mimeType,
        bytes: decoded.bytes,
        originalName: `${cand.id}.png`,
      });
      out.push({
        ...cand,
        uri: stored.uri,
        storedAsset: stored,
      });
    }
    return out;
  }

  private async generateGemini(request: ImageGenerateRequest, model: string): Promise<ImageCandidateResult[]> {
    const count = Math.max(1, Math.min(request.candidateCount ?? 1, 4));
    const out: ImageCandidateResult[] = [];
    for (let i = 0; i < count; i++) {
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
              estimatedCostUsd: estimateImageCostUsd(model, 1, {
                resolution: request.resolution ?? "1K",
              }),
            });
          }
        }
      }
    }
    return out.slice(0, count);
  }

  private async generateOpenAI(request: ImageGenerateRequest, model: string): Promise<ImageCandidateResult[]> {
    const count = Math.max(1, Math.min(request.candidateCount ?? 1, 4));
    const size = request.size ?? "1024x1024";
    const quality = request.quality ?? "medium";
    const body = {
      model,
      prompt: request.prompt,
      n: count,
      size,
      quality,
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
    return (json.data ?? [])
      .map((item) => {
        const uri = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url ?? "";
        return {
          id: crypto.randomUUID(),
          uri,
          mimeType: "image/png",
          provider: "openai" as const,
          model,
          estimatedCostUsd: estimateImageCostUsd(model, 1, { quality, size }),
        };
      })
      .filter((c) => Boolean(c.uri));
  }
}
