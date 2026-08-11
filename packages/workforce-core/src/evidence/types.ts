export interface EvidenceReference {
  id: string;
  source: string;
  retrievedAtIso: string;
  summary: string;
  supportedClaims: readonly string[];
  confidence: "low" | "medium" | "high";
}

export class EvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

export function assertEvidenceForClaims(args: {
  claims: readonly string[];
  evidence: readonly EvidenceReference[];
  requireEvidenceForAllClaims?: boolean;
}): void {
  if (args.claims.length === 0) return;
  if (args.evidence.length === 0 && args.requireEvidenceForAllClaims) {
    throw new EvidenceValidationError("missing_required_evidence");
  }

  for (const claim of args.claims) {
    const supported = args.evidence.some((ev) => ev.supportedClaims.includes(claim));
    if (!supported && args.requireEvidenceForAllClaims) {
      throw new EvidenceValidationError(`claim_without_evidence:${claim}`);
    }
  }
}
