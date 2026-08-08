import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimum practical export of the customer's approved website: page/section
 * content, SEO metadata, and the generation spec (design/template
 * configuration) as one downloadable JSON bundle — no vendor lock-in. Only
 * the *approved* version is exportable; a draft/in-revision project has
 * nothing to export yet.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data: site, error } = await serviceDb.from("site_projects").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error || !site) return Response.json({ error: "Site project not found" }, { status: 404 });

  if (!site.approved_version_id) {
    return Response.json({ error: "This site has no approved version yet — nothing to export." }, { status: 400 });
  }

  const { data: version, error: versionErr } = await serviceDb
    .from("site_project_versions")
    .select("*")
    .eq("id", site.approved_version_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (versionErr || !version) return Response.json({ error: "Approved version record not found" }, { status: 404 });

  const exportBundle = {
    exportedAt: new Date().toISOString(),
    siteName: site.name,
    slug: site.slug,
    templateId: site.template_id,
    approvedAt: site.approved_at,
    versionNumber: version.version_number,
    pages: version.pages,
    seoDefaults: site.business_input,
    generationSpec: site.generation_spec,
    customDomain: site.custom_domain ?? null,
  };

  return Response.json(exportBundle, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${site.slug}-export.json"`,
    },
  });
}
