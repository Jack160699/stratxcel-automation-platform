import { humanReasonForCode } from "./reason-codes.ts";
import { getCapability } from "./registry.ts";
import {
  resolveCapabilityReadiness,
  type CapabilityEntitlementView,
  type CapabilityEnvironmentView,
  type CapabilityIntegrationView,
} from "./readiness.ts";
import type { CapabilityExecutionRequest, CapabilityExecutionResult } from "./request.ts";
import { executeWithFailover } from "../providers/failover.ts";
import "../providers/bootstrap.ts";

export interface CapabilityExecutionDeps {
  entitlementSnapshot?: CapabilityEntitlementView | null;
  integrationSnapshot?: CapabilityIntegrationView | null;
  environment?: CapabilityEnvironmentView | null;
  /** Optional override for tests. */
  executeProvider?: typeof executeWithFailover;
}

function mapReadinessToExecutionStatus(
  readiness: ReturnType<typeof resolveCapabilityReadiness>,
): CapabilityExecutionResult["status"] {
  switch (readiness.readiness) {
    case "WAITING_CONFIGURATION":
      return "WAITING_CONFIGURATION";
    case "WAITING_INTEGRATION":
      return "WAITING_INTEGRATION";
    case "WAITING_ENTITLEMENT":
      return "WAITING_ENTITLEMENT";
    case "WAITING_APPROVAL":
      return "WAITING_APPROVAL";
    case "SHADOW_BLOCKED":
      return "SHADOW_COMPLETED";
    case "READY":
      return "SUCCEEDED";
    default:
      return "BLOCKED";
  }
}

/**
 * Public API for departments: request a capability without knowing providers.
 * Always revalidates at execution time. Planner snapshots never authorize.
 */
export async function requestCapability(
  request: CapabilityExecutionRequest,
  deps: CapabilityExecutionDeps = {},
): Promise<CapabilityExecutionResult> {
  const evaluatedAt = new Date().toISOString();
  const auth = request.authorizationContext;

  if (!auth?.trustedTenantId || auth.trustedTenantId !== request.tenantId) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: "BLOCKED",
      outputArtifactIds: [],
      reasonCode: "TENANT_BINDING_MISSING",
      humanReason: humanReasonForCode("TENANT_BINDING_MISSING"),
      evaluatedAt,
    };
  }

  if (auth.fromPlannerSnapshot) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: "BLOCKED",
      outputArtifactIds: [],
      reasonCode: "POLICY_BLOCK",
      humanReason: "Planner capability snapshots never authorize execution.",
      evaluatedAt,
    };
  }

  const def = getCapability(request.capability);
  if (!def) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: "BLOCKED",
      outputArtifactIds: [],
      reasonCode: "UNKNOWN_CAPABILITY",
      humanReason: humanReasonForCode("UNKNOWN_CAPABILITY"),
      evaluatedAt,
    };
  }

  const readiness = resolveCapabilityReadiness({
    capabilityKey: request.capability,
    trustedTenantId: auth.trustedTenantId,
    missionId: request.missionId,
    entitlementSnapshot: deps.entitlementSnapshot,
    integrationSnapshot: deps.integrationSnapshot,
    environment: deps.environment,
    authorization: {
      approvalGranted: auth.approvalGranted,
      standingAuthorizationGranted: auth.standingAuthorizationGranted,
      shadowMode: auth.shadowMode,
      killSwitchActive: auth.killSwitchActive,
    },
    requestedOperation: "execute",
    fromPlannerSnapshot: false,
    requiredInputArtifactsPresent:
      def.supportedInputArtifacts.length === 0 ? true : request.inputArtifactIds.length > 0,
  });

  if (!readiness.executable) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: mapReadinessToExecutionStatus(readiness),
      outputArtifactIds: [],
      reasonCode: readiness.reasonCode,
      humanReason: readiness.humanReason,
      evaluatedAt,
    };
  }

  const run = deps.executeProvider ?? executeWithFailover;
  const outcome = await run(request.capability, {
    requestId: request.requestId,
    tenantId: request.tenantId,
    missionId: request.missionId,
    capability: request.capability,
    inputArtifactIds: request.inputArtifactIds,
    input: request.input,
  });

  if (!outcome.result.ok) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: "FAILED",
      outputArtifactIds: [],
      providerKey: outcome.result.providerKey,
      errorClassification: outcome.result.errorCategory,
      reasonCode: "POLICY_BLOCK",
      humanReason: outcome.result.errorMessage ?? "Provider execution failed",
      usage: outcome.result.usage,
      evaluatedAt,
    };
  }

  const usage = outcome.result.usage;
  return {
    requestId: request.requestId,
    capability: request.capability,
    status: "SUCCEEDED",
    outputArtifactIds: outcome.result.outputArtifactIds ?? [],
    providerKey: outcome.result.providerKey,
    providerReference: outcome.result.providerReference,
    usage,
    cost: {
      amount: usage?.costKnown ? (usage.providerReportedCost ?? null) : null,
      currency: usage?.currency ?? null,
      costKnown: usage?.costKnown === true,
    },
    receipt: outcome.result.receipt,
    reasonCode: "READY",
    humanReason: humanReasonForCode("READY"),
    evaluatedAt,
  };
}
