/**
 * Customer Domain Connection API
 *
 * POST /api/platform/website-factory/[projectId]/domains
 *   Connects an existing customer-owned domain to a website project.
 *
 * GET /api/platform/website-factory/[projectId]/domains
 *   Lists all domain connections for a project.
 */

import { requireTenantContext, requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { customerDomainManager, type SupportedRegistrar } from "@stratxcel/websites-and-domains";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { tenantId, domain, preferredRegistrar } = body;

    if (!tenantId || !domain) {
      return Response.json(
        { error: "tenantId and domain are required" },
        { status: 400 }
      );
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    // Verify project belongs to tenant
    const serviceDb = createSupabaseServiceClient();
    const { data: project, error: projErr } = await serviceDb
      .from("site_projects")
      .select("id, name, slug, custom_domain")
      .eq("id", projectId)
      .eq("tenant_id", tenantId)
      .single();

    if (projErr || !project) {
      return Response.json(
        { error: "Website project not found in active tenant" },
        { status: 404 }
      );
    }

    const connection = await customerDomainManager.connectDomain({
      tenantId,
      siteProjectId: projectId,
      domain,
      preferredRegistrar: (preferredRegistrar as SupportedRegistrar) || "other",
      isPrimary: true,
    });

    // Update site_projects.custom_domain
    await serviceDb
      .from("site_projects")
      .update({
        custom_domain: connection.normalizedDomain,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("tenant_id", tenantId);

    return Response.json({
      success: true,
      domain: connection,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect domain";
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");

    if (!tenantId) {
      return Response.json(
        { error: "tenantId query parameter is required" },
        { status: 400 }
      );
    }

    const ctx = await requireTenantReadContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const domains = customerDomainManager.getProjectDomains(tenantId, projectId);

    return Response.json({
      domains,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load project domains";
    return Response.json({ error: msg }, { status: 500 });
  }
}
