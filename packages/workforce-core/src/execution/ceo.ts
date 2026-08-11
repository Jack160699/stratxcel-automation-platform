import { z } from "zod";
import type { ToolName } from "@stratxcel/hermes";
import { assertDepartment } from "../departments/registry.ts";
import { assertRole } from "../roles/registry.ts";
import { narrowCapabilityClasses, narrowTools } from "../security/narrowing.ts";
import { assertBudgetNarrowing } from "../budgets/hierarchy.ts";
import type { WorkforcePlan, WorkforceStage } from "../planning/types.ts";
import { assertValidWorkforcePlan } from "../planning/validator.ts";

export const HERMES_CEO_INSTRUCTIONS = `You are the Hermes CEO for Stratxcel missions.
Understand the business objective, Brand Brain, entitlements, and available capabilities.
Produce a validated workforce DAG with departments, specialist roles, dependencies, budgets, and deliverables.
Never exceed entitlements, never grant new capabilities, and never authorize external mutation from planning alone.
Delegate artifact creation to specialists; your job is understand, plan, delegate, evaluate, and escalate.`;

const ceoStageSchema = z.object({
  stageId: z.string().min(1),
  department: z.string().min(1),
  specialistRole: z.string().min(1),
  objective: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  inputs: z.array(z.string()).default([]),
  requiredEvidence: z.array(z.string()).default([]),
  outputKind: z.string().min(1),
  allowedCapabilityClasses: z.array(z.string()).default([]),
  budgetCents: z.number().int().nonnegative(),
  qualityGate: z.array(z.string()).default([]),
  maxAttempts: z.number().int().positive().default(3),
});

const ceoPlanSchema = z.object({
  objective: z.string().min(1),
  businessOutcome: z.string().min(1),
  departmentStages: z.array(ceoStageSchema).min(1),
  dependencies: z.record(z.string(), z.array(z.string())).default({}),
  expectedDeliverables: z.array(z.string()).default([]),
});

export type CeoPlanProposal = z.infer<typeof ceoPlanSchema>;

export function parseCeoPlanProposal(raw: unknown): CeoPlanProposal {
  return ceoPlanSchema.parse(raw);
}

export interface CompileHermesCeoPlanInput {
  tenantId: string;
  missionId: string;
  proposal: CeoPlanProposal;
  entitlementSnapshot: WorkforcePlan["entitlementSnapshot"];
  capabilitySnapshot: WorkforcePlan["capabilitySnapshot"];
  budgetEnvelope: WorkforcePlan["budgetEnvelope"];
  parentAllowedTools: readonly ToolName[];
  parentAllowedCapabilities: readonly string[];
  parentBudgetRemainingCents: number;
  createdAtIso: string;
}

export function compileHermesCeoPlan(input: CompileHermesCeoPlanInput): WorkforcePlan {
  const stages: WorkforceStage[] = input.proposal.departmentStages.map((stage) => {
    assertDepartment(stage.department);
    assertRole(stage.department, stage.specialistRole);
    const narrowedCaps = narrowCapabilityClasses(input.parentAllowedCapabilities, stage.allowedCapabilityClasses);
    assertBudgetNarrowing(input.parentBudgetRemainingCents, stage.budgetCents);
    return {
      ...stage,
      department: stage.department as WorkforceStage["department"],
      allowedCapabilityClasses: narrowedCaps as WorkforceStage["allowedCapabilityClasses"],
      state: "PENDING",
    };
  });

  const plan: WorkforcePlan = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    version: 1,
    objective: input.proposal.objective,
    businessOutcome: input.proposal.businessOutcome,
    planningHorizon: "mission",
    entitlementSnapshot: input.entitlementSnapshot,
    capabilitySnapshot: [...input.capabilitySnapshot],
    departmentStages: stages,
    dependencies: input.proposal.dependencies,
    expectedDeliverables: input.proposal.expectedDeliverables,
    qualityPolicyId: "default",
    revisionPolicyId: "default",
    budgetEnvelope: input.budgetEnvelope,
    approvalPolicyId: "default",
    createdAtIso: input.createdAtIso,
    status: "VALIDATING",
  };

  narrowTools(input.parentAllowedTools, ["get_brand_context"]);
  return assertValidWorkforcePlan(plan);
}

export { assertBudgetNarrowing };
