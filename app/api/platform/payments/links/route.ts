import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createPaymentLink, listPaymentLinks } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "wallet:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  try {
    const links = await listPaymentLinks(supabase, tenantId);
    return Response.json({ links }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list payment links";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, amountInRupees, amountCents, description, customerName, customerEmail, customerPhone, expireBy } = body;

    if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

    const computedCents = amountCents ? Number(amountCents) : Math.round(Number(amountInRupees) * 100);
    if (isNaN(computedCents) || computedCents <= 0 || !Number.isInteger(computedCents)) {
      return Response.json({ error: "A valid positive payment amount is required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "wallet:topup");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }

    const { supabase } = getTenantServiceContext();
    const link = await createPaymentLink(supabase, {
      tenantId,
      amountCents: computedCents,
      description: description || undefined,
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      expireBy: expireBy || undefined,
      createdBy: ctx.userId,
    });

    return Response.json({ link }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create payment link";
    return Response.json({ error: msg }, { status: 400 });
  }
}
