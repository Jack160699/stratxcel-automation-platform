import {
  humanReasonForCode,
  type CapabilityReasonCode,
} from "./reason-codes.ts";
import { assertCapability, getCapability } from "./registry.ts";
import {
  CAPABILITY_KEYS,
  isNonExecutableStatus,
  type CapabilityDefinition,
  type CapabilityKey,
  type CapabilityStatus,
  type EntitlementMetric,
  type RuntimeReadiness,
} from "./types.ts";

export interface CapabilityEntitlementView {
  tenantId: string;
  metrics: Partial<Record<EntitlementMetric, number>> & Record<string, number>;
  remaining?: Partial<Record<EntitlementMetric, number>> & Record<string, number>;
  pausedMetrics?: readonly string[];
}

export interface CapabilityIntegrationView {
  tenantId: string;
  /** Connected integration keys for THIS tenant only. */
  connected: readonly string[];
}

export interface CapabilityEnvironmentView {
  featureFlags?: Record<string, boolean>;
  providersConfigured?: readonly string[];
  providersDisabled?: readonly string[];
}

export interface CapabilityAuthorizationView {
  /** Deterministic approval already granted for this mutation. */
  approvalGranted?: boolean;
  /** Standing package authorization (deterministic policy only). */
  standingAuthorizationGranted?: boolean;
  /** Shadow mode blocks external mutation when true. */
  shadowMode?: boolean;
  /** Kill switch active for this capability/scope. */
  killSwitchActive?: boolean;
}

export interface CapabilityReadinessInput {
  capabilityKey: string;
  /** Trusted runtime tenant — never model-supplied identity as authority. */
  trustedTenantId: string | null | undefined;
  missionId?: string;
  ownerId?: string;
  entitlementSnapshot?: CapabilityEntitlementView | null;
  integrationSnapshot?: CapabilityIntegrationView | null;
  environment?: CapabilityEnvironmentView | null;
  authorization?: CapabilityAuthorizationView | null;
  /** plan = advisory; execute = hard gates. */
  requestedOperation?: "plan" | "prepare" | "execute";
  /**
   * Planner / CEO snapshots must never authorize execution.
   * When true, readiness fails closed for execute operations.
   */
  fromPlannerSnapshot?: boolean;
  requiredInputArtifactsPresent?: boolean;
}

export interface CapabilityReadinessResult {
  key: CapabilityKey | string;
  implementationStatus: CapabilityStatus | "UNKNOWN";
  readiness: RuntimeReadiness;
  executable: boolean;
  reasonCode: CapabilityReasonCode;
  humanReason: string;
  externalMutation: boolean;
  riskLevel: CapabilityDefinition["riskLevel"] | "critical";
  approvalRequired: boolean;
  entitlementRequired: EntitlementMetric | null;
  entitlementSatisfied: boolean | null;
  integrationRequirements: readonly string[];
  missingRequirements: readonly string[];
  providerKeys: readonly string[];
  evaluatedAt: string;
}

function result(
  partial: Omit<CapabilityReadinessResult, "humanReason" | "evaluatedAt"> & {
    humanReason?: string;
    evaluatedAt?: string;
  },
): CapabilityReadinessResult {
  return {
    ...partial,
    humanReason: partial.humanReason ?? humanReasonForCode(partial.reasonCode),
    evaluatedAt: partial.evaluatedAt ?? new Date().toISOString(),
  };
}

function blockedFromDefinition(
  def: CapabilityDefinition,
  overrides: Partial<CapabilityReadinessResult> &
    Pick<CapabilityReadinessResult, "readiness" | "reasonCode" | "executable">,
): CapabilityReadinessResult {
  return result({
    key: def.key,
    implementationStatus: def.status,
    externalMutation: def.externalMutation,
    riskLevel: def.riskLevel,
    approvalRequired: def.approvalRequired,
    entitlementRequired: def.requiredEntitlementClass,
    entitlementSatisfied: null,
    integrationRequirements: def.integrationRequirements,
    missingRequirements: [],
    providerKeys: def.providerKeys,
    ...overrides,
  });
}

/**
 * Canonical capability readiness resolver.
 * Fail closed. No AI/model output may override this decision.
 * Planner snapshots never authorize execution.
 */
export function resolveCapabilityReadiness(input: CapabilityReadinessInput): CapabilityReadinessResult {
  const op = input.requestedOperation ?? "execute";
  const def = getCapability(input.capabilityKey);

  if (!def) {
    return result({
      key: input.capabilityKey,
      implementationStatus: "UNKNOWN",
      readiness: "BLOCKED",
      executable: false,
      reasonCode: "UNKNOWN_CAPABILITY",
      externalMutation: false,
      riskLevel: "critical",
      approvalRequired: true,
      entitlementRequired: null,
      entitlementSatisfied: null,
      integrationRequirements: [],
      missingRequirements: ["known_capability"],
      providerKeys: [],
    });
  }

  if (op === "execute" && input.fromPlannerSnapshot) {
    return blockedFromDefinition(def, {
      readiness: "BLOCKED",
      executable: false,
      reasonCode: "POLICY_BLOCK",
      humanReason: "Planner capability snapshots never authorize execution; revalidate at request time.",
      missingRequirements: ["execution_revalidation"],
    });
  }

  if (def.status === "PLANNED") {
    return blockedFromDefinition(def, {
      readiness: "NOT_READY",
      executable: false,
      reasonCode: "IMPLEMENTATION_PLANNED",
      missingRequirements: ["implementation"],
    });
  }

  if (def.status === "UNAVAILABLE") {
    return blockedFromDefinition(def, {
      readiness: "BLOCKED",
      executable: false,
      reasonCode: "IMPLEMENTATION_UNAVAILABLE",
      missingRequirements: ["supported_implementation"],
    });
  }

  if (def.status === "NOT_CONFIGURED") {
    return blockedFromDefinition(def, {
      readiness: "WAITING_CONFIGURATION",
      executable: false,
      reasonCode: "PROVIDER_NOT_CONFIGURED",
      missingRequirements: ["provider_configuration"],
    });
  }

  // Static AVAILABLE — still fail closed on runtime gates.
  if (def.tenantScoped) {
    const tenantId = input.trustedTenantId?.trim();
    if (!tenantId) {
      return blockedFromDefinition(def, {
        readiness: "BLOCKED",
        executable: false,
        reasonCode: "TENANT_BINDING_MISSING",
        missingRequirements: ["trusted_tenant_binding"],
      });
    }
  }

  const env = input.environment ?? null;
  if (env?.featureFlags) {
    for (const [flag, enabled] of Object.entries(env.featureFlags)) {
      if (enabled === false) {
        return blockedFromDefinition(def, {
          readiness: "BLOCKED",
          executable: false,
          reasonCode: "FEATURE_FLAG_DISABLED",
          missingRequirements: [`feature_flag:${flag}`],
        });
      }
    }
  }

  if (def.providerKeys.length > 0 && env) {
    const disabled = new Set(env.providersDisabled ?? []);
    const configured = env.providersConfigured ? new Set(env.providersConfigured) : null;
    for (const pk of def.providerKeys) {
      if (disabled.has(pk)) {
        return blockedFromDefinition(def, {
          readiness: "BLOCKED",
          executable: false,
          reasonCode: "PROVIDER_DISABLED",
          missingRequirements: [`provider_disabled:${pk}`],
        });
      }
      if (configured && !configured.has(pk) && !def.providerKeys.some((k) => configured.has(k))) {
        // Only fail if NONE of the capability's providers are configured.
      }
    }
    if (configured && !def.providerKeys.some((k) => configured.has(k))) {
      return blockedFromDefinition(def, {
        readiness: "WAITING_CONFIGURATION",
        executable: false,
        reasonCode: "PROVIDER_NOT_CONFIGURED",
        missingRequirements: def.providerKeys.map((k) => `provider:${k}`),
      });
    }
  }

  const missingIntegrations: string[] = [];
  if (def.integrationRequirements.length > 0) {
    const snap = input.integrationSnapshot;
    if (!snap || !input.trustedTenantId || snap.tenantId !== input.trustedTenantId) {
      return blockedFromDefinition(def, {
        readiness: "WAITING_INTEGRATION",
        executable: false,
        reasonCode: snap ? "TENANT_BINDING_MISSING" : "INTEGRATION_NOT_CONNECTED",
        missingRequirements: def.integrationRequirements,
        humanReason: snap
          ? "Integration snapshot tenant does not match trusted tenant binding."
          : humanReasonForCode("INTEGRATION_NOT_CONNECTED"),
      });
    }
    const connected = new Set(snap.connected);
    for (const req of def.integrationRequirements) {
      if (!connected.has(req)) missingIntegrations.push(req);
    }
    if (missingIntegrations.length > 0) {
      return blockedFromDefinition(def, {
        readiness: "WAITING_INTEGRATION",
        executable: false,
        reasonCode: "INTEGRATION_NOT_CONNECTED",
        missingRequirements: missingIntegrations,
      });
    }
  }

  let entitlementSatisfied: boolean | null = null;
  if (def.requiredEntitlementClass) {
    const metric = def.requiredEntitlementClass;
    const snap = input.entitlementSnapshot;
    if (!snap || !input.trustedTenantId || snap.tenantId !== input.trustedTenantId) {
      return blockedFromDefinition(def, {
        readiness: "WAITING_ENTITLEMENT",
        executable: false,
        reasonCode: "ENTITLEMENT_MISSING",
        entitlementSatisfied: false,
        missingRequirements: [metric],
        humanReason: snap
          ? "Entitlement snapshot tenant does not match trusted tenant binding."
          : humanReasonForCode("ENTITLEMENT_MISSING"),
      });
    }
    if (snap.pausedMetrics?.includes(metric)) {
      return blockedFromDefinition(def, {
        readiness: "WAITING_ENTITLEMENT",
        executable: false,
        reasonCode: "ENTITLEMENT_PAUSED",
        entitlementSatisfied: false,
        missingRequirements: [metric],
      });
    }
    const remaining =
      snap.remaining?.[metric] ??
      snap.metrics[metric];
    if (typeof remaining !== "number" || remaining <= 0) {
      const hadLimit = typeof snap.metrics[metric] === "number" && (snap.metrics[metric] as number) > 0;
      return blockedFromDefinition(def, {
        readiness: "WAITING_ENTITLEMENT",
        executable: false,
        reasonCode: hadLimit ? "ENTITLEMENT_EXHAUSTED" : "ENTITLEMENT_MISSING",
        entitlementSatisfied: false,
        missingRequirements: [metric],
      });
    }
    entitlementSatisfied = true;
  }

  const auth = input.authorization ?? {};
  if (auth.killSwitchActive) {
    return blockedFromDefinition(def, {
      readiness: "BLOCKED",
      executable: false,
      reasonCode: "KILL_SWITCH_ACTIVE",
      entitlementSatisfied,
      missingRequirements: ["kill_switch_clear"],
    });
  }

  if (def.externalMutation && auth.shadowMode) {
    return blockedFromDefinition(def, {
      readiness: "SHADOW_BLOCKED",
      executable: false,
      reasonCode: "SHADOW_BLOCKED",
      entitlementSatisfied,
      missingRequirements: ["live_publishing_mode"],
    });
  }

  if (input.requiredInputArtifactsPresent === false) {
    return blockedFromDefinition(def, {
      readiness: "SETUP_REQUIRED",
      executable: false,
      reasonCode: "MISSING_REQUIRED_ARTIFACT",
      entitlementSatisfied,
      missingRequirements: ["required_input_artifacts"],
    });
  }

  if (def.approvalRequired && op === "execute") {
    const approved = auth.approvalGranted === true || auth.standingAuthorizationGranted === true;
    if (!approved) {
      return blockedFromDefinition(def, {
        readiness: auth.standingAuthorizationGranted === false && !auth.approvalGranted
          ? "WAITING_APPROVAL"
          : "WAITING_APPROVAL",
        executable: false,
        reasonCode: auth.standingAuthorizationGranted === false && auth.approvalGranted !== true
          ? "APPROVAL_REQUIRED"
          : auth.approvalGranted === false
            ? "APPROVAL_REQUIRED"
            : "APPROVAL_REQUIRED",
        entitlementSatisfied,
        missingRequirements: ["deterministic_approval_or_standing_auth"],
      });
    }
  }

  if (def.externalMutation && op !== "execute") {
    return blockedFromDefinition(def, {
      readiness: "TECHNICALLY_READY",
      executable: false,
      reasonCode: "TECHNICALLY_READY_AWAITING_MUTATION_POLICY",
      entitlementSatisfied,
      missingRequirements: [],
    });
  }

  return result({
    key: def.key,
    implementationStatus: def.status,
    readiness: "READY",
    executable: true,
    reasonCode: "READY",
    externalMutation: def.externalMutation,
    riskLevel: def.riskLevel,
    approvalRequired: def.approvalRequired,
    entitlementRequired: def.requiredEntitlementClass,
    entitlementSatisfied,
    integrationRequirements: def.integrationRequirements,
    missingRequirements: [],
    providerKeys: def.providerKeys,
  });
}

/**
 * Execution-time revalidation. Planner snapshots are never accepted as authorization.
 */
export function revalidateCapabilityForExecution(
  input: Omit<CapabilityReadinessInput, "requestedOperation" | "fromPlannerSnapshot">,
): CapabilityReadinessResult {
  return resolveCapabilityReadiness({
    ...input,
    requestedOperation: "execute",
    fromPlannerSnapshot: false,
  });
}

export function listExecutableCapabilityKeys(
  input: Omit<CapabilityReadinessInput, "capabilityKey">,
): CapabilityKey[] {
  const executable: CapabilityKey[] = [];
  for (const key of CAPABILITY_KEYS) {
    const readiness = resolveCapabilityReadiness({ ...input, capabilityKey: key });
    if (readiness.executable) executable.push(key);
  }
  return executable;
}

export function assertExecutableCapability(input: CapabilityReadinessInput): CapabilityReadinessResult {
  assertCapability(input.capabilityKey);
  const readiness = resolveCapabilityReadiness(input);
  if (!readiness.executable) {
    throw new Error(`capability_not_executable:${input.capabilityKey}:${readiness.reasonCode}`);
  }
  return readiness;
}

export function isStaticallyNonExecutable(key: string): boolean {
  const def = getCapability(key);
  return !!def && isNonExecutableStatus(def.status);
}
