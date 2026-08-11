import type { HermesRuntimeAdapter } from "@stratxcel/hermes";
import type { MissionRow } from "@stratxcel/missions";
import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { ToolName, MissionScopedContext } from "@stratxcel/hermes";
import { assertDepartment } from "../departments/registry.ts";
import { assertRole } from "../roles/registry.ts";
import { assertSameMissionArtifact, assertSameTenantArtifact } from "../artifacts/provenance.ts";
import { assertChildBudgetWithinParent } from "../budgets/hierarchy.ts";
import {
  assertCapabilitiesExecutable,
  assertTrustedScope,
  narrowTools,
} from "../security/narrowing.ts";
import { isBlockedCapability } from "../security/narrowing.ts";

export interface SpecialistArtifactRef {
  id: string;
  tenantId: string;
  missionId: string;
  kind: string;
}

export interface SpecialistOutputContract {
  kind: string;
}

export interface SpecialistRunRequest {
  missionId: string;
  tenantId: string;
  department: string;
  role: string;
  objective: string;
  instructions: string;
  inputArtifactIds: readonly string[];
  allowedTools: readonly ToolName[];
  budgetCents: number;
  outputContract: SpecialistOutputContract;
  evidenceRequirements: readonly string[];
  parentAllowedTools: readonly ToolName[];
  parentBudgetRemainingCents: number;
  correlationId: string;
  requiredCapabilities?: readonly string[];
  /** AI Runtime workload class — planner may recommend; router remains authoritative. */
  taskClass?: string;
  qualityTarget?: number;
  routingPolicy?: string;
  budgetEnvelope?: {
    plan: "starter" | "growth" | "business" | "scale" | "custom";
    monthlyBudgetUsd: number;
    spentUsdThisMonth: number;
    reservedCriticalUsd?: number;
    allowEmergencyMargin?: boolean;
    ownerApprovedOverage?: boolean;
  };
}

export type SpecialistRunStatus = "COMPLETED" | "FAILED";

export interface SpecialistRunResult {
  status: SpecialistRunStatus;
  summary?: string;
  hermesRunId?: string;
  artifactId?: string;
  errorCode?: string;
}

export interface SpecialistRunnerDeps {
  getMission: () => Promise<MissionRow>;
  getArtifacts: (ids: readonly string[]) => Promise<SpecialistArtifactRef[]>;
  hermes: HermesRuntimeAdapter;
  issueToken: () => string;
  buildContext: (args: { instructions: string }) => MissionScopedContext;
  brandBrainForMission: () => Promise<BrandBrainContent>;
}

export async function runSpecialistAgent(
  request: SpecialistRunRequest,
  deps: SpecialistRunnerDeps,
): Promise<SpecialistRunResult> {
  try {
    const mission = await deps.getMission();
    if (mission.tenant_id !== request.tenantId || mission.id !== request.missionId) {
      return { status: "FAILED", errorCode: "mission_scope_mismatch" };
    }

    let departmentExists = false;
    let roleExists = false;
    try {
      assertDepartment(request.department);
      departmentExists = true;
      assertRole(request.department, request.role);
      roleExists = true;
    } catch {
      return { status: "FAILED", errorCode: departmentExists ? "unknown_role" : "unknown_department" };
    }

    assertTrustedScope({
      trustedTenantId: mission.tenant_id,
      requestTenantId: request.tenantId,
      departmentExists,
      roleExists,
    });

    const artifacts = await deps.getArtifacts(request.inputArtifactIds);
    for (const artifact of artifacts) {
      assertSameTenantArtifact(request.tenantId, artifact.tenantId);
      assertSameMissionArtifact(request.missionId, artifact.missionId);
    }

    narrowTools(request.parentAllowedTools, request.allowedTools);
    assertChildBudgetWithinParent(request.parentBudgetRemainingCents, request.budgetCents);

    if (request.requiredCapabilities?.some((cap) => isBlockedCapability(cap))) {
      return { status: "FAILED", errorCode: "unavailable_media_provider" };
    }

    if (request.requiredCapabilities?.length) {
      assertCapabilitiesExecutable(request.requiredCapabilities);
    }

    // AI Runtime routing metadata: specialist may narrow, never widen. Hermes remains
    // the execution backend for mission specialists; model authority for direct AI
    // calls is packages/ai-runtime. Planner recommendations are advisory only.
    let routingNote = "";
    try {
      const { buildSpecialistRouting } = await import("@stratxcel/ai-runtime");
      const routing = buildSpecialistRouting({
        department: request.department,
        qualityTarget: request.qualityTarget,
        budgetEnvelope: request.budgetEnvelope,
        parentTaskClass: request.taskClass as
          | "ROUTING"
          | "GENERAL_SPECIALIST"
          | "CONTENT"
          | "STRATEGY"
          | "EXECUTIVE"
          | "RESEARCH"
          | undefined,
      });
      routingNote = `\n[ai-runtime] taskClass=${routing.taskClass} qualityTarget=${routing.qualityTarget ?? "default"} authority=ai_runtime_router`;
    } catch {
      routingNote = "";
    }

    const context = deps.buildContext({ instructions: `${request.instructions}${routingNote}` });
    const token = deps.issueToken();
    const result = await deps.hermes.execute(mission, context, token);

    if (result.outcome === "FAILED") {
      return { status: "FAILED", errorCode: "hermes_failed", summary: result.summary, hermesRunId: result.hermesRunId };
    }

    return {
      status: "COMPLETED",
      summary: result.summary,
      hermesRunId: result.hermesRunId,
      artifactId: result.artifactRefs?.[0],
    };
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      return { status: "FAILED", errorCode: String((err as { code: string }).code) };
    }
    if (err instanceof Error && err.message === "cross_tenant_artifact_rejected") {
      return { status: "FAILED", errorCode: "cross_tenant_artifact_rejected" };
    }
    throw err;
  }
}
