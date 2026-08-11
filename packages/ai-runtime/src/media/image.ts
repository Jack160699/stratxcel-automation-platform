import { estimateImageCostUsd } from "../catalog/costs.ts";
import { assertActiveModel, isForbiddenModel, resolveModelId } from "../catalog/models.ts";
import { AIProviderError, classifyHttpStatus, classifyProviderError, isNonHopError } from "../errors.ts";
import { ProviderCircuitBreaker } from "../health/circuit-breaker.ts";
import { evaluateBudgetGate } from "../budget/envelope.ts";
import type { AIBudgetEnvelope, FetchLike } from "../types.ts";
import type { AIUsageRecorder } from "../usage/recorder.ts";
import {
  decodeDataUri,
  type CanonicalMediaStorage,
  type CanonicalStoredAsset,
} from "./canonical-storage.ts";

export type ImageTier = "fast" | "standard" | "premium";

export interface ImageGenerateRequest {
  tenantId: string;
  /** Real missions.id only — null when no workforce mission row. */
  missionId?: string | null;
  /** Stable generation identity for usage idempotency (retries reuse this). */
  generationRequestId?: string;
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
  outcome: "OK" | "NOT_CONFIGURED" | "FAILED" | "SAFETY_REFUSAL" | "WAITING_CONFIGURATION" | "BUDGET_EXHAUSTED";
  candidates: ImageCandidateResult[];
  selected: ImageCandidateResult | null;
  reason?: string;
  provider: "google" | "openai" | null;
  model: string | null;
  storageReady: boolean;
  /** Provider spend recorded for this request (may exceed persisted candidates). */
  recordedProviderCostUsd?: number;
}

export interface ImageMediaDeps {
  geminiApiKey?: string;
  openaiApiKey?: string;
  fetchImpl?: FetchLike;
  circuitBreaker?: ProviderCircuitBreaker;
  storage?: CanonicalMediaStorage;
  /** When true, OPERATIONAL generate requires writable storage. */
  requireStorageForOperational?: boolean;
  usageRecorder?: AIUsageRecorder;
  budgetEnvelope?: AIBudgetEnvelope;
  sessionId?: string | null;
  missionId?: string | null;
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
  private readonly usageRecorder?: AIUsageRecorder;
  private readonly budgetEnvelope?: AIBudgetEnvelope;
  private readonly sessionId: string | null;
  private readonly defaultMissionId: string | null;

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
    this.usageRecorder = deps.usageRecorder;
    this.budgetEnvelope = deps.budgetEnvelope;
    this.sessionId = deps.sessionId ?? null;
    this.defaultMissionId = deps.missionId ?? null;
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
    const missionId = request.missionId ?? this.defaultMissionId;
    const generationRequestId = request.generationRequestId ?? crypto.randomUUID();
    let requestAccumulatedCostUsd = 0;

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
    const projectedUnit = estimateImageCostUsd(primaryModel, Math.max(1, request.candidateCount ?? 1), {
      resolution: request.resolution ?? "1K",
      quality: request.quality,
      size: request.size,
    });
    if (this.budgetEnvelope) {
      const gate = evaluateBudgetGate({
        ...this.budgetEnvelope,
        spentUsdThisMonth: this.budgetEnvelope.spentUsdThisMonth + projectedUnit,
      });
      if (!gate.allowExecution) {
        return {
          outcome: "BUDGET_EXHAUSTED",
          candidates: [],
          selected: null,
          reason: "BUDGET_EXHAUSTED",
          provider: null,
          model: null,
          storageReady,
        };
      }
    }

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
          missionId,
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

    const enrichedRequest: ImageGenerateRequest = { ...request, missionId, referenceImages };
    let geminiAttempted = false;

    try {
      if (this.geminiKey && !this.circuit.isOpen("google", primaryModel)) {
        geminiAttempted = true;
        const candidates = await this.generateGemini(enrichedRequest, primaryModel);
        this.circuit.recordSuccess("google", primaryModel);
        const providerCost = candidates.reduce((s, c) => s + c.estimatedCostUsd, 0);
        requestAccumulatedCostUsd += providerCost;
        // Record billable provider attempt even if persistence/QA later fails.
        if (candidates.length) {
          await this.recordProviderAttempt({
            request: enrichedRequest,
            missionId,
            generationRequestId,
            model: primaryModel,
            provider: "google",
            attemptNumber: 1,
            candidates,
            fallbackUsed: false,
          });
        }
        const persisted = await this.maybePersist(enrichedRequest, candidates);
        return {
          outcome: persisted.length ? "OK" : "FAILED",
          candidates: persisted,
          selected: null,
          reason: persisted.length
            ? "candidate_selection_required"
            : candidates.length
              ? "canonical_persist_failed"
              : "empty_candidates",
          provider: "google",
          model: primaryModel,
          storageReady,
          recordedProviderCostUsd: requestAccumulatedCostUsd,
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
          recordedProviderCostUsd: requestAccumulatedCostUsd,
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
          recordedProviderCostUsd: requestAccumulatedCostUsd,
        };
      }
      // Fall through to OpenAI when hop-eligible.
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
        recordedProviderCostUsd: requestAccumulatedCostUsd,
      };
    }

    if (!this.openaiKey) {
      return {
        outcome: "FAILED",
        candidates: [],
        selected: null,
        reason: geminiAttempted ? "google_failed_openai_not_configured" : "openai_not_configured",
        provider: null,
        model: null,
        storageReady,
        recordedProviderCostUsd: requestAccumulatedCostUsd,
      };
    }

    // Recheck budget: accumulated request cost + projected OpenAI + monthly spend.
    const openaiProjected = estimateImageCostUsd(fallbackModel, Math.max(1, request.candidateCount ?? 1), {
      quality: request.quality ?? "high",
      size: request.size ?? "1024x1024",
    });
    if (this.budgetEnvelope) {
      const gate = evaluateBudgetGate({
        ...this.budgetEnvelope,
        spentUsdThisMonth:
          this.budgetEnvelope.spentUsdThisMonth + requestAccumulatedCostUsd + openaiProjected,
      });
      if (!gate.allowExecution) {
        return {
          outcome: "BUDGET_EXHAUSTED",
          candidates: [],
          selected: null,
          reason: "BUDGET_EXHAUSTED",
          provider: "google",
          model: primaryModel,
          storageReady,
          recordedProviderCostUsd: requestAccumulatedCostUsd,
        };
      }
    }

    try {
      const candidates = await this.generateOpenAI(enrichedRequest, fallbackModel);
      this.circuit.recordSuccess("openai", fallbackModel);
      const providerCost = candidates.reduce((s, c) => s + c.estimatedCostUsd, 0);
      requestAccumulatedCostUsd += providerCost;
      if (candidates.length) {
        await this.recordProviderAttempt({
          request: enrichedRequest,
          missionId,
          generationRequestId,
          model: fallbackModel,
          provider: "openai",
          attemptNumber: 2,
          candidates,
          fallbackUsed: true,
        });
      }
      const persisted = await this.maybePersist(enrichedRequest, candidates);
      return {
        outcome: persisted.length ? "OK" : "FAILED",
        candidates: persisted,
        selected: null,
        reason: persisted.length
          ? "candidate_selection_required"
          : candidates.length
            ? "canonical_persist_failed"
            : "empty_candidates",
        provider: "openai",
        model: fallbackModel,
        storageReady,
        recordedProviderCostUsd: requestAccumulatedCostUsd,
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
        recordedProviderCostUsd: requestAccumulatedCostUsd,
      };
    }
  }

  private async recordProviderAttempt(args: {
    request: ImageGenerateRequest;
    missionId: string | null | undefined;
    generationRequestId: string;
    model: string;
    provider: "google" | "openai";
    attemptNumber: number;
    candidates: ImageCandidateResult[];
    fallbackUsed: boolean;
  }): Promise<void> {
    if (!this.usageRecorder || !args.candidates.length) return;
    const cost = args.candidates.reduce((s, c) => s + c.estimatedCostUsd, 0);
    try {
      await this.usageRecorder.record({
        tenantId: args.request.tenantId,
        missionId: args.missionId ?? null,
        sessionId: this.sessionId,
        department: "creative",
        specialistRole: null,
        taskClass: "IMAGE",
        provider: args.provider,
        model: args.model,
        attemptNumber: args.attemptNumber,
        fallbackUsed: args.fallbackUsed,
        fallbackReason: args.fallbackUsed ? "model_unavailable" : "none",
        escalationLevel: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: cost,
        latencyMs: 0,
        success: true,
        errorCategory: null,
        selectionReason: `image:${args.model}`,
        requestId: args.generationRequestId,
        createdAt: new Date().toISOString(),
        mediaUnits: args.candidates.length,
      });
    } catch {
      /* non-blocking */
    }
  }

  private async maybePersist(
    request: ImageGenerateRequest,
    candidates: ImageCandidateResult[],
  ): Promise<ImageCandidateResult[]> {
    if (!request.persistCanonical || !this.storage) {
      if (this.requireStorageForOperational) {
        return [];
      }
      return candidates;
    }

    const out: ImageCandidateResult[] = [];
    for (const cand of candidates) {
      const decoded = decodeDataUri(cand.uri);
      if (!decoded) {
        if (!/^data:/i.test(cand.uri)) {
          out.push(cand);
        }
        continue;
      }
      try {
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
      } catch {
        // Provider cost already recorded — persistence failure does not erase spend.
      }
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
    const quality = request.quality ?? "high";
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
