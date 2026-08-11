/**
 * Canonical server-only Workforce capability executor.
 *
 * Guarantees host binding and builds security snapshots server-side.
 * Do not expose as an unauthenticated generic HTTP "execute anything" endpoint.
 */
import {
  requestCapability,
  type CapabilityExecutionResult,
  type CapabilityAuthorizationContext,
} from "@stratxcel/workforce-core";
import type { resolveMissionArtifactRecord } from "./mission-artifacts.ts";
import type {
  loadCapabilityEntitlementSnapshot,
  loadCapabilityEnvironmentView,
  loadCapabilityIntegrationSnapshot,
  loadShadowAndKillSwitch,
} from "./snapshots.ts";

export interface ExecuteWorkforceCapabilityServerInput {
  requestId: string;
  missionId: string;
  capability: string;
  department: string;
  role: string;
  stageId?: string;
  inputArtifactIds?: readonly string[];
  input?: Record<string, unknown>;
  /**
   * Optional claimed tenant from caller/model — rejected on mismatch.
   * Trusted tenant is always derived from the mission row.
   */
  claimedTenantId?: string | null;
  /**
   * Trusted authorization from server approval / standing-auth resolvers.
   * Never from model tool payload alone.
   */
  authorization?: Omit<CapabilityAuthorizationContext, "trustedTenantId">;
  expectedArtifactVersions?: Readonly<Record<string, string>>;
}

export interface ExecuteWorkforceCapabilityServerDeps {
  ensureHostsBound?: () => void | Promise<void>;
  loadMission?: (missionId: string) => Promise<{ id: string; tenant_id: string } | null>;
  loadEntitlementSnapshot?: typeof loadCapabilityEntitlementSnapshot;
  loadIntegrationSnapshot?: typeof loadCapabilityIntegrationSnapshot;
  loadEnvironment?: typeof loadCapabilityEnvironmentView;
  loadShadowKill?: typeof loadShadowAndKillSwitch;
  resolveArtifact?: typeof resolveMissionArtifactRecord;
  requestCapabilityFn?: typeof requestCapability;
}

async function defaultLoadMission(
  missionId: string,
): Promise<{ id: string; tenant_id: string } | null> {
  const { createSupabaseServiceClient } = await import("../supabase/service.ts");
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("missions")
    .select("id, tenant_id")
    .eq("id", missionId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: String(data.id), tenant_id: String(data.tenant_id) };
}

/**
 * Production entrypoint for mission-scoped capability execution.
 */
export async function executeWorkforceCapabilityServer(
  input: ExecuteWorkforceCapabilityServerInput,
  deps: ExecuteWorkforceCapabilityServerDeps = {},
): Promise<CapabilityExecutionResult> {
  if (deps.ensureHostsBound) {
    await Promise.resolve(deps.ensureHostsBound());
  } else {
    const { ensureWorkforceCapabilityHostsBound } = await import("./bind-capability-hosts.ts");
    await ensureWorkforceCapabilityHostsBound();
  }

  const loadMission = deps.loadMission ?? defaultLoadMission;
  const mission = await loadMission(input.missionId);
  if (!mission) {
    return {
      requestId: input.requestId,
      capability: input.capability,
      status: "BLOCKED",
      outputArtifactIds: [],
      reasonCode: "POLICY_BLOCK",
      humanReason: "Mission not found.",
      evaluatedAt: new Date().toISOString(),
    };
  }

  const tenantId = mission.tenant_id;
  if (input.claimedTenantId && input.claimedTenantId !== tenantId) {
    return {
      requestId: input.requestId,
      capability: input.capability,
      status: "BLOCKED",
      outputArtifactIds: [],
      reasonCode: "TENANT_BINDING_MISSING",
      humanReason: "Claimed tenant does not match mission tenant.",
      evaluatedAt: new Date().toISOString(),
    };
  }

  const snapshots = await import("./snapshots.ts");
  const artifacts = await import("./mission-artifacts.ts");
  const loadEnt = deps.loadEntitlementSnapshot ?? snapshots.loadCapabilityEntitlementSnapshot;
  const loadInt = deps.loadIntegrationSnapshot ?? snapshots.loadCapabilityIntegrationSnapshot;
  const loadEnv = deps.loadEnvironment ?? snapshots.loadCapabilityEnvironmentView;
  const loadShadow = deps.loadShadowKill ?? snapshots.loadShadowAndKillSwitch;
  const resolveArtifact = deps.resolveArtifact ?? artifacts.resolveMissionArtifactRecord;
  const run = deps.requestCapabilityFn ?? requestCapability;

  const [entitlementSnapshot, integrationSnapshot, shadowKill] = await Promise.all([
    loadEnt(tenantId),
    loadInt(tenantId),
    loadShadow(tenantId),
  ]);
  const environment = loadEnv();

  const authorizationContext: CapabilityAuthorizationContext = {
    trustedTenantId: tenantId,
    approvalGranted: input.authorization?.approvalGranted === true,
    standingAuthorizationGranted: input.authorization?.standingAuthorizationGranted === true,
    authorizationKind: input.authorization?.authorizationKind,
    authorizationCapability: input.authorization?.authorizationCapability,
    authorizationScopeId: input.authorization?.authorizationScopeId,
    shadowMode:
      input.authorization?.shadowMode === true || shadowKill.shadowMode === true,
    killSwitchActive:
      input.authorization?.killSwitchActive === true ||
      shadowKill.killSwitchActive === true,
    fromPlannerSnapshot: input.authorization?.fromPlannerSnapshot === true,
  };

  return run(
    {
      requestId: input.requestId,
      missionId: input.missionId,
      tenantId,
      stageId: input.stageId,
      department: input.department,
      role: input.role,
      capability: input.capability,
      inputArtifactIds: [...(input.inputArtifactIds ?? [])],
      requestedAt: new Date().toISOString(),
      authorizationContext,
      input: input.input,
      expectedArtifactVersions: input.expectedArtifactVersions,
    },
    {
      entitlementSnapshot,
      integrationSnapshot,
      environment,
      artifactResolver: async (id) =>
        resolveArtifact(id, { expectedTenantId: tenantId }),
    },
  );
}
