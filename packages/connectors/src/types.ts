/**
 * The Personal Connector / Capability Control Plane type vocabulary.
 * Single control plane for Founder-owned and company-scoped external integrations
 * powering Hermes execution, Admin governance, and chat interfaces (WhatsApp, Telegram, Web).
 */

export type ConnectorAuthMethod = "api_key" | "oauth" | "service_credential" | "mcp_managed" | "cli";

export type ConnectorCategory = "infrastructure" | "ai" | "messaging" | "social" | "data" | "automation" | "finance" | "browser_computer";

export type ConnectorScopeLevel = "platform" | "company" | "both";

export type ConnectorAccessMethod = "native" | "mcp" | "api" | "cli" | "browser";

export type ConnectorHealthStatus =
  | "pending"
  | "connected"
  | "healthy"
  | "auth_expired"
  | "rate_limited"
  | "quota_exhausted"
  | "error"
  | "disabled"
  | "requires_reauth"
  | "not_configured"
  | "degraded"
  | "auth_required"
  | "disconnected";

export type ConnectorAutonomy = "read" | "prepare" | "execute" | "approval_required" | "disabled";

export type ConnectorAuditEventType =
  | "connected"
  | "authenticated"
  | "verified"
  | "capability_discovered"
  | "permission_changed"
  | "scope_changed"
  | "enabled"
  | "disabled"
  | "disconnected"
  | "reconnected"
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "authorization_denied"
  | "google_account_connected"
  | "google_account_verified"
  | "ai_pro_entitlement_verified"
  | "antigravity_verified"
  | "image_capability_verified"
  | "video_capability_verified"
  | "drive_access_verified"
  | "cloud_access_verified"
  | "quota_exceeded"
  // Founder Computer events
  | "browser_started"
  | "viewer_opened"
  | "viewer_closed"
  | "manual_auth_started"
  | "session_verified"
  | "session_authenticated"
  | "session_expired"
  | "browser_restarted"
  | "navigation"
  | "download"
  | "upload"
  | "click"
  | "type"
  | "screenshot";

export type GoogleAiProEntitlementStatus =
  | "unverified"
  | "active"
  | "expired"
  | "not_entitled"
  | "quota_limited";

export interface GoogleAiProAccountMetadata {
  email?: string;
  name?: string;
  picture?: string;
  entitlementStatus: GoogleAiProEntitlementStatus;
  subscriptionTier?: string;
  antigravityAvailable?: boolean;
  imageGenerationAvailable?: boolean;
  videoGenerationAvailable?: boolean;
  driveAvailable?: boolean;
  cloudAvailable?: boolean;
  julesAvailable?: boolean;
  aiCreditsRemaining?: number;
  lastVerifiedAt?: string;
  verifiedServices?: string[];
}

export interface ConnectorCapabilityMetadata {
  key: string;
  label: string;
  description?: string;
  accessMethods: ConnectorAccessMethod[];
  riskLevel: "low" | "medium" | "high";
  readWrite: "read" | "write" | "admin";
}

/** Static catalogue entry -- what a connector TYPE could offer. */
export interface ConnectorDefinition {
  key: string;
  label: string;
  category: ConnectorCategory;
  authMethod: ConnectorAuthMethod;
  scopeLevel: ConnectorScopeLevel;
  declaredCapabilities: string[];
  description: string;
  realStatusSource: string;
  requiredEnvVars: string[];
  supportedAccessMethods: ConnectorAccessMethod[];
  preferredAccessMethod: ConnectorAccessMethod;
}

/** Session status for the Founder Computer browser resource. */
export type FounderComputerSessionStatus =
  | "not_configured"
  | "auth_required"
  | "connected"
  | "ready"
  | "degraded"
  | "expired"
  | "disconnected";

/** Classification of a single discovered capability on the Founder Computer. */
export type FounderComputerCapabilityStatus =
  | "available"
  | "requires_auth"
  | "available_with_confirmation"
  | "unavailable"
  | "error";

export interface FounderComputerCapabilityEntry {
  service: string;        // e.g. "Google Gemini", "Google Drive", "Antigravity"
  capability: string;     // e.g. "gemini.chat", "drive.upload"
  status: FounderComputerCapabilityStatus;
  accessMethod: "api" | "browser" | "desktop" | "manual_confirmation";
  note?: string;          // Human-readable explanation
}

export interface ConnectorConnectionRow {
  id: string;
  connector_key: string;
  /** null = platform-level connection (Founder-owned); non-null = company-scoped connection. */
  tenant_id: string | null;
  status: ConnectorHealthStatus;
  encrypted_secret_ref: string | null;
  discovered_capabilities: string[];
  last_health_check_at: string | null;
  last_verified_at: string | null;
  discovered_at: string | null;
  last_error: string | null;
  connected_by_user_id: string | null;
  connected_at: string | null;
  metadata: Record<string, unknown>;
  budget_limit_usd: number | null;
  current_usage_usd: number;
  rate_limit_per_minute: number | null;
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
  budget_limit_usd: number | null;
  current_usage_usd: number;
  allowed_methods: ConnectorAccessMethod[] | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectorAuditLogRow {
  id: string;
  connector_key: string;
  connection_id: string | null;
  tenant_id: string | null;
  actor_kind: "founder" | "hermes" | "admin" | "system";
  actor_id: string | null;
  event_type: ConnectorAuditEventType;
  capability_key: string | null;
  execution_method: ConnectorAccessMethod | null;
  status: "success" | "failure" | "denied";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConnectorHealthResult {
  status: ConnectorHealthStatus;
  discoveredCapabilities: string[];
  lastError: string | null;
  lastVerifiedAt?: string | null;
  details?: Record<string, unknown>;
}

export type ConnectorAuthorizationResult =
  | {
      authorized: true;
      autonomy: ConnectorAutonomy;
      effectiveMethod: ConnectorAccessMethod;
      connectionId: string;
      assignmentId?: string;
    }
  | {
      authorized: false;
      reason: string;
      errorCode?: string;
    };
