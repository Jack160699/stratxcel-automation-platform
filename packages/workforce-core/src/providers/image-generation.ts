import { createServiceClient } from "@stratxcel/missions";
import { getBrandBrainVersion } from "@stratxcel/brand-brain";
import { buildProviderReadyImagePrompt, createTenantMediaRuntime, resolveTenantMonthSpend, resolveTenantPlanTier, snapshotImageBrandContext } from "@stratxcel/ai-runtime";
import { unknownCostUsage, type CapabilityProvider, type ProviderExecuteResult } from "./types.ts";

function configured() {
  return Boolean((process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function text(input: Record<string, unknown> | undefined, key: string, max: number): string {
  const value = input?.[key];
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

async function failed(client: ReturnType<typeof createServiceClient>, jobId: string, reason: string) {
  await client.from("image_generation_jobs").update({ status: "FAILED", error_code: reason.slice(0, 100), safe_error: "Workforce image generation did not create a canonical asset.", error_retryable: /rate|timeout|storage|failed/i.test(reason), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
}

export function createWorkforceImageGenerationProvider(): CapabilityProvider {
  return {
    key: "media-image-ai-runtime",
    capabilityKeys: ["media.image_generation"],
    status: "IMPLEMENTED",
    probeReadiness: () => configured()
      ? { ready: true, status: "IMPLEMENTED", reasonCode: "READY", details: "Canonical AI Runtime image provider" }
      : { ready: false, status: "NOT_CONFIGURED", reasonCode: "PROVIDER_NOT_CONFIGURED", details: "GEMINI_API_KEY or OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required" },
    execute: async (request): Promise<ProviderExecuteResult> => {
      if (!configured()) return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "AUTH_CONFIGURATION", errorMessage: "Image provider or canonical storage is not configured", usage: unknownCostUsage({ requests: 0 }) };
      const brief = text(request.input, "brief", 4000) || text(request.input, "prompt", 4000);
      if (!brief) return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "INVALID_INPUT", errorMessage: "media.image_generation requires a brief", usage: unknownCostUsage({ requests: 0 }) };
      const client = createServiceClient();
      const { data: mission } = await client.from("missions").select("id,tenant_id,created_by,brand_brain_version").eq("id", request.missionId).eq("tenant_id", request.tenantId).maybeSingle();
      if (!mission) return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "POLICY_BLOCK", errorMessage: "Mission tenant binding could not be verified", usage: unknownCostUsage({ requests: 0 }) };
      let actorUserId = mission.created_by as string | null;
      if (!actorUserId) {
        const { data: member } = await client.from("tenant_members").select("user_id").eq("tenant_id", request.tenantId).limit(1).maybeSingle();
        actorUserId = member?.user_id ?? null;
      }
      if (!actorUserId) return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "POLICY_BLOCK", errorMessage: "No authorized media owner is associated with the mission", usage: unknownCostUsage({ requests: 0 }) };
      const brandVersion = typeof mission.brand_brain_version === "number" ? mission.brand_brain_version : null;
      const brandRow = brandVersion
        ? await getBrandBrainVersion(client as never, request.tenantId, brandVersion).catch(() => null)
        : null;
      const brandSnapshot = snapshotImageBrandContext((brandRow?.content as Record<string, unknown> | null) ?? null);
      const aspectRatio = text(request.input, "aspectRatio", 10) || "1:1";
      const providerPrompt = buildProviderReadyImagePrompt({ brief, intendedUse: "general", aspectRatio, brandContext: brandSnapshot });
      const { data: existing } = await client.from("image_generation_jobs").select("id,status,selected_candidate_id,provider,model,error_code").eq("tenant_id", request.tenantId).eq("actor_user_id", actorUserId).eq("idempotency_key", request.requestId).maybeSingle();
      if (existing?.status === "READY" && existing.selected_candidate_id) {
        const { data: candidate } = await client.from("image_generation_candidates").select("asset_id").eq("id", existing.selected_candidate_id).maybeSingle();
        return { ok: Boolean(candidate), providerKey: "media-image-ai-runtime", providerReference: existing.id, outputArtifactIds: candidate ? [candidate.asset_id] : [], usage: { generatedImages: 0, requests: 0, providerReportedCost: 0, currency: "USD", costKnown: true }, receipt: { generationJobId: existing.id, mediaAssetId: candidate?.asset_id, idempotentReplay: true, provider: existing.provider, model: existing.model } };
      }
      if (existing) {
        const inProgress = ["QUEUED", "PROCESSING", "REVIEWING", "REVISING"].includes(existing.status);
        return { ok: false, providerKey: "media-image-ai-runtime", providerReference: existing.id, errorCategory: "PROVIDER_FAILURE", errorMessage: inProgress ? "Image generation is already in progress" : existing.error_code ?? "Previous image generation did not complete", usage: unknownCostUsage({ requests: 0 }), receipt: { generationJobId: existing.id, idempotentReplay: true, status: existing.status } };
      }
      const jobId = crypto.randomUUID();
      const { error } = await client.from("image_generation_jobs").insert({ id: jobId, tenant_id: request.tenantId, actor_user_id: actorUserId, mission_id: request.missionId, source_context: "workforce", source_id: request.requestId, idempotency_key: request.requestId, status: "PROCESSING", brief, normalized_prompt: providerPrompt, intended_use: "general", aspect_ratio: aspectRatio, candidate_count: 1, brand_brain_version: brandVersion, brand_context_snapshot: brandSnapshot, started_at: new Date().toISOString() });
      if (error) return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "INTERNAL_FAILURE", errorMessage: "Generation job could not be persisted", usage: unknownCostUsage({ requests: 0 }) };
      const spend = await resolveTenantMonthSpend(client as never, request.tenantId);
      if (!spend.ok) { await failed(client, jobId, "USAGE_LEDGER_UNAVAILABLE"); return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "POLICY_BLOCK", errorMessage: "Usage accounting unavailable", usage: unknownCostUsage({ requests: 0 }) }; }
      const plan = await resolveTenantPlanTier(client as never, request.tenantId);
      const media = createTenantMediaRuntime({ tenantId: request.tenantId, ownerId: actorUserId, missionId: request.missionId, sessionId: request.requestId, plan, spentUsdThisMonth: spend.spentUsd, internalWriteClient: client as never });
      const refs = Array.isArray(request.input?.referenceAssetIds) ? request.input.referenceAssetIds.map(String).slice(0, 5) : [];
      const generated = await media.images.generate({ tenantId: request.tenantId, missionId: request.missionId, generationRequestId: request.requestId, prompt: providerPrompt, aspectRatio, candidateCount: 1, referenceAssetIds: refs, persistCanonical: true });
      const output = generated.candidates[0];
      if (generated.outcome !== "OK" || !output?.storedAsset) {
        await failed(client, jobId, generated.reason ?? generated.outcome);
        return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: generated.outcome === "BUDGET_EXHAUSTED" ? "QUOTA" : "PROVIDER_FAILURE", errorMessage: generated.reason ?? generated.outcome, usage: unknownCostUsage({ requests: 1 }) };
      }
      const provenance = { generationJobId: jobId, tenantId: request.tenantId, missionId: request.missionId, requestId: request.requestId, provider: output.provider, model: output.model, referenceAssetIds: refs };
      const { error: candidateError } = await client.from("image_generation_candidates").insert({ id: output.id, job_id: jobId, tenant_id: request.tenantId, asset_id: output.storedAsset.assetId, status: "SELECTED", revision_number: 0, provider: output.provider, model: output.model, provider_output_id: output.id, mime_type: output.mimeType, estimated_cost_usd: output.estimatedCostUsd, critique: { kind: "workforce_preflight", advisory: true, decision: "SELECTED_FOR_MISSION", humanApprovalRequiredForExternalPublish: true }, provenance });
      if (candidateError) { await failed(client, jobId, "CANDIDATE_PERSIST_FAILED"); return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "INTERNAL_FAILURE", errorMessage: "Generated candidate could not be persisted", usage: unknownCostUsage({ requests: 1 }) }; }
      const { error: assetError } = await client.from("social_media_assets").update({ source_type: "generated", generation_job_id: jobId, tenant_id: request.tenantId, provenance }).eq("id", output.storedAsset.assetId).eq("tenant_id", request.tenantId);
      if (assetError) { await failed(client, jobId, "CANONICAL_METADATA_LINK_FAILED"); return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "INTERNAL_FAILURE", errorMessage: "Canonical media provenance could not be linked", usage: unknownCostUsage({ requests: 1 }) }; }
      const { data: artifact, error: artifactError } = await client.from("mission_artifacts").insert({ mission_id: request.missionId, kind: "image_final", storage_ref: `social_media_assets:${output.storedAsset.assetId}`, metadata: { ...provenance, mediaAssetId: output.storedAsset.assetId, candidateId: output.id } }).select("id").single();
      if (artifactError || !artifact) { await failed(client, jobId, "MISSION_ARTIFACT_FAILED"); return { ok: false, providerKey: "media-image-ai-runtime", errorCategory: "INTERNAL_FAILURE", errorMessage: "Mission artifact could not be persisted", usage: unknownCostUsage({ requests: 1 }) }; }
      const { error: finalizeError } = await client.from("image_generation_jobs").update({ status: "READY", selected_candidate_id: output.id, provider: output.provider, model: output.model, provider_request_id: request.requestId, actual_cost_usd: generated.recordedProviderCostUsd ?? output.estimatedCostUsd, usage_accounting_status: generated.usageAccountingStatus ?? "SKIPPED", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
      if (finalizeError) return { ok: false, providerKey: "media-image-ai-runtime", providerReference: jobId, errorCategory: "INTERNAL_FAILURE", errorMessage: "Generation job could not be finalized", usage: unknownCostUsage({ requests: 1 }), receipt: { generationJobId: jobId, mediaAssetId: output.storedAsset.assetId, missionArtifactId: artifact.id } };
      return { ok: true, providerKey: "media-image-ai-runtime", providerReference: jobId, outputArtifactIds: artifact?.id ? [artifact.id] : [output.storedAsset.assetId], usage: { generatedImages: 1, requests: 1, providerReportedCost: generated.recordedProviderCostUsd ?? output.estimatedCostUsd, currency: "USD", costKnown: true }, receipt: { generationJobId: jobId, candidateId: output.id, mediaAssetId: output.storedAsset.assetId, missionArtifactId: artifact?.id ?? null, provider: output.provider, model: output.model, usageAccountingStatus: generated.usageAccountingStatus } };
    },
  };
}
