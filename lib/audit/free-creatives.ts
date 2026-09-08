import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBrandBrain, getCanonicalBrandContext } from "@stratxcel/brand-brain";
import { generateStudioCreativeTreatment } from "../social/studio-creative-treatment.ts";
import { createImageGenerationJob, processImageGenerationJob, selectImageGenerationCandidate, ImageGenerationServiceError } from "../image-generation/service.ts";
import { createSupabaseServiceClient } from "../supabase/service.ts";
import { buildFreeCreativeBriefs, FREE_CREATIVES_SOURCE_ID, type FreeCreativeBrief } from "./free-creatives-briefs.ts";

/**
 * Final Customer Experience Repair mission, Section 2 (Three Free Branded
 * Creatives). Deliberately NOT a second creative engine: every real image
 * is produced by the exact same canonical pipeline Creative Studio already
 * uses (generateStudioCreativeTreatment + createImageGenerationJob +
 * processImageGenerationJob, sourceContext "creative_studio") -- the same
 * pathway app/api/platform/image-generations/route.ts already calls, which
 * (unlike Social Autopilot's manual-generate route) is not gated behind an
 * active subscription: createImageGenerationJob's own free-tier allowance
 * ("Free: 3 image attempts/month trial") already permits exactly 3 real
 * generations for a brand-new, unsubscribed tenant with zero extra grant/
 * entitlement infrastructure needed.
 *
 * "Already claimed" is derived from real job history (source_id =
 * FREE_CREATIVES_SOURCE_ID) rather than a new table/flag -- no new schema
 * at all for this feature. buildFreeCreativeBriefs/FREE_CREATIVES_SOURCE_ID
 * live in ./free-creatives-briefs.ts (pure, no next/server import) and are
 * re-exported here for every other caller's convenience.
 */
export { buildFreeCreativeBriefs, FREE_CREATIVES_SOURCE_ID, type FreeCreativeBrief };

/** True if this tenant has already generated (or is generating) their free creatives -- derived from real job history, no new table. */
export async function hasClaimedFreeCreatives(service: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await service
    .from("image_generation_jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_id", FREE_CREATIVES_SOURCE_ID)
    .limit(1)
    .maybeSingle();
  if (error) throw new ImageGenerationServiceError("FREE_CREATIVES_STATUS_FAILED", "Could not check your free creatives status.", 500, true);
  return Boolean(data);
}

export interface FreeCreativesJobSummary {
  key: FreeCreativeBrief["key"];
  label: string;
  jobId: string;
  status: string;
}

/**
 * Kicks off the 3 real generations (idempotent per tenant -- a second call
 * after the first succeeded returns the same already-claimed jobs rather
 * than generating a second batch, since createImageGenerationJob's own
 * idempotency key match returns the existing job unchanged). Each job is
 * queued for background processing (after()) exactly like Creative
 * Studio's own route -- this call itself returns immediately.
 */
export async function generateFreeCreatives(
  authorizationClient: SupabaseClient,
  service: SupabaseClient,
  tenantId: string,
  actorUserId: string,
): Promise<{ ok: true; jobs: FreeCreativesJobSummary[] } | { ok: false; error: string }> {
  const brandBrain = await getCurrentBrandBrain(service, tenantId);
  const brand = getCanonicalBrandContext(brandBrain?.content ?? null);
  const briefs = buildFreeCreativeBriefs(brand);
  if (briefs.length === 0) {
    return { ok: false, error: "Add your business name in Brand before generating free creatives." };
  }

  const jobs: FreeCreativesJobSummary[] = [];
  for (const item of briefs) {
    // Stable per-tenant-per-slot idempotency key -- a retry (e.g. the
    // customer reloading mid-generation) reuses the exact same job instead
    // of burning a second real generation attempt out of the free-tier
    // monthly allowance.
    const idempotencyKey = `free_creatives:${tenantId}:${item.key}`;
    const treatment = await generateStudioCreativeTreatment({
      writeClient: service,
      tenantId,
      brief: item.brief,
      intendedUse: "social_post",
    });
    const job = await createImageGenerationJob({
      authorizationClient,
      writeClient: service,
      input: {
        tenantId,
        actorUserId,
        brief: item.brief,
        idempotencyKey,
        intendedUse: "social_post",
        aspectRatio: "1:1",
        candidateCount: 1,
        sourceContext: "creative_studio",
        sourceId: FREE_CREATIVES_SOURCE_ID,
        treatment: treatment as unknown as Record<string, unknown> | null,
      },
    });
    jobs.push({ key: item.key, label: item.label, jobId: job.id, status: job.status });

    if (job.status === "QUEUED") {
      after(async () => {
        const bg = createSupabaseServiceClient();
        try {
          const detail = await processImageGenerationJob({ writeClient: bg, jobId: job.id });
          const readyCandidate = detail.job.status === "READY" ? detail.candidates.find((c) => c.status !== "REJECTED") : null;
          if (readyCandidate) {
            await selectImageGenerationCandidate({
              writeClient: bg,
              tenantId,
              jobId: job.id,
              candidateId: readyCandidate.id,
              actorUserId,
            }).catch((err) => {
              console.error("generateFreeCreatives: auto-select failed", { jobId: job.id, tenantId, error: err instanceof Error ? err.message : String(err) });
            });
          }
        } catch (err) {
          console.error("generateFreeCreatives: processImageGenerationJob failed", { jobId: job.id, tenantId, error: err instanceof Error ? err.message : String(err) });
          await bg.from("image_generation_jobs").update({
            status: "FAILED",
            error_code: "INTERNAL_GENERATION_FAILURE",
            safe_error: "Image generation stopped unexpectedly.",
            error_retryable: true,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).eq("tenant_id", tenantId);
        }
      });
    }
  }
  return { ok: true, jobs };
}

export interface FreeCreativeCard {
  jobId: string;
  status: string;
  brief: string;
  previewUrl: string | null;
  createdAt: string;
}

/**
 * Real job + selected-candidate rows for this tenant's free creatives,
 * oldest first (matches generation order: business, offer, educational) --
 * used by both the audit report CTA and the Content Library surface.
 * previewUrl comes straight off the real candidate row (set at generation
 * time by the same pipeline Creative Studio uses); null while still
 * generating or if generation failed.
 */
export async function listFreeCreativeJobs(service: SupabaseClient, tenantId: string): Promise<FreeCreativeCard[]> {
  const { data: jobs, error } = await service
    .from("image_generation_jobs")
    .select("id, status, brief, created_at")
    .eq("tenant_id", tenantId)
    .eq("source_id", FREE_CREATIVES_SOURCE_ID)
    .order("created_at", { ascending: true });
  if (error) throw new ImageGenerationServiceError("FREE_CREATIVES_LIST_FAILED", "Could not load your free creatives.", 500, true);
  if (!jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id as string);
  const { data: candidates } = await service
    .from("image_generation_candidates")
    .select("job_id, preview_url, status")
    .in("job_id", jobIds);

  return jobs.map((job) => {
    const jobCandidates = (candidates ?? []).filter((c) => c.job_id === job.id);
    const selected = jobCandidates.find((c) => c.status === "SELECTED") ?? jobCandidates.find((c) => c.status !== "REJECTED");
    return {
      jobId: job.id as string,
      status: job.status as string,
      brief: job.brief as string,
      previewUrl: (selected?.preview_url as string | undefined) ?? null,
      createdAt: job.created_at as string,
    };
  });
}
