import { after } from "next/server";
import { NextResponse } from "next/server";
import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { createImageGenerationJob, ImageGenerationServiceError, processImageGenerationJob } from "@/lib/image-generation/service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { randomUUID } from "node:crypto";

/**
 * The real, live entrypoint for Growth/Business manual/on-demand Social
 * Autopilot generation (Subscription-Gated Visual Archetypes brief
 * Section 3 Rule C): the ONLY caller anywhere in the codebase that sets
 * sourceContext: "social_autopilot" + requestedArchetype on a real
 * createImageGenerationJob call. Every tier/preference/archetype check
 * happens inside createImageGenerationJob itself (resolveManualRouting,
 * using a fresh DB read of this tenant's actual plan and saved
 * preferences) -- this route trusts nothing from the request body except
 * the brief text and the archetype the user clicked, both of which get
 * re-validated server-side regardless.
 */
export async function POST(request: Request) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const requestedArchetype = typeof body.requestedArchetype === "string" ? body.requestedArchetype : "";
  if (!brief) return NextResponse.json({ error: "Describe what this post should be about." }, { status: 400 });
  if (!requestedArchetype) return NextResponse.json({ error: "Choose a visual style." }, { status: 400 });

  try {
    const job = await createImageGenerationJob({
      authorizationClient: ctx.supabase,
      writeClient: ctx.service,
      input: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        brief,
        idempotencyKey: randomUUID(),
        intendedUse: "social_post",
        aspectRatio: "1:1",
        sourceContext: "social_autopilot",
        sourceId: null,
        requestedArchetype,
      },
    });
    if (job.status === "QUEUED") {
      after(async () => {
        const service = createSupabaseServiceClient();
        try {
          await processImageGenerationJob({ writeClient: service, jobId: job.id });
        } catch (err) {
          console.error("processImageGenerationJob (social_autopilot manual): unhandled failure", {
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
    return NextResponse.json({ job }, { status: job.status === "QUEUED" ? 202 : 200 });
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return NextResponse.json({ error: known?.message ?? "Generation could not be started", code: known?.code }, { status: known?.status ?? 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 180;
