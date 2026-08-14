import { getTenantServiceContext, requireTenantReadContext, requireTenantReadPermission } from "@/lib/tenants/tenant-context";
import { PermissionDeniedError } from "@/lib/rbac/policy";
import { getWalletAccount } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain user-initiated read. Authorization is checked against the caller's
 * authenticated tenant membership before the service client lazily creates
 * the tenant's zero-balance wallet when one does not exist.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requireTenantReadPermission(ctx, "wallet:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const account = await getWalletAccount(ctx.supabase ?? getTenantServiceContext().supabase, tenantId);
  return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
}
