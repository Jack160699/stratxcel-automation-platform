import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { updatePhoneBindingStatus } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revokes a binding — sets status to 'revoked' so findActiveBindingByPhoneNumberId
 * (the actual routing lookup) stops resolving it, same as a half-configured
 * number. Never deletes the row (support/audit trail) and never touches the
 * encrypted_credential_ref value itself — only its owning binding's status.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, bindingId } = body as { tenantId?: string; bindingId?: string };
  if (!tenantId || !bindingId) return Response.json({ error: "tenantId and bindingId are required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const { data: existing } = await supabase.from("whatsapp_phone_bindings").select("id").eq("id", bindingId).eq("tenant_id", tenantId).maybeSingle();
  if (!existing) return Response.json({ error: "Binding not found in this workspace" }, { status: 404 });

  const binding = await updatePhoneBindingStatus(supabase, { bindingId, status: "revoked" });
  return Response.json({ binding });
}
