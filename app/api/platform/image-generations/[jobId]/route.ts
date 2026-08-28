import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { getImageGenerationJob, ImageGenerationServiceError } from "@/lib/image-generation/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const { jobId } = await params;
  try {
    const detail = await getImageGenerationJob(ctx.supabase, jobId);
    if (detail.job.tenant_id !== ctx.tenantId) return Response.json({ error: "Generation not found" }, { status: 404 });
    detail.candidates = await Promise.all(detail.candidates.map(async (candidate) => {
      const { data: asset } = await ctx.service
        .from("social_media_assets")
        .select("storage_bucket,storage_path,tenant_id")
        .eq("id", candidate.asset_id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (!asset) return { ...candidate, preview_url: null };
      const { data: signed } = await ctx.service.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 10 * 60);
      return { ...candidate, preview_url: signed?.signedUrl ?? null };
    }));
    return Response.json(detail);
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "Generation could not be loaded" }, { status: known?.status ?? 500 });
  }
}
