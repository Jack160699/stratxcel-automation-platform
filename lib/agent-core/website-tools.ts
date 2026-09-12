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
 *
 * create_website: the counterpart for a brand-new site (creation was still
 * genuinely dashboard-only until this change -- see
 * docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md). Reuses the real AI
 * generation pipeline extracted from app/api/platform/website-factory/route.ts
 * (lib/websites/create-tenant-website.ts), the same one-implementation
 * precedent edit_website set. Deliberately narrower than edit_website:
 * requiredPermission is agent:mutate:website_create, granted ONLY to
 * platform_owner (see principals/repository.ts) -- Founder-only, never
 * platform_admin or any client role. risk stays low_mutation so a WhatsApp
 * Founder still needs exactly one CONFIRM <code> before any AI spend/write
 * happens (decideMutationPolicy), after which generation + the internal
 * preview are real and autonomous. Production deployment and custom-domain/
 * DNS are deliberately NOT reachable from this tool or any WhatsApp path --
 * those stay on the existing dashboard-only PATCH deploy/publish actions on
 * that same route, untouched.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { applyTenantWebsiteEdit } from "@/lib/websites/apply-tenant-website-edit";
import { createTenantWebsite } from "@/lib/websites/create-tenant-website";

// NOTE (merge 2026-09-13, Update 100 continued): origin/main independently
// added its OWN create_website tool here, backed by
// @stratxcel/connectors' initiateWebsiteCreation. That function is a real,
// live, production fabrication: it writes a "COMPLETED" mission +
// mission_events/"progress: 100" DB rows and returns a conversational
// "Preview generated and ready for inspection" reply with a
// `https://<slug>.vercel.app` previewUrl, a fabricated GitHub repoName, and
// an AWAITING_APPROVAL->LIVE path that unconditionally returns
// "✅ Website successfully deployed to production!" -- WITHOUT ever calling
// a real GitHub or Vercel deploy API for that slug, and without generating
// any real page content (createWebsiteProjectShell's `pages` are all empty
// `sections: []`). Confirmed live-caused: site_projects
// giri-tours-and-travels-etja3 (status=draft, empty pages, created
// 2026-09-12) matches this function's exact shell shape, not
// createTenantWebsite's (which always produces populated pages +
// preview_ready). Deliberately NOT kept as a second create_website
// registration -- a duplicate tool name is itself a bug, and the real
// implementation already exists below. See
// docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md Update 100 for the full
// writeup; apps/hermes-gateway/src/tool-handlers.ts and
// packages/connectors/src/resources/core-mcp-router.ts still reference the
// fabricating function directly and need their own follow-up pass (lower
// urgency: HERMES_MODE is currently disabled, so that path is dormant).

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
  {
    schema: {
      name: "create_website",
      description:
        "Create a brand-new Stratxcel website from a plain-language description of the business -- runs the same real AI generation engine the dashboard's Website Factory uses, writes a real new site_projects row, and returns a real, working preview link. Only for a NEW website; an existing one is edited with edit_website instead. This does NOT deploy to production or connect a custom domain -- those remain a separate, dashboard-approved step after the Founder reviews the preview.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "What the business/project is and what the website should achieve, e.g. 'a premium coffee shop in Raipur, warm and upscale, needs a menu and location page'." },
          businessName: { type: "string", description: "Optional -- the business's name, if known." },
          websiteType: { type: "string", description: "Optional -- e.g. 'business', 'ecommerce', 'landing_page'. Leave unset to let the engine infer it." },
          tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
        },
        required: ["description"],
      },
    },
    mutating: true,
    // Real AI spend + a brand-new customer-facing surface, but reversible
    // (the project starts in preview_ready/NOT_STARTED, nothing customer-
    // facing goes live) and stays inside Stratxcel's own site-builder --
    // low_mutation, same as edit_website, means the Founder still needs
    // exactly one CONFIRM <code> before this runs at all.
    risk: "low_mutation",
    requiredPermission: "agent:mutate:website_create",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      const description = typeof args.description === "string" ? args.description : "";
      if (!tenantId || !description) {
        return { outcome: "MISSING_INPUT", reason: "missing_input" };
      }
      return createTenantWebsite({
        supabase: ctx.supabase as never,
        tenantId,
        actorUserId: ctx.principal.authUserId,
        prompt: description,
        businessName: typeof args.businessName === "string" ? args.businessName : undefined,
        websiteType: typeof args.websiteType === "string" ? args.websiteType : undefined,
        channel: ctx.principal.channel === "whatsapp" ? "whatsapp_agent" : `agent_${ctx.principal.channel}`,
      });
    },
    interpretOutcome(result) {
      const r = result as { outcome?: string; reason?: string } | null;
      switch (r?.outcome) {
        case "CREATED":
          return null; // real success
        case "NOT_ENTITLED":
          return { status: "failed", detail: r.reason ?? "this plan doesn't include a website" };
        case "RATE_LIMITED":
          return { status: "failed", detail: r.reason ?? "too many websites created recently" };
        case "BLOCKED":
          return { status: "failed", detail: r.reason ?? "website creation is temporarily paused" };
        case "GENERATION_FAILED":
          return { status: "failed", detail: r.reason ?? "website generation failed" };
        case "WRITE_FAILED":
          return { status: "failed", detail: r.reason ?? "could not save the new website" };
        case "MISSING_INPUT":
          return { status: "failed", detail: "a business description is required" };
        default:
          return { status: "failed", detail: r?.reason };
      }
    },
  },
];
