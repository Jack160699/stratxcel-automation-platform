import { after } from "next/server";
import { requireImageGenerationContext } from "@/lib/image-generation/http";
import {
  createImageGenerationJob,
  findExistingImageGenerationJobByIdempotencyKey,
  ImageGenerationServiceError,
  listImageGenerationJobs,
  processImageGenerationJob,
} from "@/lib/image-generation/service";
import type { CreateImageJobInput } from "@/lib/image-generation/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateStudioCreativeTreatment } from "@/lib/social/studio-creative-treatment";

export const runtime = "nodejs";
// The real Gemini/OpenAI + deterministic text-overlay compositor chain
// (processImageGenerationJob) has its own internal provider-timeout budget
// of up to 170s (ImageMediaRuntime's clamp -- packages/ai-runtime/src/
// media/image.ts). At maxDuration=180 there was only ~10s of margin left
// for candidate persistence, Supabase Storage upload, and the compositor
// itself once the provider call returned -- real production timeouts
// ("The provider timed out") were Vercel killing the function before that
// work finished, not the provider genuinely taking too long. 300s matches
// the same budget already used elsewhere in this codebase for long AI
// chains (app/api/social/copilot/runs/[runId]/execute,
// app/api/platform/social/copilot/runs/[runId]/execute).
export const maxDuration = 300;

export async function GET() {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    return Response.json({ jobs: await listImageGenerationJobs(ctx.supabase, ctx.tenantId) });
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "Generation history could not be loaded" }, { status: known?.status ?? 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    const body = (await request.json()) as Partial<CreateImageJobInput>;
    const brief = typeof body.brief === "string" ? body.brief : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
    const intendedUse = typeof body.intendedUse === "string" ? body.intendedUse : "social_post";
    const styleDirection = typeof body.styleDirection === "string" ? body.styleDirection : null;

    // Unify Creative Studio With The Premium Autopilot Pipeline: a real
    // Gemini-authored creative treatment (concept, visual direction,
    // on-image text hierarchy, CTA decision, layout archetype) BEFORE the
    // image model ever runs -- the same intelligence step
    // package-autopilot.ts already runs for fully-automated posts. Without
    // this, createImageGenerationJob's `treatment` stayed null for every
    // Creative Studio job (this route never supplied one), which is the
    // exact reason processImageGenerationJob never applied the real
    // BrandBrain logo / text-overlay-render.ts compositor here -- it fell
    // back to buildProviderReadyImagePrompt's brief-only prompt and let the
    // image model draw its own (hallucinated) logo and headline text
    // instead. Skipped on a duplicate submit/retry (an idempotency key that
    // already has a job) so a double-click never pays for a second,
    // discarded Gemini call -- createImageGenerationJob below still returns
    // that exact same persisted job either way.
    const alreadyQueued = await findExistingImageGenerationJobByIdempotencyKey(
      ctx.service,
      ctx.tenantId,
      ctx.userId,
      idempotencyKey,
    );
    const treatment = !alreadyQueued && brief
      ? await generateStudioCreativeTreatment({ writeClient: ctx.service, tenantId: ctx.tenantId, brief, intendedUse, styleDirection })
      : null;

    const job = await createImageGenerationJob({
      authorizationClient: ctx.supabase,
      writeClient: ctx.service,
      input: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        brief,
        idempotencyKey,
        intendedUse: body.intendedUse,
        aspectRatio: body.aspectRatio,
        candidateCount: body.candidateCount,
        styleDirection: body.styleDirection,
        referenceAssetIds: Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds.map(String) : [],
        sourceContext: "creative_studio",
        sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
        // CreateImageJobInput.treatment is deliberately typed as an opaque
        // Record<string, unknown> -- createImageGenerationJob re-validates
        // it structurally itself (validateTreatmentForJob) rather than
        // trusting the caller's own CreativeTreatment shape, exactly like
        // package-autopilot.ts's creative_spec.treatment storage boundary.
        treatment: treatment as unknown as Record<string, unknown> | null,
      },
    });
    if (job.status === "QUEUED") {
      after(async () => {
        const service = createSupabaseServiceClient();
        try {
          await processImageGenerationJob({ writeClient: service, jobId: job.id });
        } catch (err) {
          // Found live during E2E testing: this discarded the real error
          // entirely -- no console output, nothing -- so any failure that
          // wasn't already one of the classified provider outcomes (a bug in
          // this file, a DB write failing, an unexpected exception anywhere
          // in the pipeline) left zero trace in the logs.
          console.error("processImageGenerationJob: unhandled failure", {
            jobId: job.id,
            tenantId: ctx.tenantId,
            error: err instanceof Error ? err.message : String(err),
          });
          await service.from("image_generation_jobs").update({
            status: "FAILED",
            error_code: "INTERNAL_GENERATION_FAILURE",
            safe_error: "Image generation stopped unexpectedly.",
            error_retryable: true,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).eq("tenant_id", ctx.tenantId);
        }
      });
    }
    return Response.json({ job }, { status: job.status === "QUEUED" ? 202 : 200 });
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "Generation could not be started", code: known?.code }, { status: known?.status ?? 500 });
  }
}
