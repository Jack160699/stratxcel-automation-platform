export type KnowledgeClaimStatus = "KNOWN" | "DERIVED" | "ASSUMPTION" | "RESEARCH_REQUIRED";

export interface KnowledgeClaim {
  claim: string;
  status: KnowledgeClaimStatus;
  evidenceIds?: readonly string[];
}
