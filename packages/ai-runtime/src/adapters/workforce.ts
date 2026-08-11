import type { AIBudgetEnvelope, AITaskClass } from "../types.ts";
import { resolveDepartmentTaskClass } from "../policy/department-map.ts";
import { getTaskPolicy } from "../policy/task-policies.ts";

/**
 * Workforce specialist routing metadata.
 * Planner may recommend a workload class; the server-side router remains authoritative.
 * Child specialists may NARROW but never widen budget/scope.
 */
export interface SpecialistRoutingExtension {
  taskClass: AITaskClass;
  qualityTarget?: number;
  routingPolicyTaskClass: AITaskClass;
  budgetEnvelope?: AIBudgetEnvelope;
}

export function buildSpecialistRouting(args: {
  department: string;
  hint?: "operations" | "creation" | "strategy" | "media" | "brand_trust" | "ad_copy";
  qualityTarget?: number;
  budgetEnvelope?: AIBudgetEnvelope;
  /** Child may only narrow parent's task class cost profile — never escalate to frontier unilaterally. */
  parentTaskClass?: AITaskClass;
}): SpecialistRoutingExtension {
  let taskClass = resolveDepartmentTaskClass(args.department, args.hint);
  if (args.parentTaskClass) {
    taskClass = narrowerTaskClass(args.parentTaskClass, taskClass);
  }
  return {
    taskClass,
    qualityTarget: args.qualityTarget,
    routingPolicyTaskClass: taskClass,
    budgetEnvelope: args.budgetEnvelope,
  };
}

const COST_RANK: Record<AITaskClass, number> = {
  ROUTING: 1,
  GENERAL_SPECIALIST: 2,
  TRANSCRIPTION: 2,
  VOICE: 2,
  BRAND_TRUST: 3,
  CONTENT: 4,
  CONTENT_STRATEGY: 4,
  CREATIVE_TEXT: 4,
  SALES_CONVERSION: 4,
  IMAGE: 4,
  VIDEO: 5,
  ANALYTICS: 5,
  REPORTING: 5,
  SEO_RESEARCH: 6,
  RESEARCH: 6,
  WEBSITE_ENGINEERING: 7,
  STRATEGY: 8,
  EXECUTIVE: 9,
  PREMIUM_AUDIT: 10,
};

function narrowerTaskClass(parent: AITaskClass, child: AITaskClass): AITaskClass {
  if ((COST_RANK[child] ?? 99) > (COST_RANK[parent] ?? 99)) {
    return parent;
  }
  return child;
}

export function recommendTaskClassForPlanner(department: string): AITaskClass {
  return resolveDepartmentTaskClass(department);
}

/** Planner must not authorize expensive models directly — returns policy name only. */
export function plannerModelAuthorityNote(department: string): {
  recommendedTaskClass: AITaskClass;
  primaryModelHint: string;
  authoritative: "ai_runtime_router";
} {
  const taskClass = recommendTaskClassForPlanner(department);
  const policy = getTaskPolicy(taskClass);
  return {
    recommendedTaskClass: taskClass,
    primaryModelHint: policy.candidates[0]?.model ?? "unresolved",
    authoritative: "ai_runtime_router",
  };
}
