import type { ConnectorDefinition } from "./types.ts";

/**
 * Static catalogue, mirrored into connector_definitions by
 * supabase/migrations/20260907180000_connector_capability_control_plane.sql
 * (kept in sync by hand -- same convention as
 * apps/hermes-gateway/src/mcp-server.ts's TOOL_DESCRIPTIONS map, and as
 * @stratxcel/byok's own PROVIDER_REGISTRY). The DB table exists so the
 * Admin UI/staff tools can read it without importing this package's code
 * across the Next.js/package boundary; this in-code copy is what
 * health.ts and the admin API routes actually reason against, so both are
 * real, neither is decorative.
 */
export const CONNECTOR_REGISTRY: readonly ConnectorDefinition[] = [
  {
    key: "aws",
    label: "AWS",
    category: "infrastructure",
    authMethod: "mcp_managed",
    scopeLevel: "platform",
    declaredCapabilities: ["infrastructure.inspect", "infrastructure.deploy_verify"],
    description:
      "StratXcel's own AWS infrastructure (the mission-worker EC2 host). Operated through this engineering environment's own AWS access today -- no product-stored credential. Health is real worker-heartbeat data, never fabricated.",
    realStatusSource: "@stratxcel/queue getWorkerHealth() against worker_heartbeats, aggregated across mission-worker/whatsapp-worker/hermes-gateway",
    requiredEnvVars: [],
  },
  {
    key: "github",
    label: "GitHub",
    category: "infrastructure",
    authMethod: "service_credential",
    scopeLevel: "platform",
    declaredCapabilities: ["infrastructure.repo_read"],
    description:
      "StratXcel's own source repository. A platform-level fine-grained PAT can be connected here for a real, live GitHub API health check; until then this connector is honestly pending, not fabricated as connected.",
    realStatusSource: "GET https://api.github.com/user with the vaulted PAT, when one is connected",
    requiredEnvVars: [],
  },
  {
    key: "supabase",
    label: "Supabase",
    category: "data",
    authMethod: "service_credential",
    scopeLevel: "platform",
    declaredCapabilities: ["data.inspect"],
    description:
      "StratXcel's own Postgres/Supabase project. Operated through this engineering environment's own Supabase access today -- no product-stored credential. A platform-level token can be connected for presence-based status; this connector does not live-probe the Supabase Management API in v1, and says so honestly rather than claim a health state it cannot verify.",
    realStatusSource: "presence of a vaulted platform-level token only (no live probe in v1)",
    requiredEnvVars: [],
  },
  {
    key: "vercel",
    label: "Vercel",
    category: "infrastructure",
    authMethod: "api_key",
    scopeLevel: "both",
    declaredCapabilities: ["website.deploy_status", "website.domain_status"],
    description:
      "Website hosting/deployment. Company-scoped connections are NOT stored here -- they read the real, already-live search_website_connections table (a tenant's own Vercel Personal Access Token, connected via the Website Factory's own flow) so there is exactly one place a tenant's Vercel token ever lives. A platform-level connection (StratXcel's own Vercel account) can be stored here directly and is health-checked with the real validateVercelToken function.",
    realStatusSource: "company-scoped: search_website_connections (read-only adapter); platform-scoped: validateVercelToken() against a vaulted platform token",
    requiredEnvVars: [],
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    category: "messaging",
    authMethod: "oauth",
    scopeLevel: "company",
    declaredCapabilities: ["messaging.send", "messaging.receive"],
    description:
      "WhatsApp Cloud API messaging for a company. NOT stored here -- reads the real, already-live phone_bindings table (connected via the existing Admin > Integrations WhatsApp flow) so a tenant's WhatsApp credential lives in exactly one place.",
    realStatusSource: "phone_bindings.status, read-only adapter",
    requiredEnvVars: [],
  },
  {
    key: "meta",
    label: "Meta (Facebook/Instagram)",
    category: "social",
    authMethod: "oauth",
    scopeLevel: "company",
    declaredCapabilities: ["messaging.send", "messaging.receive"],
    description:
      "Meta's WhatsApp Business Cloud API messaging surface -- health tracks the SAME underlying connection as whatsapp (both are the one real Meta Cloud API binding a tenant has). Deliberately does NOT yet cover Instagram/Facebook social POSTING, which is a real, separate, already-live system (lib/social/repositories/accounts.ts's social_accounts table, driving the onboarding ConnectorSheet flow) -- not wired into this control plane in v1 because social_accounts scopes by owner_id, whose exact relationship to tenant_id needs confirming before this reads across it (a genuine, precisely-scoped future item, not silently skipped).",
    realStatusSource: "phone_bindings.status, read-only adapter (same signal as whatsapp) -- Instagram/Facebook posting status is a separate, not-yet-wired future item",
    requiredEnvVars: [],
  },
  {
    key: "google_workspace",
    label: "Google Workspace",
    category: "data",
    authMethod: "oauth",
    scopeLevel: "company",
    declaredCapabilities: ["analytics.read", "search_console.read"],
    description:
      "A company's own Google OAuth for Search Console + GA4. NOT stored here -- reads the real, already-live search_google_connections table (the Search & Discovery engine's own OAuth flow) so a tenant's Google credential lives in exactly one place.",
    realStatusSource: "search_google_connections.status, read-only adapter",
    requiredEnvVars: [],
  },
  {
    key: "gemini",
    label: "Gemini (Google AI)",
    category: "ai",
    authMethod: "api_key",
    scopeLevel: "platform",
    declaredCapabilities: ["media.image_generation", "media.video_generation", "ai.text"],
    description:
      "Google AI Studio/Gemini API for AI generation -- a platform-level key (GEMINI_API_KEY), the same one @stratxcel/ai-runtime's Google provider already uses. Health is the real, already-live probeGeminiReadiness() live HTTP check, reused unmodified. Stated honestly: connecting a key here vaults it and health-checks it for real, but does NOT yet override the runtime GEMINI_API_KEY env var used for actual AI calls -- @stratxcel/ai-runtime cannot depend on @stratxcel/connectors without a circular workspace dependency (connectors already depends on ai-runtime for its readiness probes), so wiring the vaulted key into real inference calls needs a composition-root resolver (ai-runtime's factory already supports dependency injection via deps.openrouter/deps.google -- see factory.ts -- so this is a real, well-scoped, not-yet-done future task, not a duplicate path).",
    realStatusSource: "@stratxcel/ai-runtime probeGeminiReadiness() live check against GEMINI_API_KEY",
    requiredEnvVars: ["GEMINI_API_KEY"],
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    category: "ai",
    authMethod: "api_key",
    scopeLevel: "platform",
    declaredCapabilities: ["ai.text_escalation"],
    description:
      "OpenRouter as an opt-in AI resource pool (built earlier this session, Update 71) -- a platform-level key. Health is the real, already-live probeOpenRouterReadiness() live HTTP check, reused unmodified. Stated honestly: connecting a key here vaults it and health-checks it for real, but does NOT yet override the runtime OPENROUTER_API_KEY env var used for actual AI calls -- @stratxcel/ai-runtime cannot depend on @stratxcel/connectors without a circular workspace dependency, so wiring the vaulted key into real inference calls needs a composition-root resolver (ai-runtime's factory already supports dependency injection via deps.openrouter -- see factory.ts -- so this is a real, well-scoped, not-yet-done future task).",
    realStatusSource: "@stratxcel/ai-runtime probeOpenRouterReadiness() live check",
    requiredEnvVars: ["OPENROUTER_API_KEY", "OPENROUTER_ENABLED"],
  },
  {
    key: "browser",
    label: "Browser / Computer",
    category: "automation",
    authMethod: "mcp_managed",
    scopeLevel: "platform",
    declaredCapabilities: [],
    description:
      "Browser/computer-use automation for Hermes missions. Declared honestly as NOT YET a real Hermes-callable capability -- no browser tool exists in Hermes' restricted ToolName union today. This row exists so the control plane's own completeness is honest (a real, named future BUILD item) rather than silently absent.",
    realStatusSource: "none -- no real Hermes execution path exists yet; status is always pending",
    requiredEnvVars: [],
  },
] as const;

export function getConnectorDefinition(key: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.key === key);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return [...CONNECTOR_REGISTRY];
}
