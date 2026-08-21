/**
 * Social generate_image tool execution — actor auth then service-role media factory.
 */

import crypto from "node:crypto";
import type { OwnerContext } from "../db-context.ts";
import { type AgentActorContext, isTenantAgentContext } from "../agent-tenant-types.ts";
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
  if (!client || typeof (client as any).from !== "function") {
    return { version: null, snapshot: {} };
  }
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
 * Supports both OwnerContext and AgentTenantContext; metering/persistence uses service writer after tenant auth.
 */
export async function executeGenerateImageTool(
  ctx: AgentActorContext,
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

  let tenantId: string | undefined;
  let actorUserId: string;

  if (isTenantAgentContext(ctx)) {
    tenantId = ctx.tenantId;
    actorUserId = ctx.actorUserId;
  } else {
    const tenantResolution = await deps.resolveCurrentTenant(ctx.supabase, ctx.ownerId);
    tenantId = tenantResolution.active?.tenantId;
    actorUserId = ctx.ownerId;
  }

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

  const sessionId = str(args, "sessionId") || `session_${actorUserId}`;
  // Tool/model-supplied missionId is never authoritative for Social Copilot.
  const resolveMission =
    deps.resolveAuthorizedMissionId ??
    (async () => null as string | null);
  const missionId = await resolveMission({
    authorizationClient: ctx.supabase,
    tenantId,
    candidateMissionId: str(args, "missionId") || null,
  });

  const internalWriteClient = deps.createInternalWriteClient();
  const [tier, spendResult] = await Promise.all([
    deps.resolveTenantPlanTier(internalWriteClient, tenantId),
    deps.resolveTenantMonthSpend(internalWriteClient, tenantId),
  ]);

  const spentUsdThisMonth = spendResult.ok ? spendResult.spentUsd : 0;
  const media = deps.createTenantMediaRuntime({
    tenantId,
    ownerId: actorUserId,
    missionId,
    sessionId,
    plan: tier,
    spentUsdThisMonth,
    internalWriteClient,
  });

  const budgetGate = deps.evaluateBudgetGate(media.budgetEnvelope);
  const provider = getImageProvider();
  const runtimeStatus = resolveImageGenerationRuntimeStatus({
    providerConfigured: !(provider instanceof BlockedImageProvider),
    budgetValid: budgetGate.allowExecution,
    storageReady: true,
    modelAvailable: true,
    tenantAuthorized: true,
  });

  if (runtimeStatus !== "OPERATIONAL") {
    return {
      outcome: !budgetGate.allowExecution ? "FAILED" : "NOT_CONFIGURED",
      runtimeStatus,
      candidates: [],
      selectedCandidateId: null,
      reason: !budgetGate.allowExecution ? "budget_exceeded" : "no_image_provider_configured",
      capability: "media.image_generation",
      persistedMediaAssetIds: [] as string[],
      uiState: "setup_required",
    };
  }

  const briefText = str(args, "brief");
  if (!briefText) {
    return {
      outcome: "FAILED",
      runtimeStatus,
      candidates: [],
      selectedCandidateId: null,
      reason: "brief_required",
      capability: "media.image_generation",
      persistedMediaAssetIds: [] as string[],
      uiState: "setup_required",
    };
  }

  const writeClient = internalWriteClient as ReturnType<typeof createSupabaseServiceClient> | undefined;
  const brand = writeClient
    ? await loadImageBrandContext(writeClient, tenantId)
    : { version: null, snapshot: {} };

  const aspectRatio = str(args, "aspectRatio", "1:1");
  const language = str(args, "language");
  const providerPrompt = buildProviderReadyImagePrompt({
    brief: briefText,
    brandContext: brand.snapshot,
    intendedUse: "social_post",
    aspectRatio,
    language: language || undefined,
  });

  const generationJobId = crypto.randomUUID();
  const generationRequestId = str(args, "generationRequestId") || `genreq_${generationJobId}`;

  if (writeClient && typeof (writeClient as any).from === "function" && generationJobId) {
    const { data: existing } = await writeClient
      .from("image_generation_jobs")
      .select("id, status, selected_candidate_id")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", generationRequestId)
      .maybeSingle();

    if (existing) {
      const { data: candidates } = await writeClient
        .from("image_generation_candidates")
        .select("id, asset_id, status, provider, model, mime_type")
        .eq("job_id", existing.id);

      const candidateRows = (candidates ?? []).map((row) => ({
        candidateId: row.id,
        storedAssetId: row.asset_id,
        previewUrl: null as string | null,
        provider: row.provider,
        model: row.model,
        format: row.mime_type,
        status: row.status,
      }));

      return {
        outcome: existing?.status === "READY" ? "REVISION_REQUIRED" : existing?.status === "FAILED" ? "FAILED" : "PENDING",
        runtimeStatus,
        candidates: candidateRows,
        selectedCandidateId: existing.selected_candidate_id,
        capability: "media.image_generation",
        persistedMediaAssetIds: candidateRows
          .map((c) => c.storedAssetId)
          .filter((id): id is string => Boolean(id)),
        generationJobId: existing.id,
        uiState: "candidates_ready",
      };
    }

    if (!existing) {
      const { error } = await writeClient.from("image_generation_jobs").insert({
        id: generationJobId,
        tenant_id: tenantId,
        actor_user_id: actorUserId,
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

  if (writeClient && typeof (writeClient as any).from === "function" && generationJobId) {
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
