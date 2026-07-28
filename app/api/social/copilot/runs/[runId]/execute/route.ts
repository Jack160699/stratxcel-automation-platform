import { requireOwnerContext } from "@/lib/social/db-context";
import { runAgentTurn } from "@/lib/social/agent/orchestrator";
import { getRun } from "@/lib/social/repositories/agent-runs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const { runId } = await params;
  const run = await getRun(ctx, runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.status !== "RUNNING") return Response.json({ error: "Run is already terminal" }, { status: 409 });

  const result = await runAgentTurn(ctx, run.session_id, runId);
  return Response.json(result);
}
