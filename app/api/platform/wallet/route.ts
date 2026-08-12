import { requireTenantReadContext, requireTenantReadPermission } from "@/lib/tenants/tenant-context";
import { PermissionDeniedError } from "@/lib/rbac/policy";
import { getWalletAccount } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain user-initiated read, covered by wallet_accounts_tenant_read RLS
 * (see supabase/migrations/20260803121500_approvals_wallet_handoff.sql) —
 * runs on the authenticated session client, not the service-role client.
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

  const account = await getWalletAccount(ctx.supabase, tenantId);
  return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
}
