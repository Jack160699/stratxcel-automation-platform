/**
 * Disconnect Domain API
 *
 * POST /api/platform/website-factory/[projectId]/domains/[domainId]/disconnect
 */

import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { customerDomainManager } from "@stratxcel/websites-and-domains";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; domainId: string }> }
) {
  try {
    const { projectId, domainId } = await params;
    const body = await request.json().catch(() => ({}));
    const { tenantId } = body;

    if (!tenantId) {
      return Response.json(
        { error: "tenantId is required" },
        { status: 400 }
      );
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const connection = customerDomainManager.disconnectDomain({
      tenantId,
      siteProjectId: projectId,
      domainId,
    });

    const serviceDb = createSupabaseServiceClient();
    await serviceDb
      .from("site_projects")
      .update({
        custom_domain: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("tenant_id", tenantId);

    return Response.json({
      success: true,
      domain: connection,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to disconnect domain";
    return Response.json({ error: msg }, { status: 400 });
  }
}
