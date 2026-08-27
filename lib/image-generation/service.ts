import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import {
  createTenantMediaRuntime,
  resolveTenantMonthSpend,
  resolveTenantPlanTier,
  type ImageGenerationOutcome,
} from "@stratxcel/ai-runtime";
import { hasEntitlement, recordMetricUsage, type ServiceClient } from "@stratxcel/payments-and-wallet";
import { buildProviderReadyImagePrompt, createAdvisoryImageCritique, snapshotImageBrandContext } from "./prompt";
import {
  IMAGE_ASPECT_RATIOS,
  type CreateImageJobInput,
  type ImageGenerationCandidateRow,
  type ImageGenerationJobRow,
  type ImageJobDetail,
} from "./types";
import { validateCreativeTreatment, type CreativeTreatment } from "../social/creative-treatment";
import { buildVisualDirectorBrief } from "../social/visual-director-prompt";
import { deriveBrandVisualDNA } from "../social/brand-visual-dna";
import { classifyIndustry } from "../social/industry-taxonomy";
import { renderTextOverlay } from "../social/text-overlay-render";

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

/** A malformed treatment is discarded rather than silently trusted -- the
 * job still proceeds from `brief` alone (exactly today's behavior) when
 * this returns null. Checks structural validity only (required fields
 * present, well-formed textHierarchy/cta) -- the "just restates the
 * category label" check inside validateCreativeTreatment needs the real
 * label, which only the caller that built the CreativeBrief has; this
 * service has no brief of its own, so that check is skipped here and left
 * to the caller (package-autopilot.ts / Copilot) that generated the
 * treatment in the first place. */
export function validateTreatmentForJob(treatment: Record<string, unknown> | null | undefined): CreativeTreatment | null {
  if (!treatment) return null;
  const issues = validateCreativeTreatment(treatment, { concept: "" }).filter((i) => i.field !== "concept");
  if (issues.length) return null;
  return treatment as unknown as CreativeTreatment;
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

/**
 * Reusable Brand Kit logo lookup (brief §1) — the most recently uploaded,
 * ready logo asset for this tenant. Reuses the exact storage shape the
 * Website Factory logo upload already writes (social_media_assets,
 * provenance.purpose = "website_logo"; see
 * app/api/platform/website-factory/assets/route.ts) rather than a second
 * logo table — one upload, reused everywhere. Best-effort: a lookup failure
 * or missing logo silently yields no auto-reference rather than blocking
 * generation.
 */
async function resolveBrandLogoAssetId(authorizationClient: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await authorizationClient
    .from("social_media_assets")
    .select("id, provenance")
    .eq("tenant_id", tenantId)
    .eq("status", "READY")
    .order("created_at", { ascending: false })
    .limit(20);
  const logo = (data ?? []).find(
    (row) => (row.provenance as { purpose?: string } | null)?.purpose === "website_logo",
  );
  return logo?.id ?? null;
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
  let referenceAssetIds = [...new Set(input.referenceAssetIds ?? [])];

  // Brand Kit (brief §1: "every plan must include a reusable Brand Kit" —
  // upload the logo once, generated content automatically uses it). Reuses
  // the same logo asset the website builder stores, auto-included as a
  // reference unless the caller already supplied 5 (the hard cap).
  if (referenceAssetIds.length < 5) {
    const brandLogoAssetId = await resolveBrandLogoAssetId(args.authorizationClient, input.tenantId);
    if (brandLogoAssetId && !referenceAssetIds.includes(brandLogoAssetId)) {
      referenceAssetIds = [...referenceAssetIds, brandLogoAssetId];
    }
  }
  await assertReferencesAuthorized(args.authorizationClient, input.tenantId, input.actorUserId, referenceAssetIds);

  const { data: existing } = await args.writeClient
    .from("image_generation_jobs")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("actor_user_id", input.actorUserId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return existing as ImageGenerationJobRow;

  // Brief §7: customer-facing generation quota ("N of M generations this
  // month") — a distinct, new-generation-only pool from the internal AI-cost
  // budget envelope enforced further down. Autopilot's system-researched
  // content draws from automated_content_monthly; everything else
  // (Creative Studio, Copilot-requested generations) draws from
  // content_generation_monthly. Fails closed like every other entitlement
  // check in this codebase — no row means no entitlement.
  const generationMetric = input.sourceContext === "social_autopilot" ? "automated_content_monthly" : "content_generation_monthly";
  const entitled = await hasEntitlement(args.writeClient as unknown as ServiceClient, input.tenantId, generationMetric, 1);
  if (!entitled) {
    throw new ImageGenerationServiceError(
      "GENERATION_LIMIT_REACHED",
      "This workspace has used all of its included generations for this month.",
      403,
    );
  }

  const brandBrain = await getCurrentBrandBrain(args.writeClient as never, input.tenantId);
  const brandSnapshot = snapshotImageBrandContext(brandBrain?.content);
  // Premium Creative Intelligence: a real structured Creative Treatment
  // (concept/hook/visual direction/text hierarchy/CTA decision), when the
  // caller supplied one, drives the actual prompt built at process-time
  // (see processImageGenerationJob) instead of `brief` alone. A malformed
  // treatment is discarded here, never silently trusted.
  const validatedTreatment = validateTreatmentForJob(input.treatment);
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
      creative_treatment: validatedTreatment,
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
  // Best-effort — a metrics-recording hiccup must never fail an otherwise
  // successful job creation; the entitlement check above already fails
  // closed on the way in.
  await recordMetricUsage(args.writeClient as unknown as ServiceClient, input.tenantId, generationMetric, 1).catch(() => {});
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
  // Brief §1: "up to 2 regenerations per generated asset" — an alternate version of
  // an existing creative, distinct from a materially new generation.
  if (revisionNumber > 2) throw new ImageGenerationServiceError("REVISION_LIMIT", "This generation has reached the two-regeneration limit.");
  const fromStatuses = args.revisionInstruction ? ["READY", "FAILED"] : ["QUEUED", "FAILED"];
  const targetStatus = args.revisionInstruction ? "REVISING" : "PROCESSING";

  // Premium Creative Intelligence Section 23: when a real Creative
  // Treatment was supplied at job creation, the actual image prompt is
  // built FROM it (subject/composition/camera/lighting/color/mood/
  // negative-constraints/text-safe-areas) instead of the caller's raw
  // brief string. brandDNA is reconstructed from this job's own already-
  // stored brand_context_snapshot (color_hints/tone_of_voice/industry) --
  // no separate brand lookup needed, and it stays consistent with what the
  // prompt's own brand-context lines already say.
  const treatment = job.creative_treatment as CreativeTreatment | null;
  let effectiveBrief = job.brief;
  let overlayContext: { treatment: CreativeTreatment; businessName: string; brandDNA: ReturnType<typeof deriveBrandVisualDNA> } | null = null;
  // Both the treatment-derived prompt and deterministic text-overlay
  // compositing are scoped to the ORIGINAL (non-revision) generation --
  // a revision works from the human's specific revision instruction
  // layered onto the free-text brief path, exactly as before, since a
  // revision may have moved the image away from the original treatment's
  // intent in ways that would make re-applying its planned on-image text
  // stale or wrong.
  if (treatment && !args.revisionInstruction) {
    const snapshot = job.brand_context_snapshot as { business_name?: string; industry?: string; tone_of_voice?: string; color_hints?: string[] };
    const businessName = typeof snapshot.business_name === "string" ? snapshot.business_name : "";
    const brandDNA = deriveBrandVisualDNA({
      brandColors: Array.isArray(snapshot.color_hints) ? snapshot.color_hints.map(String) : [],
      brandTone: typeof snapshot.tone_of_voice === "string" ? snapshot.tone_of_voice.split(/,\s*/).filter(Boolean) : [],
      industryCategory: classifyIndustry(typeof snapshot.industry === "string" ? snapshot.industry : null),
    });
    effectiveBrief = buildVisualDirectorBrief({ treatment, businessName, brandDNA });
    overlayContext = { treatment, businessName, brandDNA };
  }
  const prompt = buildProviderReadyImagePrompt({
    brief: effectiveBrief,
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
  // Premium Creative Intelligence Section 9: headline/CTA/brand name are
  // rendered deterministically (real sharp SVG compositing), never left to
  // the image model's own (typo-prone) text rendering -- only when the
  // treatment actually has on-image text planned.
  const ASPECT_CANVAS: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "4:5": { width: 1024, height: 1280 },
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
  };
  const textOverlayCompositor =
    overlayContext && overlayContext.treatment.textHierarchy.length
      ? async ({ bytes, mimeType }: { bytes: Uint8Array; mimeType: string }) => {
          const canvas = ASPECT_CANVAS[job.aspect_ratio] ?? ASPECT_CANVAS["1:1"]!;
          const { treatment: t, businessName, brandDNA } = overlayContext!;
          const composited = await renderTextOverlay(Buffer.from(bytes), {
            width: canvas.width,
            height: canvas.height,
            elements: [...t.textHierarchy, { role: "brandLabel" as const, text: businessName }],
            typographyPersonality: brandDNA.typographyPersonality,
            textColor: brandDNA.lightDarkPreference === "light" ? "#111111" : "#FFFFFF",
            scrimColor: "#000000",
            accentColor: brandDNA.accentColor,
            businessName,
          });
          return { bytes: composited, mimeType: "image/png" };
        }
      : undefined;
  const outcome = await media.images.generate({
    tenantId: job.tenant_id,
    missionId: job.mission_id,
    generationRequestId: `image-job:${job.id}:revision:${revisionNumber}`,
    prompt,
    aspectRatio: job.aspect_ratio,
    candidateCount: job.candidate_count,
    referenceAssetIds,
    persistCanonical: true,
    textOverlayCompositor,
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
      text_overlay_applied: Boolean(textOverlayCompositor),
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
    // Tenant-scoped: content_variants carries no tenant_id of its own, only
    // master_id -> content_master.tenant_id, so the master lookup must be
    // filtered on args.tenantId explicitly. Checking owner_id alone (as this
    // previously did) is an owner-only check on tenant-shared data — a user
    // who happens to own a content_master row in a *different* tenant they
    // also belong to could otherwise attach this workspace's generated
    // image to it via a guessed/leaked variant id. Tenant scoping is the
    // actual authorization boundary here; the owner check is kept as
    // defense-in-depth on top of it.
    const { data: variant } = await args.writeClient
      .from("content_variants")
      .select("id,master_id")
      .eq("id", args.attachToVariantId)
      .maybeSingle();
    const { data: master } = variant
      ? await args.writeClient
          .from("content_master")
          .select("owner_id,tenant_id")
          .eq("id", variant.master_id)
          .eq("tenant_id", args.tenantId)
          .maybeSingle()
      : { data: null };
    if (!variant || !master || master.owner_id !== args.actorUserId) {
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
