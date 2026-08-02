import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createPhoneBinding, listPhoneBindingsForTenant } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

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
  return Response.json({ bindings }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Creates a binding in 'pending' status with inbound/outbound/shadow all
 * left at their safe defaults (disabled/disabled/true) — activation
 * (verifying the real phone_number_id and flipping to 'active') is a
 * separate, deliberately manual step for tomorrow, not part of this call.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    tenantId?: string;
    wabaId?: string;
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    environment?: "test" | "staging" | "production";
  };
  if (!body.tenantId || !body.wabaId || !body.phoneNumberId) {
    return Response.json({ error: "tenantId, wabaId, and phoneNumberId are required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const binding = await createPhoneBinding(supabase, {
    tenantId: body.tenantId,
    wabaId: body.wabaId,
    phoneNumberId: body.phoneNumberId,
    displayPhoneNumber: body.displayPhoneNumber ?? null,
    environment: body.environment ?? "test",
    createdBy: ctx.userId,
  });
  return Response.json({ binding }, { status: 201 });
}
