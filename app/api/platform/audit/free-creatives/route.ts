import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { ImageGenerationServiceError } from "@/lib/image-generation/service";
import { generateFreeCreatives, hasClaimedFreeCreatives, listFreeCreativeJobs } from "@/lib/audit/free-creatives";

/**
 * Final Customer Experience Repair mission, Section 2 (Three Free Branded
 * Creatives). Deliberately reuses requireImageGenerationContext -- the
 * exact same tenant/auth gate Creative Studio's own route already uses --
 * so this is subject to the identical real security posture, never a
 * looser one just because it's "free."
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    const [claimed, jobs] = await Promise.all([
      hasClaimedFreeCreatives(ctx.service, ctx.tenantId),
      listFreeCreativeJobs(ctx.service, ctx.tenantId),
    ]);
    return Response.json({ claimed, jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "Could not load your free creatives." }, { status: known?.status ?? 500 });
  }
}

export async function POST() {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    const result = await generateFreeCreatives(ctx.supabase, ctx.service, ctx.tenantId, ctx.userId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    return Response.json({ jobs: result.jobs }, { status: 202 });
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return Response.json({ error: known?.message ?? "Could not start your free creatives." }, { status: known?.status ?? 500 });
  }
}
