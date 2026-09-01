/**
 * Bridges three more EXISTING, already-canonical engines into the agent
 * tool registry -- same "thin adapter, zero new logic" discipline as
 * research-tools.ts. App-side (not packages/agent-core) because each wraps
 * app-internal lib/* code directly.
 *
 * - check_growth_status: packages/search-discovery's listSearchState --
 *   the SAME real, persisted search_opportunities/search_analysis_runs data
 *   the customer Search Growth UI reads. Never re-crawls or recomputes; a
 *   fresh crawl is what analyze_website (research-tools.ts) is for, and
 *   that's for THIRD-PARTY sites, not Stratxcel's own tenants.
 * - check_connections: lib/connectors/load-integrations-data.ts's
 *   loadIntegrationsStatusData -- the SAME function the customer
 *   Integrations page renders from (Google/GBP/Search Console/GA4/Vercel/
 *   WhatsApp/social), so a WhatsApp/Admin-AI answer can never disagree with
 *   what the dashboard shows.
 * - generate_image: lib/social/agent/generate-image-tool.ts's
 *   executeGenerateImageTool, UNMODIFIED -- real budget gate, real
 *   idempotent job persistence, real brand-context loading. This function's
 *   own header comment is explicit that production callers must go through
 *   it (never construct a fresh unmetered runtime) -- this tool does
 *   exactly that, nothing more.
 */
import { listSearchState } from "@stratxcel/search-discovery";
import { loadIntegrationsStatusData } from "../connectors/load-integrations-data";
import { executeGenerateImageTool } from "../social/agent/generate-image-tool";
import type { AgentTenantContext } from "../social/agent-tenant-types";
import type { AgentTool } from "@stratxcel/agent-core";

/** Staff/Boss turns have no tenantId (platform staff aren't tenant-scoped);
 *  an explicit args.tenantId (e.g. a client's real id from a prior
 *  list_clients call) always wins, then falls back to Stratxcel's own
 *  platform tenant -- never silently picks an arbitrary tenant. A client
 *  principal's own tenantId is always used, never an arg-supplied one. */
function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? process.env.STRATXCEL_PLATFORM_TENANT_ID ?? null;
}

export const GROWTH_MEDIA_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "check_growth_status",
      description: "Real, currently-stored SEO/AEO/GEO opportunities, recommendations, actions, and measurement snapshots for a tenant -- the exact same data the Search Growth dashboard shows. Use for 'check our SEO/AEO/GEO', 'how is growth doing', or a specific client's growth status. Never re-crawls; reads what's already computed.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:research",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      if (!tenantId) return { available: false, reason: "no_tenant_resolved" };
      const state = await listSearchState(ctx.supabase as never, tenantId);
      return { tenantId, ...state };
    },
  },
  {
    schema: {
      name: "check_connections",
      description: "Real, current connection state for Google, Google Business Profile (verification, review/location details), Search Console, GA4, Vercel (write-readiness), WhatsApp, and social platforms -- the exact same data the Integrations page shows. Use for 'is our Google connected', 'check Google profile', 'is Vercel write-ready', etc.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:integrations",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      if (!tenantId) return { available: false, reason: "no_tenant_resolved" };
      const status = await loadIntegrationsStatusData(ctx.supabase as never, tenantId);
      return { tenantId, ...status };
    },
  },
  {
    schema: {
      name: "generate_image",
      description: "Generate a real, brand-grounded image/poster/creative using Stratxcel's existing image engine (real cost, real budget gate, real brand context) -- for 'create an image/poster' requests. One brief per call; costs real money, so only call when the human actually asked for an image, never speculatively.",
      parameters: {
        type: "object",
        properties: {
          brief: { type: "string", description: "What the image should show, in enough detail to generate it well." },
          tenantId: { type: "string", description: "Optional -- whose brand this is for. Defaults to Stratxcel's own." },
          aspectRatio: { type: "string", description: "e.g. 1:1, 4:5, 9:16. Defaults to 1:1." },
        },
        required: ["brief"],
      },
    },
    mutating: true,
    // A real image costs real money and produces a real asset, but it's
    // Stratxcel's own brand/spend being authorized by an already-authorized
    // staff member for their own request -- not an external-facing action
    // (nothing is sent anywhere, no third party is contacted). low_mutation
    // keeps WhatsApp usable (confirm_required) rather than dashboard_only;
    // the tool's own budget gate is the real spend control regardless of
    // channel.
    risk: "low_mutation",
    requiredPermission: "agent:mutate:media",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      if (!tenantId) return { outcome: "FAILED", reason: "no_tenant_resolved" };
      const brief = typeof args.brief === "string" ? args.brief : "";
      const actorCtx: AgentTenantContext = {
        ok: true,
        mode: "tenant",
        tenantId,
        actorUserId: ctx.principal.authUserId,
        supabase: ctx.supabase as never,
      };
      return executeGenerateImageTool(actorCtx, {
        brief,
        aspectRatio: typeof args.aspectRatio === "string" ? args.aspectRatio : "1:1",
        candidateCount: 1,
      });
    },
  },
];
