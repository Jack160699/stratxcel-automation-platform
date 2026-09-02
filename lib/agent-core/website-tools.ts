/**
 * edit_website: the first real agent tool that can actually change a
 * Stratxcel-built website, not just report its status (check_website_status's
 * own description previously said "for creating or editing a website, say
 * that's dashboard-only for now" -- master brief section 7/22 explicitly
 * wants this over WhatsApp/Admin Chat). Reuses the exact same real sequence
 * the live HTTP route uses (lib/websites/apply-tenant-website-edit.ts),
 * extracted from that route in the same change so both call one
 * implementation, not two. See that file's header for the real security
 * upgrade this also carries (classifyEditRequest's prompt-injection guard,
 * previously only used by an unwired prototype engine).
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { applyTenantWebsiteEdit } from "@/lib/websites/apply-tenant-website-edit";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const WEBSITE_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "edit_website",
      description:
        "Apply a real, natural-language edit to a Stratxcel-built website -- writes a real new version via the same engine and RPC the dashboard editor uses. Only supports a specific, growing set of recognized edits (visual/copy restyle, adding an About page); an unrecognized instruction makes no change and says so honestly rather than pretending to apply it. High-risk instructions (deletion, domain changes, unpublishing) require the human to confirm before anything is written. Use check_website_status first to get a real siteProjectId -- never invent one.",
      parameters: {
        type: "object",
        properties: {
          siteProjectId: { type: "string", description: "A real site_projects.id from a prior check_website_status call." },
          instruction: { type: "string", description: "What to change, in plain language, e.g. 'make the homepage more premium' or 'add an about page'." },
          confirmed: { type: "boolean", description: "Set true only after the human has explicitly confirmed a high-risk edit that was previously blocked pending confirmation." },
          tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
        },
        required: ["siteProjectId", "instruction"],
      },
    },
    mutating: true,
    // A real website edit is reversible (every version is snapshotted, and
    // rollback already exists as its own real capability) and scoped to
    // Stratxcel's own site-builder content, not a third-party system --
    // low_mutation keeps "change the homepage" usable from WhatsApp, the
    // one channel the brief explicitly requires, while the shared
    // function's own risk classification (HIGH -> requires confirmed=true)
    // remains the real safety gate regardless of channel.
    risk: "low_mutation",
    requiredPermission: "agent:mutate:website",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      const siteProjectId = typeof args.siteProjectId === "string" ? args.siteProjectId : "";
      const instruction = typeof args.instruction === "string" ? args.instruction : "";
      if (!tenantId || !siteProjectId || !instruction) {
        return { outcome: "FAILED", reason: "missing_input" };
      }
      return applyTenantWebsiteEdit({
        supabase: ctx.supabase as never,
        tenantId,
        siteProjectId,
        instruction,
        confirmed: args.confirmed === true,
        actorUserId: ctx.principal.authUserId,
      });
    },
    interpretOutcome(result) {
      const r = result as { outcome?: string; reason?: string; message?: string; error?: string } | null;
      switch (r?.outcome) {
        case "APPLIED":
          return null; // real success
        case "NOT_APPLIED":
          return { status: "partial", detail: r.message ?? "the instruction wasn't recognized as a supported edit yet, so no change was made" };
        case "NEEDS_CONFIRMATION":
          return { status: "pending", detail: r.message ?? "this is a high-risk edit and needs explicit confirmation before it's applied" };
        case "SECURITY_BLOCKED":
          return { status: "failed", detail: `rejected by policy: ${r.reason}` };
        case "NOT_FOUND":
          return { status: "failed", detail: "no matching website project found for that id" };
        case "WRITE_FAILED":
          return { status: "failed", detail: r.error };
        default:
          return { status: "failed", detail: r?.reason };
      }
    },
  },
];
