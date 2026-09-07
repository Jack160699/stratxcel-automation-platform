/**
 * The Connector/Capability Control Plane's own type vocabulary. Deliberately
 * separate from @stratxcel/byok's ProviderCapabilities/BillingMode (tenant
 * BYOK AI-key billing) and from lib/owner-brain's SourceKey (Founder-personal
 * data ingestion) -- this layer is platform-and-company-scoped infrastructure
 * and business-capability governance for HERMES' OWN EXECUTION, a third,
 * genuinely distinct concern. Where a real capability already has a home
 * (workforce-core's CapabilityKey, ai-runtime's AIProviderId), this layer
 * references those keys as plain strings rather than re-declaring a
 * competing enum -- see registry.ts's own comments per connector.
 */

/** How a connector authenticates. mcp_managed = no secret StratXcel itself
 * stores; the connection is operated through this engineering environment's
 * own MCP/CLI access (AWS, GitHub, Vercel, Supabase today), and its health
 * here reflects real platform signals (worker heartbeats, deployment APIs),
 * never a fabricated "connected". */
export type ConnectorAuthMethod = "api_key" | "oauth" | "service_credential" | "mcp_managed";

export type ConnectorCategory = "infrastructure" | "ai" | "messaging" | "social" | "data" | "automation";

export type ConnectorScopeLevel = "platform" | "company" | "both";

export type ConnectorHealthStatus =
  | "pending"
  | "connected"
  | "healthy"
  | "auth_expired"
  | "rate_limited"
  | "quota_exhausted"
  | "error"
  | "disabled"
  | "requires_reauth";

export type ConnectorAutonomy = "read" | "prepare" | "execute" | "approval_required" | "disabled";

/** Static catalogue entry -- what a connector TYPE could, in principle, offer.
 * Never asserts anything is actually connected; see ConnectorConnectionRow
 * for real per-instance state. */
export interface ConnectorDefinition {
  key: string;
  label: string;
  category: ConnectorCategory;
  authMethod: ConnectorAuthMethod;
  scopeLevel: ConnectorScopeLevel;
  /** Capabilities this connector type could offer once connected+discovered.
   * A DECLARATION, not a promise -- discoverConnectorCapabilities() reports
   * what a real connection instance actually has. */
  declaredCapabilities: string[];
  description: string;
  /** Where this connector's real health/status signal actually comes from
   * today -- documents the reuse, never a second parallel status source. */
  realStatusSource: string;
  /** Env vars this connector's api_key/mcp_managed path depends on, so the
   * admin UI can say honestly why a connect attempt would fail. Empty for
   * oauth connectors (state lives in DB, not env). */
  requiredEnvVars: string[];
}

export interface ConnectorConnectionRow {
  id: string;
  connector_key: string;
  /** null = platform-level connection (e.g. StratXcel's own AWS/Supabase/Vercel/GitHub). */
  tenant_id: string | null;
  status: ConnectorHealthStatus;
  encrypted_secret_ref: string | null;
  discovered_capabilities: string[];
  last_health_check_at: string | null;
  last_error: string | null;
  connected_by_user_id: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectorCapabilityAssignmentRow {
  id: string;
  connection_id: string;
  capability_key: string;
  tenant_id: string | null;
  department: string | null;
  agent_definition_id: string | null;
  autonomy: ConnectorAutonomy;
  created_at: string;
  updated_at: string;
}
