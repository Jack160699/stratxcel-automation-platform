import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import {
  createTenantMediaRuntime,
  resolveTenantMonthSpend,
  resolveTenantPlanTier,
  type ImageGenerationOutcome,
} from "@stratxcel/ai-runtime";
import { buildProviderReadyImagePrompt, createAdvisoryImageCritique, snapshotImageBrandContext } from "./prompt";
import {
  IMAGE_ASPECT_RATIOS,
  type CreateImageJobInput,
  type ImageGenerationCandidateRow,
  type ImageGenerationJobRow,
  type ImageJobDetail,
} from "./types";

const TERMINAL = new Set(["READY", "FAILED"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ImageGenerationServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ImageGenerationServiceError";
  }
}

function cleanText(value: string, max: number): string {
  return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function safeProviderReason(outcome: ImageGenerationOutcome): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const reason = outcome.reason ?? outcome.outcome;
  if (reason.includes("not_configured")) {
    return { code: "PROVIDER_NOT_CONFIGURED", message: "Image generation is not configured.", retryable: false };
  }
  if (reason.includes("storage")) {
    return { code: "STORAGE_UNAVAILABLE", message: "Generated media storage is not ready.", retryable: true };
  }
  if (reason.includes("rate") || reason.includes("429")) {
    return { code: "PROVIDER_RATE_LIMIT", message: "The image provider is temporarily rate limited.", retryable: true };
  }
  if (reason.includes("timeout") || reason.includes("outcome_unknown")) {
    return { code: "PROVIDER_TIMEOUT_UNKNOWN", message: "The provider timed out; Stratxcel will not duplicate the request automatically.", retryable: false };
  }
  if (reason.includes("reference")) {
    return { code: "REFERENCE_UNSUPPORTED_OR_INVALID", message: "One or more reference images could not be used.", retryable: false };
  }
  if (outcome.outcome === "BUDGET_EXHAUSTED") {
    return { code: "BUDGET_EXHAUSTED", message: "This workspace has reached its AI usage budget.", retryable: false };
  }
  if (outcome.outcome === "SAFETY_REFUSAL") {
    return { code: "SAFETY_REFUSAL", message: "The provider could not safely generate this image.", retryable: false };
  }
  return { code: "GENERATION_FAILED", message: "Image generation did not produce a canonical asset.", retryable: true };
}

async function assertReferencesAuthorized(
  authorizationClient: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  referenceAssetIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(referenceAssetIds)];
  if (unique.length > 5) throw new ImageGenerationServiceError("TOO_MANY_REFERENCES", "Use at most five reference images.");
  if (!unique.length) return;
  if (unique.some((id) => !UUID.test(id))) throw new ImageGenerationServiceError("INVALID_REFERENCE", "A reference asset id is invalid.");
  const { data, error } = await authorizationClient
    .from("social_media_assets")
    .select("id,tenant_id,owner_id,mime_type,size_bytes,status")
    .eq("tenant_id", tenantId)
    .eq("status", "READY")
    .in("id", unique);
  if (error) throw new ImageGenerationServiceError("REFERENCE_LOOKUP_FAILED", "References could not be verified.", 400);
  const rows = data ?? [];
  if (rows.length !== unique.length) {
    throw new ImageGenerationServiceError("REFERENCE_FORBIDDEN", "A reference is missing or belongs to another workspace.", 403);
  }
  for (const row of rows) {
    if (row.tenant_id !== tenantId || !REFERENCE_MIME_TYPES.has(String(row.mime_type))) {
      throw new ImageGenerationServiceError("REFERENCE_INVALID", "References must be authorized PNG, JPEG, or WebP images from this workspace.");
    }
    if (Number(row.size_bytes) > 20 * 1024 * 1024) {
      throw new ImageGenerationServiceError("REFERENCE_TOO_LARGE", "Reference images must be 20 MB or smaller.");
    }
    if (row.owner_id !== actorUserId && row.tenant_id !== tenantId) {
      throw new ImageGenerationServiceError("REFERENCE_FORBIDDEN", "A reference belongs to another account.", 403);
    }
  }
}

export async function createImageGenerationJob(args: {
  authorizationClient: SupabaseClient;
  writeClient: SupabaseClient;
  input: CreateImageJobInput;
}): Promise<ImageGenerationJobRow> {
  const input = args.input;
  const brief = cleanText(input.brief, 4000);
  const styleDirection = input.styleDirection ? cleanText(input.styleDirection, 500) : null;
  if (!brief) throw new ImageGenerationServiceError("BRIEF_REQUIRED", "Describe the image you want to create.");
  if (!input.tenantId || !input.actorUserId) throw new ImageGenerationServiceError("TENANT_REQUIRED", "A workspace is required.", 403);
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) {
    throw new ImageGenerationServiceError("IDEMPOTENCY_REQUIRED", "A stable request identity is required.");
  }
  const aspectRatio = input.aspectRatio ?? "1:1";
  if (!IMAGE_ASPECT_RATIOS.includes(aspectRatio)) throw new ImageGenerationServiceError("INVALID_ASPECT_RATIO", "Choose a supported aspect ratio.");
  const candidateCount = Math.max(1, Math.min(Math.floor(input.candidateCount ?? 2), 4));
  const referenceAssetIds = [...new Set(input.referenceAssetIds ?? [])];
  await assertReferencesAuthorized(args.authorizationClient, input.tenantId, input.actorUserId, referenceAssetIds);

  const { data: existing } = await args.writeClient
    .from("image_generation_jobs")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("actor_user_id", input.actorUserId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return existing as ImageGenerationJobRow;

  const brandBrain = await getCurrentBrandBrain(args.writeClient as never, input.tenantId);
  const brandSnapshot = snapshotImageBrandContext(brandBrain?.content);
  const { data: inserted, error } = await args.writeClient
    .from("image_generation_jobs")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      mission_id: input.missionId ?? null,
      source_context: input.sourceContext ?? "creative_studio",
      source_id: input.sourceId ?? null,
      idempotency_key: input.idempotencyKey,
      status: "QUEUED",
      brief,
      intended_use: input.intendedUse ?? "social_post",
      aspect_ratio: aspectRatio,
      candidate_count: candidateCount,
      style_direction: styleDirection,
      brand_brain_version: brandBrain?.current_version ?? null,
      brand_context_snapshot: brandSnapshot,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    if (error?.message.toLowerCase().includes("duplicate")) {
      const { data: raced } = await args.writeClient
        .from("image_generation_jobs")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("actor_user_id", input.actorUserId)
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (raced) return raced as ImageGenerationJobRow;
    }
    throw new ImageGenerationServiceError("JOB_CREATE_FAILED", "The generation job could not be created.", 500, true);
  }
  if (referenceAssetIds.length) {
    const { error: refError } = await args.writeClient.from("image_generation_references").insert(
      referenceAssetIds.map((assetId) => ({
        job_id: inserted.id,
        tenant_id: input.tenantId,
        asset_id: assetId,
        reference_kind: "existing_asset",
      })),
    );
    if (refError) {
      await args.writeClient.from("image_generation_jobs").delete().eq("id", inserted.id);
      throw new ImageGenerationServiceError("REFERENCE_BIND_FAILED", "References could not be attached to the job.", 500, true);
    }
  }
  return inserted as ImageGenerationJobRow;
}

async function failJob(client: SupabaseClient, jobId: string, failure: ReturnType<typeof safeProviderReason>) {
  await client
    .from("image_generation_jobs")
    .update({
      status: "FAILED",
      error_code: failure.code,
      safe_error: failure.message,
      error_retryable: failure.retryable,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function processImageGenerationJob(args: {
  writeClient: SupabaseClient;
  jobId: string;
  revisionInstruction?: string | null;
  parentCandidateId?: string | null;
}): Promise<ImageJobDetail> {
  const { data: current, error: currentError } = await args.writeClient
    .from("image_generation_jobs")
    .select("*")
    .eq("id", args.jobId)
    .single();
  if (currentError || !current) throw new ImageGenerationServiceError("JOB_NOT_FOUND", "Generation job not found.", 404);
  let job = current as ImageGenerationJobRow;
  if (job.status === "FAILED" && !job.error_retryable) return getImageGenerationJob(args.writeClient, job.id);
  if (job.status === "PROCESSING" || job.status === "REVIEWING" || job.status === "REVISING") {
    return getImageGenerationJob(args.writeClient, job.id);
  }
  if (job.status === "READY" && !args.revisionInstruction) return getImageGenerationJob(args.writeClient, job.id);

  if (args.parentCandidateId) {
    const { data: parent } = await args.writeClient
      .from("image_generation_candidates")
      .select("id")
      .eq("id", args.parentCandidateId)
      .eq("job_id", job.id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle();
    if (!parent) throw new ImageGenerationServiceError("PARENT_CANDIDATE_NOT_FOUND", "The source image for this revision is unavailable.", 404);
  }

  const revisionNumber = args.revisionInstruction ? job.revision_count + 1 : job.revision_count;
  if (revisionNumber > 3) throw new ImageGenerationServiceError("REVISION_LIMIT", "This generation has reached the three-revision limit.");
  const fromStatuses = args.revisionInstruction ? ["READY", "FAILED"] : ["QUEUED", "FAILED"];
  const targetStatus = args.revisionInstruction ? "REVISING" : "PROCESSING";
  const prompt = buildProviderReadyImagePrompt({
    brief: job.brief,
    intendedUse: job.intended_use,
    aspectRatio: job.aspect_ratio,
    styleDirection: job.style_direction,
    brandContext: job.brand_context_snapshot,
    revisionInstruction: args.revisionInstruction,
  });
  const { data: claimed, error: claimError } = await args.writeClient
    .from("image_generation_jobs")
    .update({
      status: targetStatus,
      normalized_prompt: prompt,
      revision_count: revisionNumber,
      started_at: job.started_at ?? new Date().toISOString(),
      error_code: null,
      safe_error: null,
      error_retryable: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .in("status", fromStatuses)
    .select("*")
    .maybeSingle();
  if (claimError) throw new ImageGenerationServiceError("JOB_CLAIM_FAILED", "The generation job could not be started.", 500, true);
  if (!claimed) return getImageGenerationJob(args.writeClient, job.id);
  job = claimed as ImageGenerationJobRow;

  const { data: subscription } = await args.writeClient
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", job.tenant_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!subscription) {
    await failJob(args.writeClient, job.id, {
      code: "ENTITLEMENT_UNAVAILABLE",
      message: "Image generation is unavailable for this workspace subscription.",
      retryable: false,
    });
    return getImageGenerationJob(args.writeClient, job.id);
  }

  const spend = await resolveTenantMonthSpend(args.writeClient as never, job.tenant_id);
  if (!spend.ok) {
    await failJob(args.writeClient, job.id, {
      code: "USAGE_LEDGER_UNAVAILABLE",
      message: "Usage accounting is unavailable, so paid generation was not started.",
      retryable: true,
    });
    return getImageGenerationJob(args.writeClient, job.id);
  }
  const plan = await resolveTenantPlanTier(args.writeClient as never, job.tenant_id);
  const media = createTenantMediaRuntime({
    tenantId: job.tenant_id,
    ownerId: job.actor_user_id,
    missionId: job.mission_id,
    sessionId: job.source_id ?? job.id,
    plan,
    spentUsdThisMonth: spend.spentUsd,
    internalWriteClient: args.writeClient as never,
  });
  const { data: references } = await args.writeClient
    .from("image_generation_references")
    .select("asset_id")
    .eq("job_id", job.id);
  const referenceAssetIds = (references ?? []).map((row) => String(row.asset_id));
  const outcome = await media.images.generate({
    tenantId: job.tenant_id,
    missionId: job.mission_id,
    generationRequestId: `image-job:${job.id}:revision:${revisionNumber}`,
    prompt,
    aspectRatio: job.aspect_ratio,
    candidateCount: job.candidate_count,
    referenceAssetIds,
    persistCanonical: true,
  });
  if (outcome.outcome !== "OK" || !outcome.candidates.length) {
    await failJob(args.writeClient, job.id, safeProviderReason(outcome));
    return getImageGenerationJob(args.writeClient, job.id);
  }

  await args.writeClient
    .from("image_generation_jobs")
    .update({
      status: "REVIEWING",
      provider: outcome.provider,
      model: outcome.model,
      provider_request_id: `image-job:${job.id}:revision:${revisionNumber}`,
      actual_cost_usd: outcome.recordedProviderCostUsd ?? null,
      usage_accounting_status: outcome.usageAccountingStatus ?? "SKIPPED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  const candidateRows = outcome.candidates.flatMap((candidate) => {
    const assetId = candidate.storedAsset?.assetId;
    if (!assetId) return [];
    return [{
      id: candidate.id,
      job_id: job.id,
      tenant_id: job.tenant_id,
      asset_id: assetId,
      parent_candidate_id: args.parentCandidateId ?? null,
      status: revisionNumber > 0 ? "REVISION" : "REVIEWED",
      revision_number: revisionNumber,
      provider: candidate.provider,
      model: candidate.model,
      provider_output_id: candidate.id,
      mime_type: candidate.mimeType,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
      estimated_cost_usd: candidate.estimatedCostUsd,
      critique: createAdvisoryImageCritique({
        aspectRatio: job.aspect_ratio,
        intendedUse: job.intended_use,
        hasBrandContext: Object.keys(job.brand_context_snapshot).length > 0,
        referenceCount: referenceAssetIds.length,
        provider: candidate.provider,
        model: candidate.model,
      }),
      provenance: {
        generationJobId: job.id,
        tenantId: job.tenant_id,
        actorUserId: job.actor_user_id,
        missionId: job.mission_id,
        sourceContext: job.source_context,
        sourceId: job.source_id,
        brandBrainVersion: job.brand_brain_version,
        referenceAssetIds,
        revisionNumber,
        provider: candidate.provider,
        model: candidate.model,
      },
    }];
  });
  if (!candidateRows.length) {
    await failJob(args.writeClient, job.id, {
      code: "CANONICAL_ASSET_MISSING",
      message: "The provider returned an image but canonical storage did not complete.",
      retryable: false,
    });
    return getImageGenerationJob(args.writeClient, job.id);
  }
  const { error: candidateError } = await args.writeClient.from("image_generation_candidates").insert(candidateRows);
  if (candidateError) {
    await failJob(args.writeClient, job.id, {
      code: "CANDIDATE_PERSIST_FAILED",
      message: "Generated images could not be added to the Studio history.",
      retryable: false,
    });
    return getImageGenerationJob(args.writeClient, job.id);
  }
  for (const row of candidateRows) {
    const { error: metadataError } = await args.writeClient
      .from("social_media_assets")
      .update({ source_type: "generated", generation_job_id: job.id, tenant_id: job.tenant_id, provenance: row.provenance })
      .eq("id", row.asset_id)
      .eq("tenant_id", job.tenant_id);
    if (metadataError) {
      await failJob(args.writeClient, job.id, {
        code: "CANONICAL_METADATA_LINK_FAILED",
        message: "Generated media provenance could not be finalized.",
        retryable: false,
      });
      return getImageGenerationJob(args.writeClient, job.id);
    }
  }
  await args.writeClient
    .from("image_generation_jobs")
    .update({ status: "READY", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", job.id);
  return getImageGenerationJob(args.writeClient, job.id);
}

export async function selectImageGenerationCandidate(args: {
  writeClient: SupabaseClient;
  tenantId: string;
  jobId: string;
  candidateId: string;
  actorUserId: string;
  attachToVariantId?: string | null;
}): Promise<ImageJobDetail> {
  const { data: job } = await args.writeClient
    .from("image_generation_jobs")
    .select("id,tenant_id,status,mission_id")
    .eq("id", args.jobId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (!job) throw new ImageGenerationServiceError("JOB_NOT_FOUND", "Generation job not found.", 404);
  if (job.status !== "READY") throw new ImageGenerationServiceError("JOB_NOT_READY", "Generation must finish before selecting an image.", 409);
  const { data: candidate } = await args.writeClient
    .from("image_generation_candidates")
    .select("id,asset_id,tenant_id,provenance")
    .eq("id", args.candidateId)
    .eq("job_id", args.jobId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (!candidate) throw new ImageGenerationServiceError("CANDIDATE_NOT_FOUND", "Candidate not found.", 404);
  const { error: rejectError } = await args.writeClient.from("image_generation_candidates").update({ status: "REJECTED" }).eq("job_id", args.jobId).neq("id", args.candidateId);
  if (rejectError) throw new ImageGenerationServiceError("SELECTION_FAILED", "The selected image could not be saved.", 500, true);
  const { error: candidateSelectError } = await args.writeClient.from("image_generation_candidates").update({ status: "SELECTED" }).eq("id", args.candidateId);
  if (candidateSelectError) throw new ImageGenerationServiceError("SELECTION_FAILED", "The selected image could not be saved.", 500, true);
  const { error } = await args.writeClient
    .from("image_generation_jobs")
    .update({ selected_candidate_id: args.candidateId, updated_at: new Date().toISOString() })
    .eq("id", args.jobId)
    .eq("tenant_id", args.tenantId);
  if (error) throw new ImageGenerationServiceError("SELECTION_FAILED", "The selected image could not be saved.", 500, true);

  if (job.mission_id) {
    const storageRef = `social_media_assets:${candidate.asset_id}`;
    const { data: existingArtifact } = await args.writeClient
      .from("mission_artifacts")
      .select("id")
      .eq("mission_id", job.mission_id)
      .eq("kind", "image_final")
      .eq("storage_ref", storageRef)
      .maybeSingle();
    if (!existingArtifact) {
      const { error: artifactError } = await args.writeClient.from("mission_artifacts").insert({
        mission_id: job.mission_id,
        kind: "image_final",
        storage_ref: storageRef,
        metadata: {
          generationJobId: args.jobId,
          candidateId: args.candidateId,
          mediaAssetId: candidate.asset_id,
          selectedBy: args.actorUserId,
          provenance: candidate.provenance,
        },
      });
      if (artifactError) throw new ImageGenerationServiceError("MISSION_ARTIFACT_FAILED", "The selected mission artifact could not be saved.", 500, true);
    }
  }
  if (args.attachToVariantId) {
    const { data: variant } = await args.writeClient
      .from("content_variants")
      .select("id,master_id")
      .eq("id", args.attachToVariantId)
      .maybeSingle();
    const { data: master } = variant
      ? await args.writeClient.from("content_master").select("owner_id").eq("id", variant.master_id).maybeSingle()
      : { data: null };
    if (!variant || master?.owner_id !== args.actorUserId) {
      throw new ImageGenerationServiceError("SOCIAL_TARGET_FORBIDDEN", "The Social post is not available to this account.", 403);
    }
    const { error: attachError } = await args.writeClient.from("social_content_variant_media").upsert(
      { variant_id: args.attachToVariantId, asset_id: candidate.asset_id, position: 0 },
      { onConflict: "variant_id,asset_id" },
    );
    if (attachError) throw new ImageGenerationServiceError("SOCIAL_ATTACH_FAILED", "The image could not be attached to the Social post.", 500, true);
  }
  return getImageGenerationJob(args.writeClient, args.jobId);
}

export async function getImageGenerationJob(client: SupabaseClient, jobId: string): Promise<ImageJobDetail> {
  const [{ data: job, error }, { data: candidates }, { data: references }] = await Promise.all([
    client.from("image_generation_jobs").select("*").eq("id", jobId).single(),
    client.from("image_generation_candidates").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
    client.from("image_generation_references").select("asset_id,reference_kind").eq("job_id", jobId),
  ]);
  if (error || !job) throw new ImageGenerationServiceError("JOB_NOT_FOUND", "Generation job not found.", 404);
  return {
    job: job as ImageGenerationJobRow,
    candidates: (candidates ?? []) as ImageGenerationCandidateRow[],
    references: (references ?? []) as Array<{ asset_id: string; reference_kind: string }>,
  };
}

export async function listImageGenerationJobs(client: SupabaseClient, tenantId: string, limit = 30): Promise<ImageGenerationJobRow[]> {
  const { data, error } = await client
    .from("image_generation_jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (error) throw new ImageGenerationServiceError("HISTORY_FAILED", "Generation history could not be loaded.", 500, true);
  return (data ?? []) as ImageGenerationJobRow[];
}

export function isTerminalImageJob(status: string): boolean {
  return TERMINAL.has(status);
}
