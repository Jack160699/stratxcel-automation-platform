import { estimateVideoCostUsd } from "../catalog/costs.ts";
import { assertActiveModel, isForbiddenModel, resolveModelId } from "../catalog/models.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import { evaluateBudgetGate } from "../budget/envelope.ts";
import type { FetchLike } from "../types.ts";
import type { CanonicalMediaStorage } from "./canonical-storage.ts";

export type VideoTier = "economy" | "fast" | "premium";
export type VideoOperationStatus = "submitted" | "polling" | "completed" | "failed";

export interface VideoSubmitRequest {
  tenantId: string;
  missionId: string;
  prompt: string;
  durationSeconds?: number;
  tier?: VideoTier;
  aspectRatio?: string;
  resolution?: "720p" | "1080p" | "4k";
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
  artifactStoragePath?: string;
  errorSafe?: string;
  pollCount: number;
  resolution?: string;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface VideoOperationStore {
  save(op: VideoOperation): Promise<void>;
  load(operationId: string): Promise<VideoOperation | null>;
}

/** In-memory store for unit tests only. */
export class InMemoryVideoOperationStore implements VideoOperationStore {
  private readonly map = new Map<string, VideoOperation>();
  async save(op: VideoOperation): Promise<void> {
    this.map.set(op.operationId, { ...op });
  }
  async load(operationId: string): Promise<VideoOperation | null> {
    const hit = this.map.get(operationId);
    return hit ? { ...hit } : null;
  }
}

/**
 * Durable store backed by a Supabase-like client (ai_media_operations).
 * Survives process restart — required for Vercel/workers.
 */
export class SupabaseVideoOperationStore implements VideoOperationStore {
  private readonly client: {
    from: (table: string) => {
      upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }>;
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
        };
      };
    };
  };

  constructor(client: {
    from: (table: string) => {
      upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }>;
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
        };
      };
    };
  }) {
    this.client = client;
  }

  async save(op: VideoOperation): Promise<void> {
    const { error } = await this.client.from("ai_media_operations").upsert(
      {
        tenant_id: op.tenantId,
        mission_id: op.missionId || null,
        provider: op.provider,
        model: op.model,
        provider_operation_id: op.operationId,
        media_type: "video",
        status: op.status,
        duration_seconds: op.durationSeconds ?? null,
        resolution: op.resolution ?? null,
        estimated_cost_usd: op.estimatedCostUsd,
        artifact_storage_path: op.artifactStoragePath ?? op.artifactUri ?? null,
        safe_error: op.errorSafe ?? null,
        poll_count: op.pollCount,
        updated_at: op.updatedAt,
        created_at: op.createdAt,
      },
      { onConflict: "provider,provider_operation_id" },
    );
    if (error) {
      throw new AIProviderError("PROVIDER_FAILURE", `durable_store_save_failed:${error.message}`);
    }
  }

  async load(operationId: string): Promise<VideoOperation | null> {
    const { data } = await this.client
      .from("ai_media_operations")
      .select("*")
      .eq("provider_operation_id", operationId)
      .maybeSingle();
    if (!data) return null;
    return {
      operationId: String(data.provider_operation_id),
      status: data.status as VideoOperationStatus,
      provider: "google",
      model: String(data.model),
      tenantId: String(data.tenant_id),
      missionId: String(data.mission_id ?? ""),
      estimatedCostUsd: Number(data.estimated_cost_usd ?? 0),
      artifactUri: data.artifact_storage_path ? String(data.artifact_storage_path) : undefined,
      artifactStoragePath: data.artifact_storage_path ? String(data.artifact_storage_path) : undefined,
      errorSafe: data.safe_error ? String(data.safe_error) : undefined,
      pollCount: Number(data.poll_count ?? 0),
      resolution: data.resolution ? String(data.resolution) : undefined,
      durationSeconds: data.duration_seconds != null ? Number(data.duration_seconds) : undefined,
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  }
}

export interface VideoMediaDeps {
  geminiApiKey?: string;
  fetchImpl?: FetchLike;
  maxPolls?: number;
  sleepMs?: (ms: number) => Promise<void>;
  store?: VideoOperationStore;
  /** Optional canonical storage — required for VIDEO_CANONICAL_STORAGE readiness. */
  storage?: CanonicalMediaStorage;
  usageRecorder?: import("../usage/recorder.ts").AIUsageRecorder;
  budgetEnvelope?: import("../types.ts").AIBudgetEnvelope;
}

function modelForTier(tier: VideoTier, env = process.env): string {
  if (tier === "fast") return resolveModelId("GOOGLE_VIDEO_FAST", env);
  if (tier === "premium") return resolveModelId("GOOGLE_VIDEO_PREMIUM", env);
  return resolveModelId("GOOGLE_VIDEO_ECONOMY", env);
}

export class VideoMediaRuntime {
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxPolls: number;
  private readonly sleepMs: (ms: number) => Promise<void>;
  private readonly store: VideoOperationStore;
  private readonly storage?: CanonicalMediaStorage;
  private readonly usageRecorder?: import("../usage/recorder.ts").AIUsageRecorder;
  private readonly budgetEnvelope?: import("../types.ts").AIBudgetEnvelope;

  constructor(deps: VideoMediaDeps = {}) {
    this.apiKey = Object.prototype.hasOwnProperty.call(deps, "geminiApiKey")
      ? deps.geminiApiKey
      : process.env.GEMINI_API_KEY;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.maxPolls = deps.maxPolls ?? 8;
    this.sleepMs = deps.sleepMs ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.store = deps.store ?? new InMemoryVideoOperationStore();
    this.storage = deps.storage;
    this.usageRecorder = deps.usageRecorder;
    this.budgetEnvelope = deps.budgetEnvelope;
  }

  /** Test helper — prefer shared durable store across runtimes instead. */
  async seedOperation(op: VideoOperation): Promise<void> {
    await this.store.save(op);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async persistOp(op: VideoOperation): Promise<VideoOperation> {
    try {
      await this.store.save(op);
      return op;
    } catch (err) {
      const failed: VideoOperation = {
        ...op,
        status: "failed",
        errorSafe: err instanceof Error ? err.message.slice(0, 160) : "durable_store_save_failed",
        updatedAt: new Date().toISOString(),
      };
      return failed;
    }
  }

  private async recordUsage(op: VideoOperation, success: boolean): Promise<void> {
    if (!this.usageRecorder) return;
    try {
      await this.usageRecorder.record({
        tenantId: op.tenantId,
        missionId: op.missionId || null,
        department: "creative",
        specialistRole: null,
        taskClass: "CREATIVE_TEXT",
        provider: "google",
        model: op.model,
        attemptNumber: 1,
        fallbackUsed: false,
        fallbackReason: "none",
        escalationLevel: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: op.estimatedCostUsd,
        latencyMs: 0,
        success,
        errorCategory: success ? null : "PROVIDER_FAILURE",
        selectionReason: `video:${op.model}`,
        requestId: op.operationId,
        createdAt: op.createdAt,
        mediaUnits: op.durationSeconds ?? 1,
      });
    } catch {
      /* non-blocking */
    }
  }

  async submit(request: VideoSubmitRequest): Promise<VideoOperation> {
    if (!request.tenantId) throw new AIProviderError("TENANT_ISOLATION", "tenant_required");
    if (!this.isConfigured()) {
      const now = new Date().toISOString();
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
        createdAt: now,
        updatedAt: now,
      };
    }

    const model = modelForTier(request.tier ?? "economy");
    if (isForbiddenModel(model) || /sora/i.test(model)) {
      throw new AIProviderError("INVALID_INPUT", `forbidden_video_model:${model}`);
    }
    assertActiveModel(model);

    const duration = Math.max(1, Math.min(request.durationSeconds ?? 6, 30));
    const resolution = request.resolution ?? "720p";
    const estimatedCostUsd = estimateVideoCostUsd(model, duration, { resolution });

    if (this.budgetEnvelope) {
      const projected = {
        ...this.budgetEnvelope,
        spentUsdThisMonth: this.budgetEnvelope.spentUsdThisMonth + estimatedCostUsd,
      };
      const gate = evaluateBudgetGate(projected);
      if (!gate.allowExecution) {
        const now = new Date().toISOString();
        return {
          operationId: `budget_${crypto.randomUUID()}`,
          status: "failed",
          provider: "google",
          model,
          tenantId: request.tenantId,
          missionId: request.missionId,
          estimatedCostUsd: 0,
          errorSafe: "BUDGET_EXHAUSTED",
          pollCount: 0,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

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
      estimatedCostUsd,
      pollCount: 0,
      resolution,
      durationSeconds: duration,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.persistOp(op);
    if (saved.status === "failed") return saved;
    await this.recordUsage(saved, true);
    return saved;
  }

  async poll(operationId: string): Promise<VideoOperation> {
    const existing = await this.store.load(operationId);
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
      const failed = { ...existing, status: "failed" as const, errorSafe: "NOT_CONFIGURED" };
      return this.persistOp(failed);
    }
    if (existing.pollCount >= this.maxPolls) {
      const failed = {
        ...existing,
        status: "failed" as const,
        errorSafe: "poll_budget_exhausted",
        updatedAt: new Date().toISOString(),
      };
      return this.persistOp(failed);
    }

    const response = await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/${operationId}`, {
      method: "GET",
      headers: { "x-goog-api-key": this.apiKey },
    });
    if (!response.ok) {
      const failed = {
        ...existing,
        status: "failed" as const,
        errorSafe: `poll_http_${response.status}`,
        pollCount: existing.pollCount + 1,
        updatedAt: new Date().toISOString(),
      };
      return this.persistOp(failed);
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
      return this.persistOp(failed);
    }

    if (json.done) {
      const providerUri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      let artifactUri = providerUri;
      let artifactStoragePath = providerUri;
      let errorSafe: string | undefined = providerUri ? undefined : "missing_artifact";

      if (providerUri && this.storage?.persistGeneratedVideo) {
        try {
          const downloaded = await this.fetchImpl(providerUri, {
            method: "GET",
            headers: { "x-goog-api-key": this.apiKey! },
          });
          if (downloaded.ok) {
            const buf = new Uint8Array(await downloaded.arrayBuffer());
            const stored = await this.storage.persistGeneratedVideo({
              tenantId: existing.tenantId,
              missionId: existing.missionId,
              mimeType: "video/mp4",
              bytes: buf,
              originalName: `${existing.operationId.replace(/\W+/g, "_")}.mp4`,
            });
            artifactUri = stored.uri;
            artifactStoragePath = stored.storagePath;
          } else {
            errorSafe = "artifact_download_failed";
          }
        } catch {
          errorSafe = "artifact_persist_failed";
        }
      }

      const completed: VideoOperation = {
        ...existing,
        status: artifactUri && !errorSafe ? "completed" : providerUri && !this.storage ? "completed" : "failed",
        artifactUri,
        artifactStoragePath,
        errorSafe: artifactUri && (!errorSafe || !this.storage) ? undefined : errorSafe ?? "missing_artifact",
        pollCount,
        updatedAt: new Date().toISOString(),
      };
      // When storage is absent, keep provider URI only as ephemeral poll result — not a tenant asset claim.
      if (!this.storage && providerUri) {
        completed.status = "completed";
        completed.errorSafe = undefined;
        completed.artifactUri = providerUri;
        completed.artifactStoragePath = undefined;
      }
      return this.persistOp(completed);
    }

    const polling: VideoOperation = {
      ...existing,
      status: "polling",
      pollCount,
      updatedAt: new Date().toISOString(),
    };
    return this.persistOp(polling);
  }

  async awaitCompletion(operationId: string, backoffMs = 1500): Promise<VideoOperation> {
    let op = await this.poll(operationId);
    while (op.status === "submitted" || op.status === "polling") {
      await this.sleepMs(backoffMs);
      backoffMs = Math.min(backoffMs * 1.5, 10_000);
      op = await this.poll(operationId);
    }
    return op;
  }
}

export function assertNoSoraPath(model: string): void {
  if (/sora/i.test(model)) throw new AIProviderError("INVALID_INPUT", "sora_not_supported");
}
