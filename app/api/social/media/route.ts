import { requireOwnerContext } from "@/lib/social/db-context";
import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import type { AgentActorContext } from "@/lib/social/agent-tenant-types";
import {
  finalizeMediaAsset,
  prepareMediaAsset,
  removeUnattachedMediaAsset,
} from "@/lib/social/repositories/media-assets";

export const runtime = "nodejs";

async function resolveActorContext(request: Request, tenantIdFromBody?: string | null): Promise<AgentActorContext | { ok: false; error: string; status: number }> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") || tenantIdFromBody;
  if (tenantId) {
    return requireAgentTenantContext(tenantId);
  }
  return requireOwnerContext();
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: unknown;
      assetId?: unknown;
      name?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
      tenantId?: unknown;
    };
    const ctx = await resolveActorContext(request, typeof body.tenantId === "string" ? body.tenantId : null);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    if (body.action === "finalize") {
      if (typeof body.assetId !== "string") throw new Error("Media asset id is required");
      return Response.json({ asset: await finalizeMediaAsset(ctx, body.assetId) });
    }
    if (body.action !== "prepare") throw new Error("Unknown media action");
    if (typeof body.name !== "string" || typeof body.mimeType !== "string" || typeof body.sizeBytes !== "number") {
      throw new Error("File name, type, and size are required");
    }
    const prepared = await prepareMediaAsset(ctx, {
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return Response.json(prepared, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Media upload failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await resolveActorContext(request);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Media asset id is required" }, { status: 400 });
  try {
    await removeUnattachedMediaAsset(ctx, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Media removal failed" }, { status: 400 });
  }
}
