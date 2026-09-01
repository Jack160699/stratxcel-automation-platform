import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { applyNaturalLanguageEdit, type SiteProject } from "@stratxcel/websites-and-domains";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { projectId: siteProjectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { tenantId, instruction, confirmed } = body;

    if (!tenantId || !instruction) {
      return Response.json({ error: "tenantId and instruction are required" }, { status: 400 });
    }

    // Risk Classification
    const lower = instruction.toLowerCase();
    const isHighRisk =
      lower.includes("delete") ||
      lower.includes("remove site") ||
      lower.includes("destroy") ||
      lower.includes("change domain") ||
      lower.includes("refund") ||
      lower.includes("publish immediately") ||
      lower.includes("unpublish");

    const isMediumRisk =
      lower.includes("price") ||
      lower.includes("product") ||
      lower.includes("catalog") ||
      lower.includes("navigation") ||
      lower.includes("menu");

    const riskLevel = isHighRisk ? "HIGH" : isMediumRisk ? "MEDIUM" : "LOW";

    if (isHighRisk && confirmed !== true) {
      return Response.json(
        {
          riskLevel: "HIGH",
          requiresConfirmation: true,
          message: "This instruction involves high-risk actions (e.g. deletion, domain, or publishing settings). Please confirm to apply.",
        },
        { status: 400 }
      );
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    // 1. Fetch current project
    const { data: project, error: fetchErr } = await serviceDb
      .from("site_projects")
      .select("*")
      .eq("id", siteProjectId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchErr || !project) {
      return Response.json({ error: "Website project not found" }, { status: 404 });
    }

    // 2. Apply natural-language modification
    const beforeProject = project as unknown as SiteProject;
    const updatedProject = applyNaturalLanguageEdit(beforeProject, instruction);

    // VERIFICATION INTEGRITY (2026-09-02): applyNaturalLanguageEdit now
    // returns the project genuinely unchanged (same revisionCount) when the
    // instruction matches none of its recognized patterns, instead of
    // always claiming a revision happened -- see that function's own header
    // comment. Honor that signal here rather than unconditionally recording
    // a version and reporting success: an unrecognized instruction is a
    // real, honest "I don't support that edit yet" outcome, not a silent
    // no-op reported as a completed change.
    if (updatedProject.revisionCount === beforeProject.revisionCount) {
      return Response.json({
        project,
        previewUrl: `/app/website/${siteProjectId}/preview`,
        instruction,
        applied: false,
        message: "That instruction wasn't recognized as a supported edit yet, so no change was made. Try describing a specific visual change (e.g. \"make the homepage more premium\") or adding an About page.",
      });
    }

    // 3. Record new version snapshot via the atomic RPC
    const { error: rpcErr } = await serviceDb.rpc("apply_site_project_version", {
      p_site_project_id: siteProjectId,
      p_tenant_id: tenantId,
      p_action: "revision",
      p_pages: updatedProject.pages,
      p_notes: instruction,
      p_custom_domain: project.custom_domain,
      p_actor_user_id: ctx.userId,
    });

    if (rpcErr) {
      return Response.json({ error: `Failed to record revision: ${rpcErr.message}` }, { status: 500 });
    }

    // 4. Record audit event
    await recordAuditEvent(serviceDb, {
      tenantId,
      actorUserId: ctx.userId,
      actorKind: "user",
      action: "WEBSITE_EDIT_APPLIED",
      targetType: "site_project",
      targetId: siteProjectId,
      metadata: { instruction, revisionCount: updatedProject.revisionCount },
    }).catch(() => {});

    // 5. Refetch and return
    const { data: finalProject } = await serviceDb
      .from("site_projects")
      .select("*")
      .eq("id", siteProjectId)
      .single();

    return Response.json({
      project: finalProject,
      previewUrl: `/app/website/${siteProjectId}/preview`,
      instruction,
      applied: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to apply edit";
    return Response.json({ error: msg }, { status: 500 });
  }
}
