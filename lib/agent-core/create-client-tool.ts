/**
 * create_client: the real write half of the Founder multi-company model
 * that list_clients/get_client/resolve_client_by_name (all read-only) left
 * open -- the master brief's own canonical agency-model example ("Create a
 * client operation for this business") requires the Founder to actually be
 * able to create a new company, not just view/resolve existing ones.
 *
 * Reuses createTenant (lib/tenants/repository.ts) unmodified rather than
 * duplicating tenant-creation logic -- the exact same function the
 * onboarding wizard and the audit checkout/promo-redeem guest-tenant paths
 * already call, now atomic (see create_tenant_with_owner,
 * supabase/migrations/20260907060000_atomic_tenant_owner_creation.sql) so
 * every caller, including this one, is free of the orphaned-tenant risk
 * docs/product-design/FINAL_HARDENING_BACKLOG.md flagged as a Blocker.
 *
 * The creating principal becomes the new tenant's owner member (not a
 * placeholder/system user) -- the same real mechanism the web app's
 * client-switcher (lib/tenants/current-tenant.ts's listMyTenants/
 * ACTIVE_TENANT_COOKIE) already uses, so a newly-created company is
 * immediately visible and operable through every existing surface (Admin
 * Web switcher, list_clients, resolve_client_by_name), not a special case.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { createTenant } from "../tenants/repository.ts";
import { createSupabaseServiceClient } from "../supabase/service.ts";

const MAX_SLUG_LENGTH = 48;

/** Pure, standalone-testable -- mirrors app/api/platform/onboarding/route.ts's
 *  own slugify exactly, so a business name produces the same real shape a
 *  human onboarding through the wizard would get. */
export function slugifyBusinessName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, MAX_SLUG_LENGTH);
  return slug || "workspace";
}

/** A short, low-collision suffix for the one real retry this tool attempts
 *  on a slug collision -- same shape as onboarding's own retry suffix. */
function withUniqueSuffix(slug: string): string {
  return `${slug.slice(0, MAX_SLUG_LENGTH - 5)}-${Date.now().toString(36).slice(-4)}`;
}

export const CREATE_CLIENT_TOOL: AgentTool = {
  schema: {
    name: "create_client",
    description:
      "Creates a real new company/client tenant -- e.g. when the Founder says 'create a client operation for my friend's solar company'. YOU (the creating principal) become the new company's owner, exactly like completing onboarding -- it's immediately visible via list_clients, resolve_client_by_name, and the Admin Web company switcher. This is a real, permanent business record, not a draft -- use it only when a human has actually asked for a new company to be created, never speculatively. It does not seed Brand Brain, connect integrations, or create any missions -- those are separate, later steps.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The real business name, e.g. 'SolarCo Bhilai'." },
      },
      required: ["name"],
    },
  },
  mutating: true,
  risk: "external_mutation",
  requiredPermission: "agent:mutate:clients",
  async execute(ctx, args) {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (!name) return { outcome: "FAILED", reason: "missing_name" };

    const service = createSupabaseServiceClient();
    const baseSlug = slugifyBusinessName(name);

    try {
      const tenant = await createTenant(service, { slug: baseSlug, name, ownerUserId: ctx.principal.authUserId });
      return { outcome: "CREATED", tenantId: tenant.id, slug: tenant.slug, name: tenant.name };
    } catch (err) {
      const message = err instanceof Error ? err.message : "create_failed";
      if (!message.includes("duplicate key")) return { outcome: "FAILED", reason: message };
    }

    // Real retry, matching the onboarding route's own established pattern:
    // one attempt with a suffixed slug, never a silent loop.
    try {
      const uniqueSlug = withUniqueSuffix(baseSlug);
      const tenant = await createTenant(service, { slug: uniqueSlug, name, ownerUserId: ctx.principal.authUserId });
      return { outcome: "CREATED", tenantId: tenant.id, slug: tenant.slug, name: tenant.name };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "create_failed_after_retry" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "CREATED") return null;
    return { status: "failed", detail: r?.reason };
  },
};
