import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { confirmAppointment, cancelAppointment, rescheduleAppointment } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, action, scheduledFor, reason } = body as {
    tenantId?: string;
    action?: "confirm" | "cancel" | "reschedule";
    scheduledFor?: string;
    reason?: string;
  };
  if (!tenantId || !action) return Response.json({ error: "tenantId and action (confirm | cancel | reschedule) are required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "crm:manage");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();

  try {
    if (action === "confirm") {
      if (!scheduledFor) return Response.json({ error: "scheduledFor is required to confirm" }, { status: 400 });
      const appointment = await confirmAppointment(supabase, tenantId, id, new Date(scheduledFor));
      return Response.json({ appointment });
    }
    if (action === "cancel") {
      const appointment = await cancelAppointment(supabase, tenantId, id, reason);
      return Response.json({ appointment });
    }
    if (action === "reschedule") {
      if (!scheduledFor) return Response.json({ error: "scheduledFor is required to reschedule" }, { status: 400 });
      const appointment = await rescheduleAppointment(supabase, tenantId, id, new Date(scheduledFor));
      return Response.json({ appointment });
    }
    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update appointment";
    return Response.json({ error: msg }, { status: 500 });
  }
}
