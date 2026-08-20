/**
 * Website Version Rollback API
 *
 * Provides a one-click rollback to any prior known-good version
 * stored in `site_project_versions`.
 *
 * Restores:
 *   - Page structure & content
 *   - Theme & styling config
 *   - Custom domain mapping
 *
 * Restores instantaneously from database snapshots without needing
 * to invoke AI generation or run lengthy rebuilds.
 */

import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: siteProjectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { tenantId, targetVersionNumber } = body;

    if (!tenantId) {
      return Response.json({ error: "tenantId is required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    // 1. Fetch the project
    const { data: project, error: projErr } = await serviceDb
      .from("site_projects")
      .select("*")
      .eq("id", siteProjectId)
      .eq("tenant_id", tenantId)
      .single();

    if (projErr || !project) {
      return Response.json({ error: "Website project not found" }, { status: 404 });
    }

    // 2. Fetch target version snapshot
    let versionQuery = serviceDb
      .from("site_project_versions")
      .select("*")
      .eq("site_project_id", siteProjectId)
      .eq("tenant_id", tenantId);

    if (typeof targetVersionNumber === "number") {
      versionQuery = versionQuery.eq("version_number", targetVersionNumber);
    } else {
      // Default: fetch the previous version (skip current version)
      versionQuery = versionQuery.order("version_number", { ascending: false }).limit(2);
    }

    const { data: versions, error: verErr } = await versionQuery;
    if (verErr || !versions || versions.length === 0) {
      return Response.json({ error: "No prior version snapshot found for rollback" }, { status: 404 });
    }

    const targetVersion = typeof targetVersionNumber === "number"
      ? versions[0]
      : versions.length > 1
      ? versions[1]
      : versions[0];

    if (!targetVersion) {
      return Response.json({ error: "Target rollback version not available" }, { status: 404 });
    }

    // 3. Apply rollback snapshot via version RPC
    const { data: rpcResult, error: rpcErr } = await serviceDb.rpc("apply_site_project_version", {
      p_site_project_id: siteProjectId,
      p_tenant_id: tenantId,
      p_action: "rollback",
      p_pages: targetVersion.pages,
      p_notes: `Rolled back to version v${targetVersion.version_number}`,
      p_custom_domain: targetVersion.custom_domain || project.custom_domain,
      p_actor_user_id: ctx.userId,
    });

    if (rpcErr) {
      return Response.json({ error: `Rollback failed: ${rpcErr.message}` }, { status: 500 });
    }

    // 4. Record audit event
    await recordAuditEvent(serviceDb, {
      tenantId,
      actorUserId: ctx.userId,
      actorKind: "user",
      action: "WEBSITE_VERSION_ROLLBACK",
      targetType: "site_project",
      targetId: siteProjectId,
      metadata: {
        fromVersion: project.current_version_number,
        toVersion: targetVersion.version_number,
      },
    }).catch(() => {});

    // 5. Fetch updated project
    const { data: updatedProject } = await serviceDb
      .from("site_projects")
      .select("*")
      .eq("id", siteProjectId)
      .single();

    return Response.json({
      project: updatedProject,
      rolledBackToVersion: targetVersion.version_number,
      previewUrl: `/app/website/${siteProjectId}/preview`,
      message: `Website successfully rolled back to version ${targetVersion.version_number}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to execute version rollback";
    return Response.json({ error: msg }, { status: 500 });
  }
}
