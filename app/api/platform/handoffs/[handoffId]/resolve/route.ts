import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { resolveHumanHandoff } from "@stratxcel/human-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ handoffId: string }> }) {
  const { handoffId } = await params;
  const body = (await request.json()) as { tenantId?: string; resolutionNotes?: string };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "human_handoff:resolve");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();

  // Defense in depth, same reasoning as the approval-decide route: confirm
  // the handoff actually belongs to the tenant the caller was verified
  // against before letting them resolve it.
  const { data: handoff } = await supabase.from("human_handoffs").select("tenant_id").eq("id", handoffId).maybeSingle();
  if (!handoff || handoff.tenant_id !== body.tenantId) {
    return Response.json({ error: "Handoff not found" }, { status: 404 });
  }

  const resolved = await resolveHumanHandoff(supabase, { handoffId, resolvedBy: ctx.userId, resolutionNotes: body.resolutionNotes });
  return Response.json({ handoff: resolved });
}
