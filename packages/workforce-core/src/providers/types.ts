import type { CapabilityKey } from "../capabilities/types.ts";

export type ProviderImplementationStatus =
  | "IMPLEMENTED"
  | "NOT_CONFIGURED"
  | "DISABLED"
  | "UNAVAILABLE";

export type ProviderErrorCategory =
  | "TRANSIENT"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "AUTH_CONFIGURATION"
  | "QUOTA"
  | "POLICY_BLOCK"
  | "INVALID_INPUT"
  | "UNSUPPORTED"
  | "PROVIDER_FAILURE"
  | "INTERNAL_FAILURE";

export interface ProviderUsageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  generatedImages?: number;
  generatedSeconds?: number;
  requests?: number;
  providerReportedCost?: number | null;
  currency?: string | null;
  /** Unknown means unknown — never invent cost. */
  costKnown: boolean;
}

export interface ProviderReadinessProbeResult {
  ready: boolean;
  status: ProviderImplementationStatus;
  reasonCode: string;
  details?: string;
}

/**
 * Trusted authorization derived by requestCapability after central readiness.
 * NEVER sourced from request.input / model / tool payload.
 */
export interface ProviderTrustedAuthorization {
  approvalGranted: boolean;
  standingAuthorizationGranted: boolean;
  authorizationKind: string | null;
  authorizationCapability: string | null;
  authorizationScopeId: string | null;
  shadowMode: boolean;
  killSwitchActive: boolean;
  /** Workforce automation is never a human actor. */
  actorKind: "workforce" | "system";
}

export interface ProviderExecuteInput {
  requestId: string;
  tenantId: string;
  missionId: string;
  capability: CapabilityKey | string;
  inputArtifactIds: readonly string[];
  input?: Record<string, unknown>;
  /** Present on production requestCapability path after readiness passes. */
  authorization?: ProviderTrustedAuthorization;
}

export interface ProviderExecuteResult {
  ok: boolean;
  providerKey: string;
  providerReference?: string;
  outputArtifactIds?: readonly string[];
  usage?: ProviderUsageMetadata;
  receipt?: Record<string, unknown>;
  errorCategory?: ProviderErrorCategory;
  errorMessage?: string;
  /**
   * Non-terminal outcomes (async publish still queued).
   * When omitted and ok=true, requestCapability treats as SUCCEEDED.
   */
  executionStatus?: "SUCCEEDED" | "QUEUED" | "IN_PROGRESS" | "FAILED";
}

export interface CapabilityProvider {
  key: string;
  capabilityKeys: readonly CapabilityKey[];
  status: ProviderImplementationStatus;
  /** Safe non-mutating readiness probe. */
  probeReadiness: (ctx: {
    tenantId: string;
    capability: CapabilityKey | string;
  }) => Promise<ProviderReadinessProbeResult> | ProviderReadinessProbeResult;
  execute: (input: ProviderExecuteInput) => Promise<ProviderExecuteResult>;
}

export function unknownCostUsage(partial: Omit<ProviderUsageMetadata, "costKnown"> = {}): ProviderUsageMetadata {
  return {
    ...partial,
    providerReportedCost: partial.providerReportedCost ?? null,
    currency: partial.currency ?? null,
    costKnown: false,
  };
}

export function knownCostUsage(
  partial: Omit<ProviderUsageMetadata, "costKnown"> & {
    providerReportedCost: number;
    currency: string;
  },
): ProviderUsageMetadata {
  return {
    ...partial,
    costKnown: true,
  };
}

export function isRetryableProviderError(category: ProviderErrorCategory | undefined): boolean {
  return category === "TRANSIENT" || category === "TIMEOUT" || category === "RATE_LIMIT";
}

export function allowsFailover(category: ProviderErrorCategory | undefined): boolean {
  // Policy / auth failures must not be bypassed by hopping providers.
  if (!category) return false;
  if (category === "POLICY_BLOCK" || category === "AUTH_CONFIGURATION" || category === "INVALID_INPUT") {
    return false;
  }
  return isRetryableProviderError(category) || category === "PROVIDER_FAILURE" || category === "QUOTA";
}
