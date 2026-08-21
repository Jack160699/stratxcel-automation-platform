import { requireOwnerContext } from "@/lib/social/db-context";
import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import type { AgentActorContext } from "@/lib/social/agent-tenant-types";
import { getMediaAssetPreviewUrl } from "@/lib/social/repositories/media-assets";

export const runtime = "nodejs";

async function resolveActorContext(request: Request): Promise<AgentActorContext | { ok: false; error: string; status: number }> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (tenantId) {
    return requireAgentTenantContext(tenantId);
  }
  return requireOwnerContext();
}

/**
 * Short-lived, authenticated signed URL for showing an already-uploaded
 * media asset as a thumbnail in the Copilot "Ready to publish" approval
 * card. Never used for the actual publish (see resolveMediaForPublish).
 */
export async function GET(request: Request) {
  const ctx = await resolveActorContext(request);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const assetId = new URL(request.url).searchParams.get("assetId");
  if (!assetId) return Response.json({ error: "assetId is required" }, { status: 400 });
  const preview = await getMediaAssetPreviewUrl(ctx, assetId);
  if (!preview) return Response.json({ error: "Media asset not found or owned by another account." }, { status: 404 });
  return Response.json(preview);
}
