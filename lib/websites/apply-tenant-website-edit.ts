/**
 * Shared natural-language website edit sequence -- extracted from
 * app/api/platform/website-factory/[projectId]/edit/route.ts so the real
 * HTTP route and the new edit_website agent tool (lib/agent-core/
 * website-tools.ts) call exactly one implementation, not two copies that
 * could drift.
 *
 * Also fixes a real gap found while extracting this: the route's risk
 * classification was a small inline keyword list (delete/remove site/
 * destroy/change domain/refund/publish immediately/unpublish for HIGH;
 * price/product/catalog/navigation/menu for MEDIUM) with no prompt-
 * injection/secret-exfiltration guard at all. packages/websites-and-domains
 * already has a real, more complete classifier for exactly this --
 * classifyEditRequest (editing/classifier.ts) -- with a genuine security
 * check ("ignore previous instructions", "reveal secrets", "api_key",
 * "service_role", script/javascript: payloads) that the live route never
 * used. Confirmed classifyEditRequest is safe to reuse here even though the
 * rest of the editing/ module (WebsiteEditingEngine, WebsiteVersionManager)
 * is NOT: that module's version manager is a pure in-memory Map
 * (`versionStorage: Map<string, VersionSnapshot[]>`), architecturally
 * incompatible with a real serverless route -- state would vanish between
 * invocations. classifyEditRequest itself is a pure function with no such
 * dependency, so it's safe to use standalone. applyNaturalLanguageEdit
 * (site-builder.ts) + the apply_site_project_version RPC remain the real,
 * persistent write path -- unchanged.
 */
import { classifyEditRequest } from "@stratxcel/websites-and-domains";
import { applyNaturalLanguageEdit, type SiteProject } from "@stratxcel/websites-and-domains";
import { recordAuditEvent } from "@stratxcel/audit";

interface MinimalServiceClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): { single(): Promise<{ data: unknown; error: { message: string } | null }> };
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
}

export interface ApplyTenantWebsiteEditInput {
  supabase: MinimalServiceClient;
  tenantId: string;
  siteProjectId: string;
  instruction: string;
  confirmed?: boolean;
  actorUserId?: string;
}

export type ApplyTenantWebsiteEditResult =
  | { outcome: "NOT_FOUND" }
  | { outcome: "SECURITY_BLOCKED"; reason: string }
  | { outcome: "NEEDS_CONFIRMATION"; riskLevel: "HIGH"; message: string }
  | { outcome: "NOT_APPLIED"; project: SiteProject; message: string }
  | { outcome: "APPLIED"; project: SiteProject; previewUrl: string; revisionCount: number }
  | { outcome: "WRITE_FAILED"; error: string };

export async function applyTenantWebsiteEdit(
  input: ApplyTenantWebsiteEditInput
): Promise<ApplyTenantWebsiteEditResult> {
  const { supabase, tenantId, siteProjectId, instruction, confirmed, actorUserId } = input;

  const intent = classifyEditRequest(instruction);
  if (intent.isSecurityViolation) {
    return { outcome: "SECURITY_BLOCKED", reason: intent.securityViolationReason ?? "policy_violation" };
  }
  if (intent.riskLevel === "HIGH" && confirmed !== true) {
    return {
      outcome: "NEEDS_CONFIRMATION",
      riskLevel: "HIGH",
      message: "This instruction involves high-risk actions (e.g. deletion, domain, or publishing settings). Please confirm to apply.",
    };
  }

  const { data: project, error: fetchErr } = await supabase
    .from("site_projects")
    .select("*")
    .eq("id", siteProjectId)
    .eq("tenant_id", tenantId)
    .single();
  if (fetchErr || !project) return { outcome: "NOT_FOUND" };

  const beforeProject = project as unknown as SiteProject;
  const updatedProject = applyNaturalLanguageEdit(beforeProject, instruction);

  if (updatedProject.revisionCount === beforeProject.revisionCount) {
    return {
      outcome: "NOT_APPLIED",
      project: beforeProject,
      message:
        "That instruction wasn't recognized as a supported edit yet, so no change was made. Try describing a specific visual change (e.g. \"make the homepage more premium\") or adding an About page.",
    };
  }

  const { error: rpcErr } = await supabase.rpc("apply_site_project_version", {
    p_site_project_id: siteProjectId,
    p_tenant_id: tenantId,
    p_action: "revision",
    p_pages: updatedProject.pages,
    p_notes: instruction,
    p_custom_domain: (beforeProject as unknown as { custom_domain?: string | null }).custom_domain,
    p_actor_user_id: actorUserId ?? null,
  });
  if (rpcErr) return { outcome: "WRITE_FAILED", error: rpcErr.message };

  await recordAuditEvent(supabase as never, {
    tenantId,
    actorUserId: actorUserId ?? null,
    actorKind: actorUserId ? "user" : "system",
    action: "WEBSITE_EDIT_APPLIED",
    targetType: "site_project",
    targetId: siteProjectId,
    metadata: { instruction, revisionCount: updatedProject.revisionCount },
  }).catch(() => {});

  const { data: finalProject } = await supabase
    .from("site_projects")
    .select("*")
    .eq("id", siteProjectId)
    .single();

  return {
    outcome: "APPLIED",
    project: (finalProject ?? updatedProject) as unknown as SiteProject,
    previewUrl: `/app/website/${siteProjectId}/preview`,
    revisionCount: updatedProject.revisionCount,
  };
}
