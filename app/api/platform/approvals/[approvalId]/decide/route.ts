import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { decideApproval, ApprovalAlreadyDecidedError } from "@stratxcel/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const body = (await request.json()) as { tenantId?: string; decision?: "APPROVED" | "REJECTED" };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
    return Response.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "approval:decide");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();

  // Defense in depth, same reasoning as the mission events route: confirm
  // the approval actually belongs to the tenant the caller was verified
  // against before letting them decide it.
  const { data: approval } = await supabase.from("approvals").select("tenant_id").eq("id", approvalId).maybeSingle();
  if (!approval || approval.tenant_id !== body.tenantId) {
    return Response.json({ error: "Approval not found" }, { status: 404 });
  }

  try {
    const decided = await decideApproval(supabase, { approvalId, decision: body.decision, decidedBy: ctx.userId });
    return Response.json({ approval: decided });
  } catch (err) {
    if (err instanceof ApprovalAlreadyDecidedError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
