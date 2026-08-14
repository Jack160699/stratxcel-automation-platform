import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { deleteCustomerTenantData, isProtectedPlatformTenant } from "@/lib/tenants/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const { tenantId } = await params;
  if (!tenantId) {
    return Response.json({ error: "Missing tenant ID" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { confirmation?: string };
  if (body.confirmation !== "DELETE") {
    return Response.json(
      { error: "Explicit confirmation required. Send { confirmation: 'DELETE' }." },
      { status: 400 }
    );
  }

  const { supabase: service } = getTenantServiceContext();

  const { data: tenant } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) {
    return Response.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  if (isProtectedPlatformTenant(tenant.slug, tenant.id)) {
    return Response.json({ error: "PROTECTED_TENANT" }, { status: 403 });
  }

  const result = await deleteCustomerTenantData(service, tenantId, admin.email ?? admin.userId);
  if (!result.ok) {
    return Response.json({ error: result.error ?? "Deletion failed" }, { status: 400 });
  }

  return Response.json({ ok: true, deletedTenantId: tenantId });
}
