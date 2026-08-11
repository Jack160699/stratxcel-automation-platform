export type HandoffQualityStatus = "PASS" | "REVISE" | "REJECT" | "not_reviewed";

export interface DepartmentHandoff {
  id: string;
  tenantId: string;
  missionId: string;
  planId: string;
  fromStage: string;
  toStage: string;
  objective: string;
  artifactIds: readonly string[];
  evidenceIds: readonly string[];
  decisions: readonly string[];
  unresolvedQuestions: readonly string[];
  constraints: readonly string[];
  qualityStatus: HandoffQualityStatus;
  createdAtIso: string;
}

export interface CreateDepartmentHandoffInput {
  tenantId: string;
  missionId: string;
  planId: string;
  fromStage: string;
  toStage: string;
  objective: string;
  artifactIds: readonly string[];
  evidenceIds: readonly string[];
  decisions: readonly string[];
  unresolvedQuestions: readonly string[];
  constraints: readonly string[];
  qualityStatus: HandoffQualityStatus;
}

export function createDepartmentHandoff(input: CreateDepartmentHandoffInput): DepartmentHandoff {
  if (input.fromStage === input.toStage) {
    throw new Error("handoff_same_stage");
  }
  return {
    id: crypto.randomUUID(),
    ...input,
    createdAtIso: new Date().toISOString(),
  };
}
