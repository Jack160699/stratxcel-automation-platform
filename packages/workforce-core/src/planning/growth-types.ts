import type { KnowledgeClaimStatus } from "./knowledge.ts";

export type CustomerEntryMode =
  | "AUDIT_ONLY"
  | "NEW_BUSINESS"
  | "EXISTING_BUSINESS"
  | "ACTIVE_PACKAGE_CUSTOMER"
  | "EXISTING_CUSTOMER_RENEWAL";

export type DiagnosticDomain =
  | "brand"
  | "market_positioning"
  | "audience"
  | "offer"
  | "website"
  | "search_seo"
  | "content"
  | "media_quality"
  | "social_presence"
  | "paid_acquisition"
  | "lead_capture"
  | "crm"
  | "whatsapp_response"
  | "sales_process"
  | "conversion"
  | "retention"
  | "analytics_attribution"
  | "reporting"
  | "operations";

export type DiagnosticFindingStatus = KnowledgeClaimStatus;
export type DiagnosticSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface BusinessGrowthDiagnosisFinding {
  domain: DiagnosticDomain;
  finding: string;
  status: DiagnosticFindingStatus;
  severity: DiagnosticSeverity;
  opportunityLevel: "none" | "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  evidenceIds: readonly string[];
  businessImpact: string;
  recommendedActionClass: string;
}

export interface BusinessGrowthDiagnosis {
  entryMode: CustomerEntryMode;
  executiveSummary: string;
  strongestAssets: readonly string[];
  findings: readonly BusinessGrowthDiagnosisFinding[];
  researchGaps: readonly string[];
  generatedAtIso: string;
}

export type GrowthBottleneckCode =
  | "LOW_DISCOVERY"
  | "WEAK_SEARCH_VISIBILITY"
  | "WEAK_WEBSITE_CONVERSION"
  | "LOW_CONTENT_QUALITY"
  | "INSUFFICIENT_DEMAND"
  | "POOR_LEAD_CAPTURE"
  | "SLOW_LEAD_RESPONSE"
  | "WEAK_FOLLOW_UP"
  | "LOW_QUALIFICATION"
  | "LOW_CLOSE_RATE"
  | "MISSING_ATTRIBUTION"
  | "MISSING_DIGITAL_FOUNDATION"
  | "WEAK_BRAND_POSITIONING"
  | "CUSTOM";

export interface GrowthBottleneck {
  id: string;
  code: GrowthBottleneckCode;
  domain: DiagnosticDomain;
  description: string;
  evidenceIds: readonly string[];
  severity: DiagnosticSeverity;
  estimatedImpactClass: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  upstreamDependencies: readonly string[];
  downstreamEffects: readonly string[];
  priorityScore: number;
  status: "open" | "addressed" | "monitoring" | "deferred";
}

export type CommercialFitKind =
  | "SMALLEST_COVERING_OPTION"
  | "CUSTOM_RECOMMENDATION"
  | "NO_CHANGE_NEEDED"
  | "SETUP_REQUIRED";

export interface GrowthRecommendation {
  id: string;
  bottleneckId: string;
  problemAddressed: string;
  recommendedServiceOrCapability: string;
  reason: string;
  supportingEvidenceIds: readonly string[];
  /** Outcome CLASS language only — never guaranteed revenue/ROAS/rankings. */
  expectedBusinessOutcomeClass: string;
  priority: number;
  dependency?: string;
  entitlementRequirement: string | null;
  currentAvailability: "AVAILABLE" | "PLANNED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "NOT_PURCHASED";
  suggestedPlanOrServiceTier?: string | null;
}

export interface PlanRecommendation {
  id: string;
  commercialFit: CommercialFitKind;
  recommendedOption: string;
  reason: string;
  coveringBottleneckIds: readonly string[];
  supportingEvidenceIds: readonly string[];
  /** Soft language only. */
  outcomeLanguage: string;
  doNotActivateSubscription: true;
}
