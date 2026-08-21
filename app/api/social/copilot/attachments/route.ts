import { requireOwnerContext } from "@/lib/social/db-context";
import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import type { AgentActorContext } from "@/lib/social/agent-tenant-types";
import { createAgentSession, getSession } from "@/lib/social/repositories/agent";
import {
  finalizeAgentAttachment,
  listSessionAttachments,
  prepareAgentAttachment,
  removeUnsentAttachment,
} from "@/lib/social/repositories/agent-attachments";

export const runtime = "nodejs";

async function resolveActorContext(request: Request, tenantIdFromBody?: string | null): Promise<AgentActorContext | { ok: false; error: string; status: number }> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") || tenantIdFromBody;
  if (tenantId) {
    return requireAgentTenantContext(tenantId);
  }
  return requireOwnerContext();
}

export async function GET(request: Request) {
  const ctx = await resolveActorContext(request);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || !(await getSession(ctx, sessionId))) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ attachments: await listSessionAttachments(ctx, sessionId) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: unknown;
      sessionId?: unknown;
      attachmentId?: unknown;
      name?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
      tenantId?: unknown;
    };
    const ctx = await resolveActorContext(request, typeof body.tenantId === "string" ? body.tenantId : null);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    if (body.action === "finalize") {
      if (typeof body.attachmentId !== "string") throw new Error("Attachment id is required");
      return Response.json({ attachment: await finalizeAgentAttachment(ctx, body.attachmentId) });
    }

    if (body.action !== "prepare") throw new Error("Unknown attachment action");
    if (typeof body.name !== "string" || typeof body.mimeType !== "string" || typeof body.sizeBytes !== "number") {
      throw new Error("File name, type, and size are required");
    }
    let sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
    if (sessionId && !(await getSession(ctx, sessionId))) return Response.json({ error: "Session not found" }, { status: 404 });
    const type = body.mimeType.startsWith("image/") ? "Image ideas" : body.mimeType.startsWith("video/") ? "Video content" : body.mimeType === "application/pdf" ? "Document content" : "New content mission";
    sessionId ??= await createAgentSession(ctx, type);
    const prepared = await prepareAgentAttachment(ctx, sessionId, {
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return Response.json({ sessionId, ...prepared }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Attachment upload failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await resolveActorContext(request);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Attachment id is required" }, { status: 400 });
  try {
    await removeUnsentAttachment(ctx, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Attachment removal failed" }, { status: 400 });
  }
}
