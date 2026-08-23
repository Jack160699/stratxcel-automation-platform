import { after } from "next/server";
import { requireImageGenerationContext } from "@/lib/image-generation/http";
import {
  createImageGenerationJob,
  ImageGenerationServiceError,
  listImageGenerationJobs,
  processImageGenerationJob,
} from "@/lib/image-generation/service";
import type { CreateImageJobInput } from "@/lib/image-generation/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 180;

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
    const job = await createImageGenerationJob({
      authorizationClient: ctx.supabase,
      writeClient: ctx.service,
      input: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        brief: typeof body.brief === "string" ? body.brief : "",
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
        intendedUse: body.intendedUse,
        aspectRatio: body.aspectRatio,
        candidateCount: body.candidateCount,
        styleDirection: body.styleDirection,
        referenceAssetIds: Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds.map(String) : [],
        sourceContext: "creative_studio",
        sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
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
