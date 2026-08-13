import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { listMembershipsForUser } from "@/lib/tenants/repository";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";

export async function ownedCompletedAudit() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const memberships = await listMembershipsForUser(supabase, user.id);
  if (!memberships.length) return { error: Response.json({ error: "No workspace" }, { status: 403 }) };
  const tenantId = memberships[0]!.tenant.id;
  const service = getTenantServiceContext().supabase;
  const currentOrderId = await resolveCurrentAuditOrderId(service, tenantId);
  const orderId = typeof currentOrderId === "string"
    ? currentOrderId
    : currentOrderId === null
      ? null
      : (await service.from("audit_orders").select("id").eq("tenant_id", tenantId).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.id ?? null;
  if (!orderId) return { error: Response.json({ error: "No current Audit" }, { status: 404 }) };
  const { data: order } = await service.from("audit_orders").select("*").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (!order || order.status !== "completed") return { error: Response.json({ error: "Report is not ready" }, { status: 409 }) };
  return { user, tenantId, service, order };
}
