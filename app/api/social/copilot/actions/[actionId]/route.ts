import { requireOwnerContext } from "@/lib/social/db-context";
import { approveAgentAction, rejectAgentAction } from "@/lib/social/agent/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const { actionId } = await params;
  let body: { decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    if (body.decision === "approve") {
      return Response.json({ status: "SUCCEEDED", output: await approveAgentAction(ctx, actionId) });
    }
    if (body.decision === "reject") {
      await rejectAgentAction(ctx, actionId);
      return Response.json({ status: "REJECTED" });
    }
    return Response.json({ error: "Decision must be approve or reject" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not apply approval decision" },
      { status: 400 }
    );
  }
}
