import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { ImageGenerationServiceError, selectImageGenerationCandidate } from "@/lib/image-generation/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const { jobId } = await params;
  try {
    const body = (await request.json()) as { candidateId?: unknown; socialVariantId?: unknown };
    if (typeof body.candidateId !== "string") throw new ImageGenerationServiceError("CANDIDATE_REQUIRED", "Choose an image first.");
    const detail = await selectImageGenerationCandidate({
      writeClient: ctx.service,
      tenantId: ctx.tenantId,
      jobId,
      candidateId: body.candidateId,
      actorUserId: ctx.userId,
      attachToVariantId: typeof body.socialVariantId === "string" ? body.socialVariantId : null,
    });
    return Response.json(detail);
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "The image could not be selected", code: known?.code }, { status: known?.status ?? 500 });
  }
}
