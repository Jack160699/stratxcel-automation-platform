import { requireOwnerContext } from "@/lib/social/db-context";
import { getRunWithEvents } from "@/lib/social/repositories/agent-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const { runId } = await params;
  const after = new URL(request.url).searchParams.get("after");
  const result = await getRunWithEvents(ctx, runId, after);
  if (!result.run) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
