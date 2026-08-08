import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listTemplatesForTenant, listPhoneBindingsForTenant, syncTemplatesForBinding } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const templates = await listTemplatesForTenant(ctx.supabase, tenantId);
  return Response.json({ templates }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Pulls the real, current template list from Meta — never fabricates
 * APPROVED status. A no-op (synced: 0) in disabled/shadow mode, or if the
 * tenant has no active binding, rather than a fake success.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const bindings = await listPhoneBindingsForTenant(supabase, tenantId);
  const active = bindings.find((b) => b.status === "active");
  if (!active) return Response.json({ error: "No active WhatsApp phone binding for this tenant" }, { status: 400 });

  try {
    const result = await syncTemplatesForBinding(supabase, { tenantId, phoneBindingId: active.id, wabaId: active.waba_id });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Template sync failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
