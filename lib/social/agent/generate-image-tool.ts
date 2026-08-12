/**
 * Social generate_image tool execution — owner auth then service-role media factory.
 */

import type { OwnerContext } from "../db-context.ts";
import { getImageProvider, BlockedImageProvider } from "@stratxcel/creative-studio";
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
  try {
    const internalWriteClient = deps.createInternalWriteClient();
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

  const result = await requestGenerateImage({
    tenantId,
    missionId,
    sessionId,
    briefText: str(args, "brief"),
    referenceMediaAssetIds: arr(args, "referenceMediaAssetIds"),
    candidateCount: typeof args.candidateCount === "number" ? args.candidateCount : 2,
    runtime: media.images,
    storage: media.storage,
    budgetEnvelope: media.budgetEnvelope,
    budgetValid: budgetGate.allowExecution,
  });

  return {
    ...result,
    capability: "media.image_generation",
    runtimeStatus: result.runtimeStatus || runtimeStatus,
    persistedMediaAssetIds: result.candidates
      .map((c) => c.storedAssetId)
      .filter((id): id is string => Boolean(id)),
    uiState:
      result.outcome === "NOT_CONFIGURED" || result.outcome === "WAITING_CONFIGURATION"
        ? "setup_required"
        : "candidates_ready",
  };
}
