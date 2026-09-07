import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { updateCapabilityAssignmentAutonomy, deleteCapabilityAssignment, type ConnectorAutonomy } from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AUTONOMY: ConnectorAutonomy[] = ["read", "prepare", "execute", "approval_required", "disabled"];

/** PATCH /api/platform/admin/connectors/assignments/[assignmentId] -- change autonomy only. Body: { autonomy } */
export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { assignmentId } = await params;
  const body = (await request.json().catch(() => ({}))) as { autonomy?: string };
  if (!body.autonomy || !VALID_AUTONOMY.includes(body.autonomy as ConnectorAutonomy)) {
    return Response.json({ error: `autonomy must be one of ${VALID_AUTONOMY.join(", ")}` }, { status: 400 });
  }

  const { supabase } = getTenantServiceContext();
  const assignment = await updateCapabilityAssignmentAutonomy(supabase as never, assignmentId, body.autonomy as ConnectorAutonomy);
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
