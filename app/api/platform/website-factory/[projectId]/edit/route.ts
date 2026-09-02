import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { applyTenantWebsiteEdit } from "@/lib/websites/apply-tenant-website-edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * Thin HTTP wrapper over the shared edit sequence
 * (lib/websites/apply-tenant-website-edit.ts) -- the real classify/apply/
 * write/audit logic lives in exactly one place, shared with the
 * edit_website agent tool (lib/agent-core/website-tools.ts). See that
 * shared file's header for why it now uses the real classifyEditRequest
 * (with a genuine prompt-injection/secret-exfiltration guard) instead of
 * this route's old inline keyword list.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { projectId: siteProjectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { tenantId, instruction, confirmed } = body;

    if (!tenantId || !instruction) {
      return Response.json({ error: "tenantId and instruction are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    const result = await applyTenantWebsiteEdit({
      supabase: serviceDb as never,
      tenantId,
      siteProjectId,
      instruction,
      confirmed,
      actorUserId: ctx.userId,
    });

    switch (result.outcome) {
      case "NOT_FOUND":
        return Response.json({ error: "Website project not found" }, { status: 404 });
      case "SECURITY_BLOCKED":
        return Response.json({ error: `Instruction rejected: ${result.reason}` }, { status: 400 });
      case "NEEDS_CONFIRMATION":
        return Response.json(
          { riskLevel: result.riskLevel, requiresConfirmation: true, message: result.message },
          { status: 400 }
        );
      case "NOT_APPLIED":
        return Response.json({
          project: result.project,
          previewUrl: `/app/website/${siteProjectId}/preview`,
          instruction,
          applied: false,
          message: result.message,
        });
      case "WRITE_FAILED":
        return Response.json({ error: `Failed to record revision: ${result.error}` }, { status: 500 });
      case "APPLIED":
        return Response.json({
          project: result.project,
          previewUrl: result.previewUrl,
          instruction,
          applied: true,
        });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to apply edit";
    return Response.json({ error: msg }, { status: 500 });
  }
}
