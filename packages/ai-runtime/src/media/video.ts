import { estimateVideoCostUsd } from "../catalog/costs.ts";
import { assertActiveModel, isForbiddenModel, resolveModelId } from "../catalog/models.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import type { FetchLike } from "../types.ts";

export type VideoTier = "economy" | "fast" | "premium";

export type VideoOperationStatus = "submitted" | "polling" | "completed" | "failed";

export interface VideoSubmitRequest {
  tenantId: string;
  missionId: string;
  prompt: string;
  durationSeconds?: number;
  tier?: VideoTier;
  aspectRatio?: string;
}

export interface VideoOperation {
  operationId: string;
  status: VideoOperationStatus;
  provider: "google";
  model: string;
  tenantId: string;
  missionId: string;
  estimatedCostUsd: number;
  artifactUri?: string;
  errorSafe?: string;
  pollCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VideoMediaDeps {
  geminiApiKey?: string;
  fetchImpl?: FetchLike;
  maxPolls?: number;
  sleepMs?: (ms: number) => Promise<void>;
}

function modelForTier(tier: VideoTier, env = process.env): string {
  if (tier === "fast") return resolveModelId("GOOGLE_VIDEO_FAST", env);
  if (tier === "premium") return resolveModelId("GOOGLE_VIDEO_PREMIUM", env);
  return resolveModelId("GOOGLE_VIDEO_ECONOMY", env);
}

/**
 * Async Veo video generation — submit → poll with bounded backoff → receipt.
 * Never blocks serverless for excessive duration; callers should queue polls.
 * Sora is explicitly unsupported.
 */
export class VideoMediaRuntime {
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxPolls: number;
  private readonly sleepMs: (ms: number) => Promise<void>;
  private readonly operations = new Map<string, VideoOperation>();

  constructor(deps: VideoMediaDeps = {}) {
    this.apiKey = Object.prototype.hasOwnProperty.call(deps, "geminiApiKey")
      ? deps.geminiApiKey
      : process.env.GEMINI_API_KEY;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.maxPolls = deps.maxPolls ?? 8;
    this.sleepMs = deps.sleepMs ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async submit(request: VideoSubmitRequest): Promise<VideoOperation> {
    if (!this.isConfigured()) {
      return {
        operationId: `noop_${crypto.randomUUID()}`,
        status: "failed",
        provider: "google",
        model: modelForTier(request.tier ?? "economy"),
        tenantId: request.tenantId,
        missionId: request.missionId,
        estimatedCostUsd: 0,
        errorSafe: "NOT_CONFIGURED",
        pollCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const model = modelForTier(request.tier ?? "economy");
    if (isForbiddenModel(model) || /sora/i.test(model)) {
      throw new AIProviderError("INVALID_INPUT", `forbidden_video_model:${model}`);
    }
    assertActiveModel(model);

    const duration = Math.max(1, Math.min(request.durationSeconds ?? 6, 30));
    const body = {
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: 1,
        durationSeconds: duration,
        ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
      },
    };

    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`,
      {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey!, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new AIProviderError(classifyHttpStatus(response.status), `Veo submit HTTP ${response.status}`, response.status);
    }

    const json = (await response.json()) as { name?: string; operation?: { name?: string } };
    const operationId = json.name ?? json.operation?.name ?? `local_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const op: VideoOperation = {
      operationId,
      status: "submitted",
      provider: "google",
      model,
      tenantId: request.tenantId,
      missionId: request.missionId,
      estimatedCostUsd: estimateVideoCostUsd(model, duration),
      pollCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.operations.set(operationId, op);
    return op;
  }

  async poll(operationId: string): Promise<VideoOperation> {
    const existing = this.operations.get(operationId);
    if (!existing) {
      return {
        operationId,
        status: "failed",
        provider: "google",
        model: resolveModelId("GOOGLE_VIDEO_ECONOMY"),
        tenantId: "",
        missionId: "",
        estimatedCostUsd: 0,
        errorSafe: "unknown_operation",
        pollCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (!this.apiKey) {
      return { ...existing, status: "failed", errorSafe: "NOT_CONFIGURED" };
    }
    if (existing.pollCount >= this.maxPolls) {
      const failed = { ...existing, status: "failed" as const, errorSafe: "poll_budget_exhausted", updatedAt: new Date().toISOString() };
      this.operations.set(operationId, failed);
      return failed;
    }

    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/${operationId}`,
      { method: "GET", headers: { "x-goog-api-key": this.apiKey } },
    );
    if (!response.ok) {
      const failed = {
        ...existing,
        status: "failed" as const,
        errorSafe: `poll_http_${response.status}`,
        pollCount: existing.pollCount + 1,
        updatedAt: new Date().toISOString(),
      };
      this.operations.set(operationId, failed);
      return failed;
    }

    const json = (await response.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
    };

    const pollCount = existing.pollCount + 1;
    if (json.error) {
      const failed = {
        ...existing,
        status: "failed" as const,
        errorSafe: "provider_error",
        pollCount,
        updatedAt: new Date().toISOString(),
      };
      this.operations.set(operationId, failed);
      return failed;
    }

    if (json.done) {
      const uri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      const completed: VideoOperation = {
        ...existing,
        status: uri ? "completed" : "failed",
        artifactUri: uri,
        errorSafe: uri ? undefined : "missing_artifact",
        pollCount,
        updatedAt: new Date().toISOString(),
      };
      this.operations.set(operationId, completed);
      return completed;
    }

    const polling: VideoOperation = {
      ...existing,
      status: "polling",
      pollCount,
      updatedAt: new Date().toISOString(),
    };
    this.operations.set(operationId, polling);
    return polling;
  }

  /** Bounded poll loop for workers — not for Vercel serverless request handlers. */
  async awaitCompletion(operationId: string, backoffMs = 1500): Promise<VideoOperation> {
    let op = await this.poll(operationId);
    while (op.status === "submitted" || op.status === "polling") {
      await this.sleepMs(backoffMs);
      backoffMs = Math.min(backoffMs * 1.5, 10_000);
      op = await this.poll(operationId);
    }
    return op;
  }

  /** Test helper */
  seedOperation(op: VideoOperation): void {
    this.operations.set(op.operationId, op);
  }
}

export function assertNoSoraPath(model: string): void {
  if (/sora/i.test(model)) throw new AIProviderError("INVALID_INPUT", "sora_not_supported");
}
