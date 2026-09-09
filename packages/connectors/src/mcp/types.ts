/**
 * Canonical Master MCP Infrastructure Types
 * StratXcel Automation Platform
 */

export type McpTransport = "stdio" | "streamable_http" | "sse" | "websocket";

export type McpExecutionEnvironment =
  | "windows"
  | "aws_linux"
  | "remote"
  | "multi_environment";

export type McpInstallationMethod =
  | "npx"
  | "npm_global"
  | "binary"
  | "docker"
  | "built_in"
  | "remote_endpoint";

export type McpAuthenticationType =
  | "token"
  | "bearer"
  | "oauth"
  | "browser_session"
  | "cli_profile"
  | "none";

export type McpClassification =
  | "official"
  | "community"
  | "custom_stratxcel"
  | "direct_api_fallback"
  | "no_native_mcp";

export type McpStatus =
  | "discovered"
  | "installed"
  | "configured"
  | "auth_required"
  | "authorized"
  | "healthy"
  | "degraded"
  | "broken"
  | "unavailable";

export type McpRiskLevel = "read_only" | "low" | "medium" | "high" | "destructive";

export type McpConfirmationPolicy = "autonomous" | "confirmation_required" | "strictly_blocked";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: McpRiskLevel;
  confirmationPolicy: McpConfirmationPolicy;
  requiredPermissions: string[];
}

export interface McpFallbackDefinition {
  preferredFallbackType: "native_connector" | "direct_api" | "cli" | "browser_session" | "none";
  targetConnectorKey?: string;
  description: string;
}

export interface McpServerDefinition {
  mcpId: string;
  provider: string;
  serverName: string;
  version: string;
  classification: McpClassification;
  transport: McpTransport;
  executionEnvironment: McpExecutionEnvironment;
  installationMethod: McpInstallationMethod;
  command?: string;
  args?: string[];
  endpointUrl?: string;
  authenticationType: McpAuthenticationType;
  envVarReferences: string[];
  declaredCapabilities: string[];
  supportedTools: McpToolDefinition[];
  riskLevel: McpRiskLevel;
  confirmationPolicy: McpConfirmationPolicy;
  status: McpStatus;
  fallback: McpFallbackDefinition;
  adminVisibility: boolean;
  description: string;
}

export interface ProviderArchitectureMapping {
  provider: string;
  serviceApi: {
    available: boolean;
    type: string;
    details: string;
  };
  cli: {
    available: boolean;
    command: string;
    details: string;
  };
  mcp: {
    available: boolean;
    mcpId?: string;
    classification: McpClassification;
    details: string;
  };
  browser: {
    available: boolean;
    sessionType: string;
    details: string;
  };
  primaryExecutionEnvironment: McpExecutionEnvironment;
  notes: string;
}

export interface McpAuthorizationInput {
  mcpId: string;
  toolName: string;
  tenantId: string | null;
  actorKind: "founder" | "hermes" | "admin" | "system";
  actorId?: string | null;
  missionId?: string | null;
  department?: string | null;
  confirmedByFounder?: boolean;
}

export interface McpAuthorizationResult {
  authorized: boolean;
  requiresConfirmation: boolean;
  status: "AUTHORIZED" | "CONFIRMATION_REQUIRED" | "DENIED" | "AUTH_REQUIRED";
  reason: string;
  fallback?: McpFallbackDefinition;
  auditMetadata?: Record<string, unknown>;
}

export interface McpToolAuditRecord {
  id: string;
  mcpId: string;
  provider: string;
  toolName: string;
  environment: McpExecutionEnvironment;
  actorKind: string;
  actorId: string | null;
  tenantId: string | null;
  missionId: string | null;
  status: "success" | "failure" | "denied" | "confirmation_required";
  confirmationReceived: boolean;
  durationMs: number;
  timestampIso: string;
  error?: string | null;
}
