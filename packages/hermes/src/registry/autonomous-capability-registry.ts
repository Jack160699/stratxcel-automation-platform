/**
 * Machine-Readable Autonomous Company Capability Registry
 * StratXcel Automation Platform — Hermes Core OS
 *
 * Queryable registry of verified, executable, and constrained capabilities.
 * Hermes can query this directly: "What tools do I actually have for this objective?"
 */

import registryData from "./autonomous-capability-registry.json" with { type: "json" };

export type AccessType =
  | "A_CONNECTED_AND_VERIFIED"
  | "B_CONNECTED_AND_NOT_VERIFIED"
  | "C_AVAILABLE_BUT_NOT_CONNECTED"
  | "D_CONNECTED_BUT_MISSING_REQUIRED_PERMISSION"
  | "E_REQUIRES_MANUAL_CREDENTIAL"
  | "F_REQUIRES_EXTERNAL_ACCOUNT_AND_BILLING"
  | "G_NOT_AVAILABLE";

export interface CapabilityEntry {
  capability_name: string;
  category: string;
  description: string;
  provider: string;
  access_method: "mcp" | "api" | "cli" | "browser_cdp" | "native" | "oauth";
  mcp_server: string | null;
  transport: string;
  environment: string;
  authentication: string;
  permissions: string[];
  status: AccessType;
  verification_status: string;
  verification_evidence: string;
  allowed_actions: string[];
  restricted_actions: string[];
  dependencies: string[];
  cost: string;
  rate_limits: string;
  tenant_scope: "PLATFORM" | "COMPANY" | "BOTH";
  fallbacks: string[];
}

export interface CapabilityRegistry {
  version: string;
  generated_at: string;
  mission: string;
  tenant_id: string;
  tenant_name: string;
  operating_status: string;
  capabilities: CapabilityEntry[];
}

export const CAPABILITY_REGISTRY: CapabilityRegistry = registryData as CapabilityRegistry;

/**
 * Hermes helper: Query capabilities by category or objective keyword.
 */
export function queryHermesCapabilities(query: {
  category?: string;
  action?: string;
  onlyVerified?: boolean;
}): CapabilityEntry[] {
  return CAPABILITY_REGISTRY.capabilities.filter((cap) => {
    if (query.onlyVerified && cap.status !== "A_CONNECTED_AND_VERIFIED") {
      return false;
    }
    if (query.category && cap.category.toLowerCase() !== query.category.toLowerCase()) {
      return false;
    }
    if (query.action && !cap.allowed_actions.includes(query.action) && !cap.capability_name.includes(query.action)) {
      return false;
    }
    return true;
  });
}

/**
 * Returns executable tools for an objective.
 */
export function getExecutableCapabilitiesForObjective(objectiveText: string): {
  verified: CapabilityEntry[];
  blocked: CapabilityEntry[];
} {
  const verified: CapabilityEntry[] = [];
  const blocked: CapabilityEntry[] = [];

  for (const cap of CAPABILITY_REGISTRY.capabilities) {
    if (cap.status === "A_CONNECTED_AND_VERIFIED") {
      verified.push(cap);
    } else {
      blocked.push(cap);
    }
  }

  return { verified, blocked };
}
