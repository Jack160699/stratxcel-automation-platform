export const DEPARTMENT_KEYS = [
  "executive",
  "strategy",
  "research",
  "brand",
  "creative",
  "content",
  "media",
  "social",
  "seo",
  "website",
  "advertising",
  "growth",
  "sales",
  "crm",
  "whatsapp",
  "conversion",
  "analytics",
  "reporting",
  "optimization",
  "quality",
  "compliance",
  "customer_success",
  "operations",
  "engineering",
  "finance",
] as const;

export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type EvidenceRequirement = "none" | "recommended" | "required";
export type ReleaseClassification = "foundation" | "beta" | "stable";

export interface SpecialistRoleRef {
  key: string;
  label: string;
  purpose: string;
}

export interface DepartmentDefinition {
  key: DepartmentKey;
  label: string;
  mission: string;
  responsibilities: readonly string[];
  specialistRoles: readonly SpecialistRoleRef[];
  acceptedInputArtifactClasses: readonly string[];
  outputArtifactClasses: readonly string[];
  defaultQualityGates: readonly string[];
  requestableCapabilityClasses: readonly string[];
  riskLevel: RiskLevel;
  externalMutationEverPermitted: boolean;
  defaultMaxRevisionCount: number;
  defaultEvidenceRequirement: EvidenceRequirement;
  releaseClassification: ReleaseClassification;
}

export function isDepartmentKey(key: string): key is DepartmentKey {
  return (DEPARTMENT_KEYS as readonly string[]).includes(key);
}
