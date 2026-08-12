/**
 * Social generate_image tool execution — owner auth then service-role media factory.
 */

import crypto from "node:crypto";
import type { OwnerContext } from "../db-context.ts";
import { getImageProvider, BlockedImageProvider } from "@stratxcel/creative-studio";
import { buildProviderReadyImagePrompt, snapshotImageBrandContext } from "@stratxcel/ai-runtime";
import { requestGenerateImage } from "./generate-image-capability.ts";
import { resolveImageGenerationRuntimeStatus } from "./capability-evidence.ts";
import { createSupabaseServiceClient } from "../../supabase/service.ts";

function str(args: Record<string, unknown>, key: string, fallback = ""): string {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
}
function arr(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.map(String) : [];
}

export interface GenerateImageToolDeps {
  resolveCurrentTenant: (
    supabase: OwnerContext["supabase"],
    ownerId: string,
  ) => Promise<{ active?: { tenantId: string } | null }>;
  createInternalWriteClient: () => unknown;
  resolveTenantMonthSpend: (
    client: unknown,
    tenantId: string,
  ) => Promise<{ ok: true; spentUsd: number } | { ok: false; reason: string }>;
  resolveTenantPlanTier: (
    client: unknown,
    tenantId: string,
  ) => Promise<"starter" | "growth" | "business" | "scale" | "custom">;
  createTenantMediaRuntime: (input: {
    tenantId: string;
    ownerId: string;
    missionId: string | null;
    sessionId: string;
    plan: "starter" | "growth" | "business" | "scale" | "custom";
    spentUsdThisMonth: number;
    internalWriteClient: unknown;
  }) => {
    images: import("@stratxcel/ai-runtime").ImageMediaRuntime;
    storage: import("@stratxcel/ai-runtime").CanonicalMediaStorage;
    budgetEnvelope: import("@stratxcel/ai-runtime").AIBudgetEnvelope;
  };
  evaluateBudgetGate: (envelope: import("@stratxcel/ai-runtime").AIBudgetEnvelope) => {
    allowExecution: boolean;
  };
  /** Server-side mission verification — never trust tool/model missionId alone. */
  resolveAuthorizedMissionId?: (args: {
    authorizationClient: OwnerContext["supabase"];
    tenantId: string;
    candidateMissionId?: string | null;
  }) => Promise<string | null>;
}

async function defaultDeps(): Promise<GenerateImageToolDeps> {
  const runtime = await import("@stratxcel/ai-runtime");
  const { resolveCurrentTenant } = await import("../../tenants/current-tenant.ts");
  return {
    resolveCurrentTenant: resolveCurrentTenant as GenerateImageToolDeps["resolveCurrentTenant"],
    createInternalWriteClient: () => createSupabaseServiceClient(),
    resolveTenantMonthSpend: runtime.resolveTenantMonthSpend as GenerateImageToolDeps["resolveTenantMonthSpend"],
    resolveTenantPlanTier: runtime.resolveTenantPlanTier as GenerateImageToolDeps["resolveTenantPlanTier"],
    createTenantMediaRuntime: runtime.createTenantMediaRuntime as GenerateImageToolDeps["createTenantMediaRuntime"],
    evaluateBudgetGate: runtime.evaluateBudgetGate,
    resolveAuthorizedMissionId: async (args) =>
      runtime.resolveAuthorizedMissionId({
        authorizationClient: args.authorizationClient as never,
        tenantId: args.tenantId,
        candidateMissionId: args.candidateMissionId,
      }),
  };
}

async function loadImageBrandContext(
  client: ReturnType<typeof createSupabaseServiceClient>,
  tenantId: string,
): Promise<{ version: number | null; snapshot: Record<string, unknown> }> {
  const { data: brain } = await client
    .from("brand_brains")
    .select("current_version")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!brain?.current_version) return { version: null, snapshot: {} };
  const { data: version } = await client
    .from("brand_brain_versions")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("version", brain.current_version)
    .maybeSingle();
  return {
    version: brain.current_version,
    snapshot: snapshotImageBrandContext((version?.content as Record<string, unknown> | null) ?? null),
  };
}

/**
 * Production Social generate_image path.
 * Authorization uses OwnerContext; metering/persistence uses service writer after tenant auth.
 */
export async function executeGenerateImageTool(
  ctx: OwnerContext,
  args: Record<string, unknown>,
  depsOverride?: Partial<GenerateImageToolDeps>,
): Promise<Record<string, unknown>> {
  const deps: GenerateImageToolDeps = depsOverride?.resolveCurrentTenant
    ? ({
        resolveCurrentTenant: depsOverride.resolveCurrentTenant!,
        createInternalWriteClient:
          depsOverride.createInternalWriteClient ?? (() => createSupabaseServiceClient()),
        resolveTenantMonthSpend: depsOverride.resolveTenantMonthSpend!,
        resolveTenantPlanTier: depsOverride.resolveTenantPlanTier!,
        createTenantMediaRuntime: depsOverride.createTenantMediaRuntime!,
        evaluateBudgetGate: depsOverride.evaluateBudgetGate!,
        resolveAuthorizedMissionId: depsOverride.resolveAuthorizedMissionId,
      } as GenerateImageToolDeps)
    : { ...(await defaultDeps()), ...depsOverride };
  const tenantResolution = await deps.resolveCurrentTenant(ctx.supabase, ctx.ownerId);
  const tenantId = tenantResolution.active?.tenantId;
  if (!tenantId) {
    return {
      outcome: "FAILED",
      runtimeStatus: "NOT_CONFIGURED",
      candidates: [],
      selectedCandidateId: null,
      reason: "tenant_required_for_billable_ai",
      capability: "media.image_generation",
      persistedMediaAssetIds: [] as string[],
      uiState: "setup_required",
    };
  }

  const sessionId = str(args, "sessionId") || `session_${ctx.ownerId}`;
  // Tool/model-supplied missionId is never authoritative for Social Copilot.
  const resolveMission =
    deps.resolveAuthorizedMissionId ??
    (async () => null as string | null);
  const missionId = await resolveMission({
    authorizationClient: ctx.supabase,
    tenantId,
    candidateMissionId: str(args, "missionId") || null,
  });

  let media: ReturnType<GenerateImageToolDeps["createTenantMediaRuntime"]>;
  let internalWriteClient: unknown = null;
  try {
    internalWriteClient = deps.createInternalWriteClient();
    const spend = await deps.resolveTenantMonthSpend(internalWriteClient, tenantId);
    if (!spend.ok) {
      return {
        outcome: "WAITING_CONFIGURATION",
        runtimeStatus: "WAITING_CONFIGURATION",
        candidates: [],
        selectedCandidateId: null,
        reason: `month_spend_${spend.reason}`,
        capability: "media.image_generation",
        persistedMediaAssetIds: [] as string[],
        uiState: "setup_required",
      };
    }
    const plan = await deps.resolveTenantPlanTier(ctx.supabase, tenantId);
    media = deps.createTenantMediaRuntime({
      tenantId,
      ownerId: ctx.ownerId,
      missionId,
      sessionId,
      plan,
      spentUsdThisMonth: spend.spentUsd,
      internalWriteClient,
    });
  } catch (err) {
    return {
      outcome: "WAITING_CONFIGURATION",
      runtimeStatus: "WAITING_CONFIGURATION",
      candidates: [],
      selectedCandidateId: null,
      reason: err instanceof Error ? err.message.slice(0, 160) : "media_factory_failed",
      capability: "media.image_generation",
      persistedMediaAssetIds: [] as string[],
      uiState: "setup_required",
    };
  }

  const provider = getImageProvider();
  const storageReady = await media.storage.isWritable();
  const budgetGate = deps.evaluateBudgetGate(media.budgetEnvelope);
  const runtimeStatus = resolveImageGenerationRuntimeStatus({
    providerConfigured: Boolean(provider) && !(provider instanceof BlockedImageProvider),
    storageReady,
    tenantAuthorized: true,
    budgetValid: budgetGate.allowExecution,
    modelAvailable: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
  });

  const briefText = str(args, "brief").slice(0, 4000);
  const aspectRatio = str(args, "aspectRatio") || "1:1";
  const generationRequestId = str(args, "generationRequestId") || `social-image:${tenantId}:${sessionId}:${crypto.createHash("sha256").update(briefText).digest("hex").slice(0, 32)}`;
  let generationJobId: string | null = null;
  const writeClient = internalWriteClient && typeof (internalWriteClient as { from?: unknown }).from === "function"
    ? internalWriteClient as ReturnType<typeof createSupabaseServiceClient>
    : null;
  const brand = writeClient
    ? await loadImageBrandContext(writeClient, tenantId).catch(() => ({ version: null, snapshot: {} }))
    : { version: null, snapshot: {} };
  const providerPrompt = buildProviderReadyImagePrompt({
    brief: briefText,
    intendedUse: "social_post",
    aspectRatio,
    brandContext: brand.snapshot,
  });
  if (writeClient) {
    const { data: existing } = await writeClient
      .from("image_generation_jobs")
      .select("id,status,provider,model,selected_candidate_id,error_code")
      .eq("tenant_id", tenantId)
      .eq("actor_user_id", ctx.ownerId)
      .eq("idempotency_key", generationRequestId)
      .maybeSingle();
    if (existing?.status === "READY") {
      const { data: rows } = await writeClient
        .from("image_generation_candidates")
        .select("id,asset_id,provider,model,mime_type")
        .eq("job_id", existing.id)
        .order("created_at", { ascending: true });
      const ids = (rows ?? []).map((row) => row.asset_id as string);
      return {
        outcome: "REVISION_REQUIRED",
        runtimeStatus: "OPERATIONAL",
        candidates: (rows ?? []).map((row) => ({ candidateId: row.id, uri: `asset://${row.asset_id}`, provider: row.provider, model: row.model, storedAssetId: row.asset_id, format: row.mime_type })),
        selectedCandidateId: existing.selected_candidate_id,
        reason: "candidate_selection_required",
        capability: "media.image_generation",
        persistedMediaAssetIds: ids,
        generationJobId: existing.id,
        idempotentReplay: true,
        uiState: "candidates_ready",
      };
    }
    if (existing && ["QUEUED", "PROCESSING", "REVIEWING", "REVISING"].includes(existing.status)) {
      return { outcome: "WAITING_CONFIGURATION", runtimeStatus: "OPERATIONAL", candidates: [], selectedCandidateId: null, reason: "generation_already_in_progress", capability: "media.image_generation", persistedMediaAssetIds: [], generationJobId: existing.id, uiState: "processing" };
    }
    if (existing?.status === "FAILED") {
      return { outcome: "FAILED", runtimeStatus: "OPERATIONAL", candidates: [], selectedCandidateId: null, reason: existing.error_code ?? "previous_generation_failed", capability: "media.image_generation", persistedMediaAssetIds: [], generationJobId: existing.id, idempotentReplay: true, uiState: "failed" };
    }
    generationJobId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      const { error } = await writeClient.from("image_generation_jobs").insert({
        id: generationJobId,
        tenant_id: tenantId,
        actor_user_id: ctx.ownerId,
        mission_id: missionId,
        source_context: "social_copilot",
        source_id: sessionId,
        idempotency_key: generationRequestId,
        status: "PROCESSING",
        brief: briefText,
        normalized_prompt: providerPrompt,
        intended_use: "social_post",
        aspect_ratio: aspectRatio,
        candidate_count: typeof args.candidateCount === "number" ? Math.max(1, Math.min(4, args.candidateCount)) : 2,
        brand_brain_version: brand.version,
        brand_context_snapshot: brand.snapshot,
        started_at: new Date().toISOString(),
      });
      if (error) return { outcome: "FAILED", runtimeStatus: "WAITING_CONFIGURATION", candidates: [], selectedCandidateId: null, reason: "generation_job_persistence_failed", capability: "media.image_generation", persistedMediaAssetIds: [], uiState: "setup_required" };
    }
  }

  const result = await requestGenerateImage({
    tenantId,
    missionId,
    sessionId,
    briefText: providerPrompt,
    generationRequestId,
    referenceMediaAssetIds: arr(args, "referenceMediaAssetIds"),
    candidateCount: typeof args.candidateCount === "number" ? args.candidateCount : 2,
    runtime: media.images,
    storage: media.storage,
    budgetEnvelope: media.budgetEnvelope,
    budgetValid: budgetGate.allowExecution,
  });

  if (writeClient && generationJobId) {
    const persisted = result.candidates.filter((candidate) => candidate.storedAssetId);
    if (result.outcome === "REVISION_REQUIRED" && persisted.length) {
      const rows = persisted.map((candidate) => ({
        id: candidate.candidateId,
        job_id: generationJobId,
        tenant_id: tenantId,
        asset_id: candidate.storedAssetId,
        status: "REVIEWED",
        revision_number: 0,
        provider: candidate.provider,
        model: candidate.model ?? "unknown",
        provider_output_id: candidate.candidateId,
        mime_type: candidate.format ?? "image/png",
        critique: { kind: "social_copilot_preflight", advisory: true, decision: "HUMAN_SELECTION_REQUIRED" },
        provenance: { generationJobId, tenantId, missionId, sessionId, generationRequestId, source: "social_copilot" },
      }));
      const { error: candidateError } = await writeClient.from("image_generation_candidates").insert(rows);
      if (candidateError) {
        await writeClient.from("image_generation_jobs").update({ status: "FAILED", error_code: "CANDIDATE_PERSIST_FAILED", safe_error: "Generated candidates could not be persisted.", error_retryable: true, completed_at: new Date().toISOString() }).eq("id", generationJobId);
        return { ...result, outcome: "FAILED", candidates: [], selectedCandidateId: null, reason: "candidate_persistence_failed", capability: "media.image_generation", persistedMediaAssetIds: [], generationJobId, uiState: "failed" };
      }
      for (const row of rows) {
        const { error: assetError } = await writeClient.from("social_media_assets").update({ source_type: "generated", generation_job_id: generationJobId, tenant_id: tenantId, provenance: row.provenance }).eq("id", row.asset_id).eq("tenant_id", tenantId);
        if (assetError) {
          await writeClient.from("image_generation_jobs").update({ status: "FAILED", error_code: "CANONICAL_METADATA_LINK_FAILED", safe_error: "Generated media provenance could not be finalized.", error_retryable: false, completed_at: new Date().toISOString() }).eq("id", generationJobId);
          return { ...result, outcome: "FAILED", candidates: [], selectedCandidateId: null, reason: "canonical_metadata_link_failed", capability: "media.image_generation", persistedMediaAssetIds: [], generationJobId, uiState: "failed" };
        }
      }
      const { error: readyError } = await writeClient.from("image_generation_jobs").update({ status: "READY", provider: result.provenance.provider, model: result.provenance.model, provider_request_id: generationRequestId, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", generationJobId);
      if (readyError) return { ...result, outcome: "FAILED", candidates: [], selectedCandidateId: null, reason: "generation_job_finalize_failed", capability: "media.image_generation", persistedMediaAssetIds: [], generationJobId, uiState: "failed" };
    } else {
      const outcomeUnknown = /timeout|outcome_unknown/i.test(result.reason ?? "");
      await writeClient.from("image_generation_jobs").update({ status: "FAILED", error_code: result.reason ?? result.outcome, safe_error: "Social image generation did not create a canonical asset.", error_retryable: result.outcome === "FAILED" && !outcomeUnknown, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", generationJobId);
    }
  }

  return {
    ...result,
    capability: "media.image_generation",
    runtimeStatus: result.runtimeStatus || runtimeStatus,
    persistedMediaAssetIds: result.candidates
      .map((c) => c.storedAssetId)
      .filter((id): id is string => Boolean(id)),
    generationJobId,
    uiState:
      result.outcome === "NOT_CONFIGURED" || result.outcome === "WAITING_CONFIGURATION"
        ? "setup_required"
        : "candidates_ready",
  };
}
