import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import { getRunWithEvents } from "@/lib/social/repositories/agent-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tenant-scoped mirror of app/api/social/copilot/runs/[runId]/route.ts —
 * polled by useTenantAgentSession's client-side live progress loop.
 * requireAgentTenantContext re-derives tenant membership from the caller's
 * own session on every request; a client-supplied tenantId alone never
 * grants access.
 */
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireAgentTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { runId } = await params;
  const after = new URL(request.url).searchParams.get("after");
  const result = await getRunWithEvents(ctx, runId, after);
  if (!result.run) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
