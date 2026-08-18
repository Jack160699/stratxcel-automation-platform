import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import { acceptAgentMission } from "@/lib/social/agent/orchestrator";

export const runtime = "nodejs";

/**
 * Tenant-scoped mirror of app/api/social/copilot/runs/route.ts — accepts a
 * new user message into a session (creating one if sessionId is omitted)
 * and starts a run. Text-only in this pass: acceptAgentMission itself
 * rejects a non-empty attachmentIds for tenant contexts, since attachment
 * upload has no tenant-scoped storage path yet.
 */
export async function POST(request: Request) {
  let body: { tenantId?: unknown; sessionId?: unknown; message?: unknown; attachmentIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireAgentTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? [...new Set(body.attachmentIds.filter((id): id is string => typeof id === "string"))].slice(0, 8)
    : [];
  if (!message || message.length > 12000) {
    return Response.json({ error: "Message must be between 1 and 12,000 characters" }, { status: 400 });
  }

  try {
    const accepted = await acceptAgentMission(ctx, sessionId, message, attachmentIds);
    return Response.json(accepted, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not accept mission" }, { status: 400 });
  }
}
