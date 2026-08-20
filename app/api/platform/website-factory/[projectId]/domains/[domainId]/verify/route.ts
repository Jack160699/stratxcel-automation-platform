/**
 * Verify Domain Connection API
 *
 * POST /api/platform/website-factory/[projectId]/domains/[domainId]/verify
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

    const connection = await customerDomainManager.verifyDomain({
      tenantId,
      siteProjectId: projectId,
      domainId,
    });

    // If verified & active, update project state to LIVE
    if (connection.status === "ACTIVE") {
      const serviceDb = createSupabaseServiceClient();
      await serviceDb
        .from("site_projects")
        .update({
          status: "live",
          deployment_status: "LIVE",
          ssl_status: "SSL_ACTIVE",
          production_url: `https://${connection.normalizedDomain}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("tenant_id", tenantId);
    }

    return Response.json({
      success: true,
      domain: connection,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify domain";
    return Response.json({ error: msg }, { status: 400 });
  }
}
