import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { updateCapabilityAssignmentAutonomy, deleteCapabilityAssignment, type ConnectorAutonomy } from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AUTONOMY: ConnectorAutonomy[] = ["read", "prepare", "execute", "approval_required", "disabled"];

/** PATCH /api/platform/admin/connectors/assignments/[assignmentId] -- updates autonomy and budget. Body: { autonomy?, budgetLimitUsd?, allowedMethods? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { assignmentId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    autonomy?: string;
    budgetLimitUsd?: number | null;
    allowedMethods?: ("native" | "mcp" | "api" | "cli" | "browser")[];
  };

  const { supabase } = getTenantServiceContext();

  let assignment = null;
  if (body.autonomy) {
    if (!VALID_AUTONOMY.includes(body.autonomy as ConnectorAutonomy)) {
      return Response.json({ error: `autonomy must be one of ${VALID_AUTONOMY.join(", ")}` }, { status: 400 });
    }
    assignment = await updateCapabilityAssignmentAutonomy(supabase as never, assignmentId, body.autonomy as ConnectorAutonomy);
  }

  if (body.budgetLimitUsd !== undefined || body.allowedMethods !== undefined) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.budgetLimitUsd !== undefined) patch.budget_limit_usd = body.budgetLimitUsd;
    if (body.allowedMethods !== undefined) patch.allowed_methods = body.allowedMethods;
    const { data, error } = await supabase.from("connector_capability_assignments").update(patch).eq("id", assignmentId).select("*").single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    assignment = data;
  }

  return Response.json({ ok: true, assignment });
}

/** DELETE /api/platform/admin/connectors/assignments/[assignmentId] */
export async function DELETE(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { assignmentId } = await params;
  const { supabase } = getTenantServiceContext();
  await deleteCapabilityAssignment(supabase as never, assignmentId);
  return Response.json({ ok: true });
}
