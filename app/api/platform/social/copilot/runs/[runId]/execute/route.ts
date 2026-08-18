import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import { runAgentTurn } from "@/lib/social/agent/orchestrator";
import { getRun } from "@/lib/social/repositories/agent-runs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Tenant-scoped mirror of app/api/social/copilot/runs/[runId]/execute/route.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireAgentTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { runId } = await params;
  const run = await getRun(ctx, runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.status !== "RUNNING") return Response.json({ error: "Run is already terminal" }, { status: 409 });

  const result = await runAgentTurn(ctx, run.session_id, runId);
  return Response.json(result);
}
