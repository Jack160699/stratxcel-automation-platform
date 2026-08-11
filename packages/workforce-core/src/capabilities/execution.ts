import { humanReasonForCode, type CapabilityReasonCode } from "./reason-codes.ts";
import { getCapability } from "./registry.ts";
import { authorizeArtifactForCapability } from "./artifact-authorization.ts";
import {
  resolveCapabilityReadiness,
  type CapabilityEntitlementView,
  type CapabilityEnvironmentView,
  type CapabilityIntegrationView,
} from "./readiness.ts";
import type {
  ArtifactResolver,
  ArtifactUsagePolicy,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
} from "./request.ts";
import { executeWithFailover } from "../providers/failover.ts";
import { getProvidersForCapability } from "../providers/registry.ts";
import "../providers/bootstrap.ts";

export type { ArtifactRecord, ArtifactResolver, ArtifactUsagePolicy } from "./request.ts";

export interface CapabilityExecutionDeps {
  entitlementSnapshot?: CapabilityEntitlementView | null;
  integrationSnapshot?: CapabilityIntegrationView | null;
  environment?: CapabilityEnvironmentView | null;
  /** Optional override for tests. */
  executeProvider?: typeof executeWithFailover;
  /** Resolves input artifacts for tenant/kind/mission/status/version security checks. */
  artifactResolver?: ArtifactResolver;
  /**
   * Trusted runtime artifact usage policy — never model-supplied.
   * Controls cross-mission reusable tenant assets (Brand Brain, media library, etc.).
   */
  artifactUsagePolicy?: ArtifactUsagePolicy | null;
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

function blockedResult(
  request: CapabilityExecutionRequest,
  reasonCode: CapabilityReasonCode,
  humanReason?: string,
): CapabilityExecutionResult {
  return {
    requestId: request.requestId,
    capability: request.capability,
    status: "BLOCKED",
    outputArtifactIds: [],
    reasonCode,
    humanReason: humanReason ?? humanReasonForCode(reasonCode),
    evaluatedAt: new Date().toISOString(),
  };
}

async function hasReadyImplementedProvider(
  capability: string,
  tenantId: string,
): Promise<boolean> {
  const providers = getProvidersForCapability(capability);
  for (const provider of providers) {
    if (provider.status !== "IMPLEMENTED") continue;
    const probe = await provider.probeReadiness({ tenantId, capability });
    if (probe.ready && probe.status === "IMPLEMENTED") return true;
  }
  return false;
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
  let providerInvocationCount = 0;

  if (!auth?.trustedTenantId || auth.trustedTenantId !== request.tenantId) {
    return blockedResult(request, "TENANT_BINDING_MISSING");
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
    return blockedResult(request, "UNKNOWN_CAPABILITY");
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
      authorizationKind: auth.authorizationKind,
      authorizationCapability: auth.authorizationCapability,
      authorizationScopeId: auth.authorizationScopeId,
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

  // Reconcile provider registry readiness: static AVAILABLE is not enough.
  const providerReady = await hasReadyImplementedProvider(request.capability, request.tenantId);
  if (!providerReady) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: "WAITING_CONFIGURATION",
      outputArtifactIds: [],
      reasonCode: "PROVIDER_NOT_CONFIGURED",
      humanReason: humanReasonForCode("PROVIDER_NOT_CONFIGURED"),
      evaluatedAt,
    };
  }

  // Artifact security gates — must run before provider execution.
  if (request.inputArtifactIds.length > 0) {
    const resolver = deps.artifactResolver;
    for (const artifactId of request.inputArtifactIds) {
      if (!resolver) {
        return blockedResult(
          request,
          "ARTIFACT_UNKNOWN",
          "Input artifacts present but no artifactResolver configured.",
        );
      }
      const record = await resolver(artifactId);
      if (!record) {
        if (providerInvocationCount !== 0) {
          throw new Error("invariant_provider_invoked_on_artifact_block");
        }
        return blockedResult(request, "ARTIFACT_UNKNOWN");
      }

      const authz = authorizeArtifactForCapability({
        artifact: record,
        requestMissionId: request.missionId,
        requestTenantId: request.tenantId,
        capability: def,
        usagePolicy: deps.artifactUsagePolicy,
        expectedArtifactVersions: request.expectedArtifactVersions,
      });
      if (!authz.ok) {
        if (providerInvocationCount !== 0) {
          throw new Error("invariant_provider_invoked_on_artifact_block");
        }
        return blockedResult(
          request,
          authz.reasonCode ?? "POLICY_BLOCK",
          authz.humanReason,
        );
      }
    }
  }

  // Budget gates — unknown cost is OK; known overspend / zero remaining blocks.
  const envelope = request.budgetEnvelope;
  if (envelope) {
    const remaining = envelope.remaining ?? envelope.remainingCents;
    if (remaining <= 0) {
      if (providerInvocationCount !== 0) {
        throw new Error("invariant_provider_invoked_on_budget_block");
      }
      return blockedResult(request, "BUDGET_EXHAUSTED");
    }
    const estimated =
      request.estimatedMaxCostCents ?? envelope.estimatedMaxCostCents ?? undefined;
    if (typeof estimated === "number" && estimated > remaining) {
      if (providerInvocationCount !== 0) {
        throw new Error("invariant_provider_invoked_on_budget_block");
      }
      return blockedResult(request, "BUDGET_EXHAUSTED");
    }
  }

  const run = deps.executeProvider ?? executeWithFailover;
  providerInvocationCount += 1;
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

  // Never treat simulated success as Succeeded in production path.
  if (outcome.result.receipt && (outcome.result.receipt as { simulated?: unknown }).simulated === true) {
    return {
      requestId: request.requestId,
      capability: request.capability,
      status: "FAILED",
      outputArtifactIds: [],
      providerKey: outcome.result.providerKey,
      errorClassification: "POLICY_BLOCK",
      reasonCode: "POLICY_BLOCK",
      humanReason: "Simulated provider success is not allowed in production execution.",
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
