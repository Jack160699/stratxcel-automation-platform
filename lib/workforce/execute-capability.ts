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
import type {
  CapabilityAuthorizationReferences,
  ResolveAuthorizationDeps,
  TrustedExecutionScope,
  resolveCapabilityAuthorization,
} from "./resolve-authorization.ts";

export type { CapabilityAuthorizationReferences, TrustedExecutionScope };

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
   * Authorization REFERENCES / grants — never trust caller-supplied
   * approvalGranted / standingAuthorizationGranted booleans.
   * The executor resolves CapabilityAuthorizationContext server-side.
   */
  authorization?: CapabilityAuthorizationReferences | null;
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
  resolveAuthorization?: typeof resolveCapabilityAuthorization;
  resolveAuthorizationDeps?: ResolveAuthorizationDeps;
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

function buildTrustedExecutionScope(
  input: ExecuteWorkforceCapabilityServerInput,
): TrustedExecutionScope {
  const payload = input.input ?? {};
  const inputArtifactIds = [...(input.inputArtifactIds ?? [])];
  const artifactId =
    typeof payload.artifactId === "string" && payload.artifactId.trim()
      ? payload.artifactId.trim()
      : inputArtifactIds[0] ?? null;
  const accountId =
    typeof payload.accountId === "string" && payload.accountId.trim()
      ? payload.accountId.trim()
      : null;
  const destinationId =
    typeof payload.destinationId === "string" && payload.destinationId.trim()
      ? payload.destinationId.trim()
      : typeof payload.leadId === "string" && payload.leadId.trim()
        ? payload.leadId.trim()
        : accountId;
  return {
    inputArtifactIds,
    expectedArtifactVersions: input.expectedArtifactVersions,
    operation: typeof payload.operation === "string" ? payload.operation : null,
    accountId,
    variantId:
      typeof payload.variantId === "string" && payload.variantId.trim()
        ? payload.variantId.trim()
        : null,
    artifactId,
    actionFingerprint:
      typeof payload.exactPayloadFingerprint === "string"
        ? payload.exactPayloadFingerprint
        : typeof payload.actionFingerprint === "string"
          ? payload.actionFingerprint
          : null,
    destinationId,
    idempotencyKey:
      typeof payload.idempotencyKey === "string" && payload.idempotencyKey.trim()
        ? payload.idempotencyKey.trim()
        : null,
  };
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
  const authModule = await import("./resolve-authorization.ts");
  const loadEnt = deps.loadEntitlementSnapshot ?? snapshots.loadCapabilityEntitlementSnapshot;
  const loadInt = deps.loadIntegrationSnapshot ?? snapshots.loadCapabilityIntegrationSnapshot;
  const loadEnv = deps.loadEnvironment ?? snapshots.loadCapabilityEnvironmentView;
  const loadShadow = deps.loadShadowKill ?? snapshots.loadShadowAndKillSwitch;
  const resolveArtifact = deps.resolveArtifact ?? artifacts.resolveMissionArtifactRecord;
  const resolveAuth = deps.resolveAuthorization ?? authModule.resolveCapabilityAuthorization;
  const run = deps.requestCapabilityFn ?? requestCapability;

  const execution = buildTrustedExecutionScope(input);

  const [entitlementSnapshot, integrationSnapshot, shadowKill, resolvedAuth] =
    await Promise.all([
      loadEnt(tenantId),
      loadInt(tenantId),
      loadShadow({ tenantId, capability: input.capability }),
      resolveAuth(
        {
          tenantId,
          missionId: input.missionId,
          capability: input.capability,
          operation: execution.operation,
          execution,
          references: input.authorization ?? null,
        },
        deps.resolveAuthorizationDeps ?? {},
      ),
    ]);
  const environment = loadEnv();

  const authorizationContext: CapabilityAuthorizationContext = {
    ...resolvedAuth,
    trustedTenantId: tenantId,
    shadowMode: resolvedAuth.shadowMode === true || shadowKill.shadowMode === true,
    killSwitchActive:
      resolvedAuth.killSwitchActive === true || shadowKill.killSwitchActive === true,
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
