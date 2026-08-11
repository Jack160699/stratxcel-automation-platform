/**
 * Deterministic machine-readable capability readiness / execution reason codes.
 * Keep the set small — prefer reusing over inventing synonyms.
 */
export const CAPABILITY_REASON_CODES = [
  "READY",
  "IMPLEMENTATION_PLANNED",
  "IMPLEMENTATION_UNAVAILABLE",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_DISABLED",
  "FEATURE_FLAG_DISABLED",
  "INTEGRATION_NOT_CONNECTED",
  "TENANT_BINDING_MISSING",
  "ENTITLEMENT_MISSING",
  "ENTITLEMENT_EXHAUSTED",
  "ENTITLEMENT_PAUSED",
  "APPROVAL_REQUIRED",
  "STANDING_AUTH_REQUIRED",
  "SHADOW_BLOCKED",
  "KILL_SWITCH_ACTIVE",
  "MISSING_REQUIRED_ARTIFACT",
  "ARTIFACT_UNKNOWN",
  "ARTIFACT_TENANT_MISMATCH",
  "ARTIFACT_KIND_UNSUPPORTED",
  "ARTIFACT_MISSION_MISMATCH",
  "ARTIFACT_STATUS_INVALID",
  "ARTIFACT_VERSION_MISMATCH",
  "BUDGET_EXHAUSTED",
  "UNSUPPORTED_PLATFORM",
  "SETUP_REQUIRED",
  "UNKNOWN_CAPABILITY",
  "POLICY_BLOCK",
  "TECHNICALLY_READY_AWAITING_MUTATION_POLICY",
] as const;

export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number];

export function isCapabilityReasonCode(value: string): value is CapabilityReasonCode {
  return (CAPABILITY_REASON_CODES as readonly string[]).includes(value);
}

export function humanReasonForCode(code: CapabilityReasonCode): string {
  switch (code) {
    case "READY":
      return "Capability is ready to execute under current policy.";
    case "IMPLEMENTATION_PLANNED":
      return "Capability is planned; no end-to-end execution path exists yet.";
    case "IMPLEMENTATION_UNAVAILABLE":
      return "Capability is intentionally unavailable in the current product state.";
    case "PROVIDER_NOT_CONFIGURED":
      return "Required provider or credentials are not configured.";
    case "PROVIDER_DISABLED":
      return "Provider is disabled by platform configuration.";
    case "FEATURE_FLAG_DISABLED":
      return "Required feature flag is disabled.";
    case "INTEGRATION_NOT_CONNECTED":
      return "Required tenant integration is not connected.";
    case "TENANT_BINDING_MISSING":
      return "Trusted tenant binding is missing.";
    case "ENTITLEMENT_MISSING":
      return "Required commercial entitlement is not present.";
    case "ENTITLEMENT_EXHAUSTED":
      return "Entitlement usage is exhausted.";
    case "ENTITLEMENT_PAUSED":
      return "Entitlement is paused.";
    case "APPROVAL_REQUIRED":
      return "Deterministic approval is required before execution.";
    case "STANDING_AUTH_REQUIRED":
      return "Standing package authorization is required.";
    case "SHADOW_BLOCKED":
      return "Shadow mode blocks external mutation.";
    case "KILL_SWITCH_ACTIVE":
      return "Kill switch is active for this scope.";
    case "MISSING_REQUIRED_ARTIFACT":
      return "Required input artifact is missing.";
    case "ARTIFACT_UNKNOWN":
      return "Input artifact could not be resolved.";
    case "ARTIFACT_TENANT_MISMATCH":
      return "Input artifact belongs to a different tenant.";
    case "ARTIFACT_KIND_UNSUPPORTED":
      return "Input artifact kind is not supported for this capability.";
    case "ARTIFACT_MISSION_MISMATCH":
      return "Input artifact belongs to a different mission without trusted reuse authorization.";
    case "ARTIFACT_STATUS_INVALID":
      return "Input artifact status is not valid for this capability.";
    case "ARTIFACT_VERSION_MISMATCH":
      return "Resolved artifact version does not match the authorized version.";
    case "BUDGET_EXHAUSTED":
      return "Capability budget envelope is exhausted or insufficient.";
    case "UNSUPPORTED_PLATFORM":
      return "Requested platform is unsupported for this capability.";
    case "SETUP_REQUIRED":
      return "Additional setup is required before execution.";
    case "UNKNOWN_CAPABILITY":
      return "Unknown capability key.";
    case "POLICY_BLOCK":
      return "Execution blocked by deterministic policy.";
    case "TECHNICALLY_READY_AWAITING_MUTATION_POLICY":
      return "Implementation and integrations are ready; mutation policy still applies.";
    default: {
      const _exhaustive: never = code;
      return String(_exhaustive);
    }
  }
}
