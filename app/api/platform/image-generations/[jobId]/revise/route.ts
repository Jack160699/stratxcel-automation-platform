import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { ImageGenerationServiceError, processImageGenerationJob } from "@/lib/image-generation/service";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const { jobId } = await params;
  try {
    const { data: authorizedJob } = await ctx.supabase
      .from("image_generation_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!authorizedJob) return Response.json({ error: "Generation not found" }, { status: 404 });
    const body = (await request.json()) as { instruction?: unknown; parentCandidateId?: unknown };
    if (typeof body.instruction !== "string" || !body.instruction.trim()) {
      throw new ImageGenerationServiceError("REVISION_REQUIRED", "Describe what should change.");
    }
    const detail = await processImageGenerationJob({
      writeClient: ctx.service,
      jobId,
      revisionInstruction: body.instruction.slice(0, 1000),
      parentCandidateId: typeof body.parentCandidateId === "string" ? body.parentCandidateId : null,
    });
    if (detail.job.tenant_id !== ctx.tenantId) return Response.json({ error: "Generation not found" }, { status: 404 });
    return Response.json(detail);
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "The revision could not be generated", code: known?.code }, { status: known?.status ?? 500 });
  }
}
