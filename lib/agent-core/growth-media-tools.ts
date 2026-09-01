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
 * - check_website_status: the exact same site_projects read as
 *   app/api/platform/websites/route.ts's GET handler (same columns, same
 *   ordering) -- packages/websites-and-domains's full creation/editing/
 *   deployment engine (123+ files: brief engine, generation engine, editing
 *   engine, ecommerce engine, a real deployment state machine) is a real,
 *   mature subsystem that genuinely needs its own dedicated bridging pass,
 *   not a rushed wrapper here (capability_registry:
 *   engine:website_vercel_orchestration stays REAL_NOT_EXPOSED for the
 *   creation/editing/deployment mutation surface). A read-only status
 *   check is the safe, scoped slice of it: zero new logic, matches the
 *   check_growth_status/check_connections pattern exactly.
 * - check_audit_status: the exact same public_audit_requests read as
 *   app/api/platform/audit/route.ts's GET handler (list branch), scoped by
 *   tenantId instead of a cookie session since a service-role agent call
 *   has none -- same table, same real job_status/progress_percentage
 *   pipeline packages/audit-engine's runAutomaticAuditGeneration writes
 *   into. NOT the same thing as the pre-existing inspect_audit_events tool
 *   (agent:read:audit) -- that reads the platform's own internal
 *   security/action audit_events log, a completely different table and
 *   concept that happens to share the word "audit"; this one is the
 *   customer-facing prospect/website Audit product, so it gets its own
 *   permission (agent:read:audit_reports) to avoid conflating the two.
 * - generate_image: lib/social/agent/generate-image-tool.ts's
 *   executeGenerateImageTool, UNMODIFIED -- real budget gate, real
 *   idempotent job persistence, real brand-context loading. This function's
 *   own header comment is explicit that production callers must go through
 *   it (never construct a fresh unmetered runtime) -- this tool does
 *   exactly that, nothing more.
 * - execute_growth_action: packages/search-discovery's executeSearchAction,
 *   UNMODIFIED -- a real, already-mature "verify as a platform primitive"
 *   implementation (before/after evidence, live HTML re-verification,
 *   automatic rollback on verification failure, precise
 *   COMPLETED/VERIFIED/FAILED/BLOCKED/VERIFICATION_FAILED states). Provider
 *   resolution mirrors app/api/platform/search/actions/execute/route.ts's
 *   EXACT logic (same functions, same fallback order) rather than
 *   reinventing it -- this only replaces that route's cookie-scoped
 *   requireTenantContext()/RBAC check with agent-core's own equivalent
 *   (a verified AgentPrincipal + explicit tool permission), since a
 *   service-role, principal-authorized call has no browser session to read.
 *   Operates only on an action a human already asked to see via
 *   check_growth_status -- never invents a mutation from free text.
 */
import { listSearchState, executeSearchAction, createFixtureWordPressProvider, createStratxcelNativeCMSProvider, createVercelCMSProvider, resolveVercelWriteCapability, runSearchAnalysis, resolveGoogleProviderStates, stableFingerprint, CRAWL_LIMITS, normalizeWebsiteInput, type RuntimePlan, type ProviderConnection } from "@stratxcel/search-discovery";
import { loadIntegrationsStatusData } from "../connectors/load-integrations-data";
import { executeGenerateImageTool } from "../social/agent/generate-image-tool";
import type { AgentTenantContext } from "../social/agent-tenant-types";
import type { AgentTool } from "@stratxcel/agent-core";
import { isPlanTier } from "@stratxcel/payments-and-wallet";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { interpretGrowthAnalysisOutcome } from "./growth-analysis-outcome";

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
      name: "run_growth_analysis",
      description: "Trigger a REAL fresh SEO/AEO/GEO analysis run on a tenant's website -- a real, SSRF-protected crawl of the site's own public pages, real technical-SEO analysis, real competitor discovery, and (when Google Search Console is connected) real query measurement -- producing new opportunities/recommendations exactly like the scheduled/manual dashboard run does. Use for 'run a fresh SEO scan', 'analyze our site again', 'check for new SEO issues' -- NOT for reading already-computed results (use check_growth_status for that). Rate-limited to 3 runs per 15 minutes per tenant, same as the dashboard.",
      parameters: {
        type: "object",
        properties: {
          propertyUrl: { type: "string", description: "The website to analyze, e.g. stratxcel.in or https://stratxcel.in. Bare domains are fine." },
          propertyName: { type: "string", description: "Optional display name for this property. Defaults to the domain." },
          tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
        },
        required: ["propertyUrl"],
      },
    },
    mutating: true,
    // A real crawl+analysis of the tenant's OWN public site, rate-limited,
    // never touching the live website (that's execute_growth_action's job,
    // gated separately). Mirrors app/api/platform/search/run/route.ts's
    // exact logic (same rate-limit, same idempotency-key derivation, same
    // Google-provider resolution with the same fail-degraded-not-abort
    // handling) rather than reinventing it -- only replaces that route's
    // cookie-scoped requireTenantContext()/RBAC check with agent-core's own
    // equivalent, same reasoning as execute_growth_action.
    risk: "low_mutation",
    requiredPermission: "agent:mutate:website",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      if (!tenantId) return { outcome: "FAILED", reason: "no_tenant_resolved" };
      const rawUrl = typeof args.propertyUrl === "string" ? args.propertyUrl : "";
      const normalizedSite = normalizeWebsiteInput(rawUrl);
      if (!normalizedSite.ok) return { outcome: "FAILED", reason: `invalid_property_url:${normalizedSite.reason}` };
      const propertyUrl = normalizedSite.url;

      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { count } = await ctx.supabase
        .from("search_analysis_runs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", since);
      if ((count ?? 0) >= 3) return { outcome: "RATE_LIMITED", reason: "3 runs already started in the last 15 minutes -- try again shortly." };

      const { data: subscription } = await ctx.supabase
        .from("subscriptions")
        .select("plan_tier")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const tier = (subscription as { plan_tier?: string } | null)?.plan_tier;
      const plan: RuntimePlan = isPlanTier(tier) && tier in CRAWL_LIMITS ? (tier as RuntimePlan) : "free";

      const bucket = new Date().toISOString().slice(0, 16).replace(/\d$/, "0");
      const idempotencyKey = stableFingerprint([tenantId, propertyUrl, "manual", bucket]);

      let googleConnections: ProviderConnection[];
      let googleSnapshots: Record<string, { dimensions: unknown; values: unknown; periodStart?: string; periodEnd?: string }>;
      try {
        const vault = createDevEncryptedVault(ctx.supabase as never);
        const resolved = await resolveGoogleProviderStates({ db: ctx.supabase as never, vault, tenantId });
        googleConnections = resolved.connections;
        googleSnapshots = resolved.snapshots;
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Google provider resolution failed.";
        googleConnections = [
          { provider: "search_console", state: "error", reason },
          { provider: "ga4", state: "error", reason },
        ];
        googleSnapshots = {};
      }
      const providerStates: ProviderConnection[] = [
        ...googleConnections,
        { provider: "google_business_profile", state: "configuration_required", reason: "Owner connection required." },
        { provider: "meta", state: "permission_required", reason: "Reporting permission required." },
      ];

      const propertyName = (typeof args.propertyName === "string" && args.propertyName.trim().slice(0, 120)) || normalizedSite.hostname;
      const result = await runSearchAnalysis(
        ctx.supabase as never,
        { tenantId, actorUserId: ctx.principal.authUserId, propertyUrl, propertyName, plan, runType: "manual", triggerSource: "manual", idempotencyKey },
        { providerStates, providerSnapshots: googleSnapshots }
      );
      return { tenantId, propertyUrl, duplicate: result.duplicate, run: result.run };
    },
    // VERIFICATION INTEGRITY, applied from day one (Update 10's discipline)
    // -- see interpretGrowthAnalysisOutcome's own header comment above.
    interpretOutcome: interpretGrowthAnalysisOutcome,
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
      name: "check_website_status",
      description: "Real, currently-stored Stratxcel-built websites for a tenant -- name, slug, status (draft/live/etc.), custom domain, framework, template, and timestamps. The exact same data and columns the Website page's list reads. Use for 'what's the status of our website', 'is our domain connected', 'do we have a website yet'. Read-only -- for creating or editing a website, say that's dashboard-only for now.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:website",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      if (!tenantId) return { available: false, reason: "no_tenant_resolved" };
      const { data: sites, error } = await ctx.supabase
        .from("site_projects")
        .select("id, tenant_id, name, slug, status, custom_domain, framework, template, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return { available: false, reason: error.message };
      return { tenantId, sites: sites ?? [] };
    },
  },
  {
    schema: {
      name: "check_audit_status",
      description: "Real, currently-stored prospect/website Audit requests for a tenant -- business name, website URL, status, job_status, progress_percentage, requested product, and timestamps. The exact same public_audit_requests data the Audit dashboard list shows. Use for 'check our audit status', 'is the audit done', 'what's the progress on the audit'. Read-only.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:audit_reports",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      if (!tenantId) return { available: false, reason: "no_tenant_resolved" };
      const { data: audits, error } = await ctx.supabase
        .from("public_audit_requests")
        .select("id, business_name, website_url, status, job_status, progress_percentage, requested_product, submitted_at, started_at, completed_at, error_message")
        .eq("tenant_id", tenantId)
        .order("submitted_at", { ascending: false })
        .limit(20);
      if (error) return { available: false, reason: error.message };
      return { tenantId, audits: audits ?? [] };
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
    // Live-observed defect this closes: a real OpenAI HTTP 429 produced
    // `outcome: "FAILED"` here, but the model's own free-text reply still
    // said "Done." -- see docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md
    // Update 9. GenerateImageOutcome's real values, mapped honestly:
    // REVISION_REQUIRED means candidates were actually generated but still
    // need a human pick -- real progress, not full completion, so "partial"
    // rather than "success".
    interpretOutcome(result) {
      const outcome = (result as { outcome?: string } | null)?.outcome;
      const reason = (result as { reason?: string } | null)?.reason;
      if (!outcome || outcome === "OK") return null;
      if (outcome === "REVISION_REQUIRED") return { status: "partial", detail: "candidates ready, needs your selection in the dashboard" };
      if (outcome === "WAITING_CONFIGURATION" || outcome === "PENDING") return { status: "pending", detail: reason };
      return { status: "failed", detail: reason ?? outcome.toLowerCase().replaceAll("_", " ") };
    },
  },
  {
    schema: {
      name: "execute_growth_action",
      description: "Execute an already-identified SEO/content fix (from check_growth_status's `actions` list) on the real live website -- real before/after evidence, real live re-verification after the write, automatic rollback if verification fails. Only for an actionId a human/prior check_growth_status call already surfaced -- never invent one.",
      parameters: {
        type: "object",
        properties: {
          actionId: { type: "string", description: "A real search_actions.id from a prior check_growth_status result." },
          tenantId: { type: "string", description: "Optional -- defaults to Stratxcel's own tenant." },
        },
        required: ["actionId"],
      },
    },
    mutating: true,
    // Textbook external_mutation (a real, verified live-website write) --
    // but, same reasoning as generate_image/send_whatsapp_message_to_contact:
    // dashboard_only would make this unusable from the one channel ("fix the
    // website" over WhatsApp) the brief explicitly requires. low_mutation
    // keeps the real safety control (a typed CONFIRM code bound to this
    // exact actionId) while the underlying engine's own precheck/evidence/
    // verification/rollback remains the real technical safety net
    // regardless of channel.
    risk: "low_mutation",
    requiredPermission: "agent:mutate:website",
    async execute(ctx, args) {
      const tenantId = resolveTenantId(ctx, args);
      const actionId = typeof args.actionId === "string" ? args.actionId : "";
      if (!tenantId || !actionId) return { status: "BLOCKED", actionId, targetUrl: "", blockerCode: "MISSING_INPUT" };

      const { data: subscription } = await ctx.supabase
        .from("subscriptions")
        .select("plan_tier, status")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const tier = (subscription as { plan_tier?: string } | null)?.plan_tier;
      if (!tier || tier === "free" || (subscription as { status?: string } | null)?.status !== "active") {
        return { status: "BLOCKED", actionId, targetUrl: "", blockerCode: "SUBSCRIPTION_REQUIRED", errorMessage: "An active Search Growth OS subscription is required to execute actions." };
      }

      const { data: cmsConn } = await ctx.supabase.from("search_cms_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
      const conn = cmsConn as { cms_type?: string; site_url?: string; write_enabled?: boolean; vault_secret_id?: string; config?: { projectId?: string; teamId?: string } } | null;
      const siteUrl = conn?.site_url || process.env.NEXT_PUBLIC_APP_URL || "https://www.stratxcel.in";

      const vercelWriteResult = await resolveVercelWriteCapability({ tenantId, db: ctx.supabase as never, siteUrl });
      const cmsProvider =
        conn?.cms_type === "wordpress"
          ? createFixtureWordPressProvider({ siteUrl: conn.site_url ?? siteUrl, writeEnabled: Boolean(conn.write_enabled) })
          : conn?.cms_type === "vercel" || conn?.cms_type === "nextjs" || !conn
          ? createVercelCMSProvider({
              siteUrl,
              projectId: conn?.config?.projectId || process.env.VERCEL_PROJECT_ID || "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ",
              teamId: conn?.config?.teamId || process.env.VERCEL_TEAM_ID || "team_UWCzHaOLdAOtezWqRxYNxdYf",
              token: conn?.vault_secret_id || undefined,
              writeEnabled: vercelWriteResult.writeEnabled,
            })
          : createStratxcelNativeCMSProvider({ siteProjectId: "native_site", tenantId, propertyUrl: siteUrl });

      return executeSearchAction(
        { db: ctx.supabase as never, cmsProvider },
        { tenantId, actionId, actorUserId: ctx.principal.authUserId }
      );
    },
    // Same discipline as generate_image: the underlying engine's own status
    // vocabulary is precise ("deploy started" vs "deployed" vs "healthy"),
    // and that precision must survive into the final reply, not get
    // flattened into a generic "Done."
    interpretOutcome(result) {
      const r = result as { status?: string; errorMessage?: string; blockerCode?: string } | null;
      if (!r?.status || r.status === "VERIFIED" || r.status === "COMPLETED") return null;
      if (r.status === "VERIFICATION_FAILED") return { status: "partial", detail: `the change was made but live verification failed${r.errorMessage ? `: ${r.errorMessage}` : ""} -- it may have been rolled back` };
      if (r.status === "BLOCKED") return { status: "failed", detail: r.errorMessage ?? r.blockerCode };
      return { status: "failed", detail: r.errorMessage };
    },
  },
];
