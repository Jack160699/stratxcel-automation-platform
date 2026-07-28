import { requireOwnerContext } from "@/lib/social/db-context";
import { acceptAgentMission } from "@/lib/social/agent/orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  let body: { sessionId?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!message || message.length > 12000) {
    return Response.json({ error: "Message must be between 1 and 12,000 characters" }, { status: 400 });
  }

  const accepted = await acceptAgentMission(ctx, sessionId, message);
  return Response.json(accepted, { status: 201 });
}
