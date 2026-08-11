/**
 * Tenant-scoped capability runtime matrix using the same snapshot resolvers
 * as executeWorkforceCapabilityServer (+ resolveCapabilityReadiness).
 *
 * Levels (do not inflate launch readiness):
 * - STATIC_AVAILABLE: catalogue status AVAILABLE
 * - PROVIDER_READY: IMPLEMENTED provider probe ready
 * - TENANT_TECHNICALLY_READY: entitlement + integration + env + not kill/shadow-blocked
 *   (may still require approval — probed with synthetic approval)
 * - EXECUTION_REQUIRES_APPROVAL: technically ready but approvalRequired and no auth
 * - RUNTIME_EXECUTABLE_NOW: resolveCapabilityReadiness executable with provided auth
 */
import {
  listCapabilities,
  resolveCapabilityReadiness,
  getCapability,
  getProvidersForCapability,
  type CapabilityAuthorizationContext,
  type CapabilityEntitlementView,
  type CapabilityEnvironmentView,
  type CapabilityIntegrationView,
} from "@stratxcel/workforce-core";
import {
  loadCapabilityEntitlementSnapshot,
  loadCapabilityEnvironmentView,
  loadCapabilityIntegrationSnapshot,
  loadShadowAndKillSwitch,
} from "./snapshots.ts";

export type CapabilityRuntimeMatrixRow = {
  capability: string;
  staticAvailable: boolean;
  providerReady: boolean;
  tenantTechnicallyReady: boolean;
  executionRequiresApproval: boolean;
  runtimeExecutableNow: boolean;
};

export type CapabilityRuntimeMatrix = {
  rows: CapabilityRuntimeMatrixRow[];
  STATIC_AVAILABLE_COUNT: number;
  PROVIDER_READY_COUNT: number;
  TENANT_TECHNICALLY_READY_COUNT: number;
  EXECUTION_REQUIRES_APPROVAL_COUNT: number;
  RUNTIME_EXECUTABLE_NOW_COUNT: number;
};

export async function buildTenantCapabilityRuntimeMatrix(args: {
  tenantId: string;
  /** Optional per-capability auth (e.g. standing grants). Default: none. */
  authorizationForCapability?: (
    capability: string,
  ) => CapabilityAuthorizationContext | null | Promise<CapabilityAuthorizationContext | null>;
  entitlementSnapshot?: CapabilityEntitlementView;
  integrationSnapshot?: CapabilityIntegrationView;
  environment?: CapabilityEnvironmentView;
}): Promise<CapabilityRuntimeMatrix> {
  const entitlement =
    args.entitlementSnapshot ?? (await loadCapabilityEntitlementSnapshot(args.tenantId));
  const integration =
    args.integrationSnapshot ?? (await loadCapabilityIntegrationSnapshot(args.tenantId));
  const environment = args.environment ?? loadCapabilityEnvironmentView();

  const rows: CapabilityRuntimeMatrixRow[] = [];
  let STATIC_AVAILABLE_COUNT = 0;
  let PROVIDER_READY_COUNT = 0;
  let TENANT_TECHNICALLY_READY_COUNT = 0;
  let EXECUTION_REQUIRES_APPROVAL_COUNT = 0;
  let RUNTIME_EXECUTABLE_NOW_COUNT = 0;

  for (const def of listCapabilities()) {
    const staticAvailable = def.status === "AVAILABLE";
    if (staticAvailable) STATIC_AVAILABLE_COUNT += 1;

    let providerReady = false;
    if (staticAvailable) {
      const providers = getProvidersForCapability(def.key);
      for (const provider of providers) {
        if (provider.status !== "IMPLEMENTED") continue;
        const probe = await provider.probeReadiness({
          tenantId: args.tenantId,
          capability: def.key,
        });
        if (probe.ready && probe.status === "IMPLEMENTED") {
          providerReady = true;
          break;
        }
      }
    }
    if (providerReady) PROVIDER_READY_COUNT += 1;

    const shadowKill = await loadShadowAndKillSwitch({
      tenantId: args.tenantId,
      capability: def.key,
    });
    const authResolved = args.authorizationForCapability
      ? await args.authorizationForCapability(def.key)
      : null;
    const authorization: CapabilityAuthorizationContext = {
      trustedTenantId: args.tenantId,
      approvalGranted: authResolved?.approvalGranted === true,
      standingAuthorizationGranted: authResolved?.standingAuthorizationGranted === true,
      authorizationKind: authResolved?.authorizationKind,
      authorizationCapability: authResolved?.authorizationCapability,
      authorizationScopeId: authResolved?.authorizationScopeId,
      shadowMode: shadowKill.shadowMode,
      killSwitchActive: shadowKill.killSwitchActive,
    };

    const executeNoAuth = resolveCapabilityReadiness({
      capabilityKey: def.key,
      trustedTenantId: args.tenantId,
      entitlementSnapshot: entitlement,
      integrationSnapshot: integration,
      environment,
      authorization: {
        approvalGranted: false,
        standingAuthorizationGranted: false,
        shadowMode: shadowKill.shadowMode,
        killSwitchActive: shadowKill.killSwitchActive,
      },
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    });

    const executeSyntheticApproval = resolveCapabilityReadiness({
      capabilityKey: def.key,
      trustedTenantId: args.tenantId,
      entitlementSnapshot: entitlement,
      integrationSnapshot: integration,
      environment,
      authorization: {
        approvalGranted: true,
        shadowMode: shadowKill.shadowMode,
        killSwitchActive: shadowKill.killSwitchActive,
      },
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    });

    const executeWithAuth = resolveCapabilityReadiness({
      capabilityKey: def.key,
      trustedTenantId: args.tenantId,
      entitlementSnapshot: entitlement,
      integrationSnapshot: integration,
      environment,
      authorization,
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    });

    const technically =
      staticAvailable && providerReady && executeSyntheticApproval.executable === true;

    const executionRequiresApproval =
      technically &&
      getCapability(def.key)?.approvalRequired === true &&
      executeNoAuth.executable === false &&
      (executeNoAuth.reasonCode === "APPROVAL_REQUIRED" ||
        executeNoAuth.reasonCode === "STANDING_AUTH_REQUIRED");

    const runtimeExecutableNow =
      staticAvailable && providerReady && executeWithAuth.executable === true;

    if (technically) TENANT_TECHNICALLY_READY_COUNT += 1;
    if (executionRequiresApproval) EXECUTION_REQUIRES_APPROVAL_COUNT += 1;
    if (runtimeExecutableNow) RUNTIME_EXECUTABLE_NOW_COUNT += 1;

    rows.push({
      capability: def.key,
      staticAvailable,
      providerReady,
      tenantTechnicallyReady: technically,
      executionRequiresApproval,
      runtimeExecutableNow,
    });
  }

  return {
    rows,
    STATIC_AVAILABLE_COUNT,
    PROVIDER_READY_COUNT,
    TENANT_TECHNICALLY_READY_COUNT,
    EXECUTION_REQUIRES_APPROVAL_COUNT,
    RUNTIME_EXECUTABLE_NOW_COUNT,
  };
}
