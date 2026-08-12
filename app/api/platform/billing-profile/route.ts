import { requireTenantContext, requireTenantReadContext, requireTenantReadPermission, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getBillingProfile, upsertBillingProfile } from "@stratxcel/payments-and-wallet";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requireTenantReadPermission(ctx, "wallet:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: serviceDb } = getTenantServiceContext();
  const profile = await getBillingProfile(serviceDb, tenantId);
  return Response.json({ billingProfile: profile }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, legalBusinessName, gstin, billingAddress, billingState, pinCode } = body as {
    tenantId?: string;
    legalBusinessName?: string;
    gstin?: string;
    billingAddress?: string;
    billingState?: string;
    pinCode?: string;
  };

  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "wallet:topup");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  try {
    const profile = await upsertBillingProfile(
      serviceDb,
      tenantId,
      { legalBusinessName, gstin, billingAddress, billingState, pinCode },
      ctx.userId
    );
    return Response.json({ billingProfile: profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save billing profile";
    return Response.json({ error: msg }, { status: 400 });
  }
}
