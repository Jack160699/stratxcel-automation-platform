import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  generate5PageSite,
  requestSiteRevision,
  approveAndPublishSite,
} from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, businessName, contactEmail, contactPhone } = body;

    if (!tenantId || !businessName) {
      return Response.json({ error: "tenantId and businessName are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const site = generate5PageSite({
      tenantId,
      businessName,
      contactEmail,
      contactPhone,
    });

    const { supabase: serviceDb } = getTenantServiceContext();

    const { data: dbSite, error } = await serviceDb
      .from("site_projects")
      .insert({
        tenant_id: tenantId,
        name: site.name,
        slug: site.slug,
        template_id: site.templateId,
        status: site.status,
        preview_subdomain: site.previewSubdomain,
        pages: site.pages,
      })
      .select("*")
      .single();

    if (error) {
      return Response.json({ error: `Failed to create site project: ${error.message}` }, { status: 500 });
    }

    return Response.json({ site: dbSite, previewUrl: `https://${site.previewSubdomain}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create site project";
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, siteId, action, notes, customDomain } = body;

    if (!tenantId || !siteId || !action) {
      return Response.json({ error: "tenantId, siteId, and action (revision | approve) are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    const { data: existingSite, error: fetchErr } = await serviceDb
      .from("site_projects")
      .select("*")
      .eq("id", siteId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchErr || !existingSite) {
      return Response.json({ error: "Site project not found" }, { status: 404 });
    }

    const currentProject = {
      id: existingSite.id,
      tenantId: existingSite.tenant_id,
      name: existingSite.name,
      slug: existingSite.slug,
      templateId: existingSite.template_id,
      status: existingSite.status,
      previewSubdomain: existingSite.preview_subdomain,
      pages: existingSite.pages,
      revisionCount: existingSite.revision_count ?? 0,
      exportUnlocked: false,
    };

    let updatedProject;
    if (action === "revision") {
      updatedProject = requestSiteRevision(currentProject, notes ?? "Customer requested changes");
    } else if (action === "approve") {
      updatedProject = approveAndPublishSite(currentProject, customDomain);
    } else {
      return Response.json({ error: "Action must be 'revision' or 'approve'" }, { status: 400 });
    }

    const { data: saved, error: updateErr } = await serviceDb
      .from("site_projects")
      .update({
        status: updatedProject.status,
        revision_notes: updatedProject.revisionNotes ?? null,
        revision_count: updatedProject.revisionCount,
        custom_domain: updatedProject.customDomain ?? null,
        published_at: updatedProject.status === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", siteId)
      .select("*")
      .single();

    if (updateErr) {
      return Response.json({ error: `Failed to update site: ${updateErr.message}` }, { status: 500 });
    }

    return Response.json({ site: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update site project";
    return Response.json({ error: msg }, { status: 400 });
  }
}
