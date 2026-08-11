import type { DepartmentKey, EvidenceRequirement, RiskLevel } from "../departments/types.ts";

export interface SpecialistRoleDefinition {
  key: string;
  department: DepartmentKey;
  label: string;
  purpose: string;
  typicalInputs: readonly string[];
  typicalOutputs: readonly string[];
  requestableCapabilityClasses: readonly string[];
  riskLevel: RiskLevel;
  evidenceRequirement: EvidenceRequirement;
}

export function roleRegistryKey(department: string, role: string): string {
  return `${department}.${role}`;
}
