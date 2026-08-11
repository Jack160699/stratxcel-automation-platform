import { assertDepartment } from "../departments/registry.ts";
import { assertRole } from "../roles/registry.ts";
import { getCapability } from "../capabilities/registry.ts";
import { isBlockedCapability } from "../security/narrowing.ts";
import { detectCycle } from "../execution/dag.ts";
import type { WorkforcePlan } from "./types.ts";
import { WorkforcePlanValidationError } from "./types.ts";

export function validateWorkforcePlan(plan: WorkforcePlan): string[] {
  const errors: string[] = [];

  if (plan.departmentStages.length === 0) {
    errors.push("no_stages");
  }

  const stageIds = new Set<string>();
  for (const stage of plan.departmentStages) {
    if (stageIds.has(stage.stageId)) errors.push(`duplicate_stage:${stage.stageId}`);
    stageIds.add(stage.stageId);

    try {
      assertDepartment(stage.department);
    } catch {
      errors.push(`unknown_department:${stage.department}`);
    }

    try {
      assertRole(stage.department, stage.specialistRole);
    } catch {
      errors.push(`unknown_role:${stage.department}.${stage.specialistRole}`);
    }

    if (!stage.outputKind) errors.push(`missing_output_kind:${stage.stageId}`);
    if (stage.budgetCents < 0) errors.push(`negative_budget:${stage.stageId}`);

    for (const cap of stage.allowedCapabilityClasses) {
      if (!getCapability(cap)) errors.push(`unknown_capability:${cap}`);
      else if (isBlockedCapability(cap) && stage.state !== "WAITING_CAPABILITY") {
        errors.push(`blocked_capability:${cap}`);
      }
    }
  }

  if (detectCycle(plan.departmentStages.map((s) => s.stageId), plan.dependencies)) {
    errors.push("cycle_detected");
  }

  for (const stage of plan.departmentStages) {
    for (const dep of stage.dependencies) {
      if (!stageIds.has(dep)) errors.push(`unknown_dependency:${stage.stageId}->${dep}`);
    }
  }

  return errors;
}

export function assertValidWorkforcePlan(plan: WorkforcePlan): WorkforcePlan {
  const errors = validateWorkforcePlan(plan);
  if (errors.length > 0) {
    throw new WorkforcePlanValidationError(errors[0]!, `Invalid workforce plan: ${errors.join(", ")}`);
  }
  return plan;
}
