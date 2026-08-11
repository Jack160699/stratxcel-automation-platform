const DEFAULT_UNSUPPORTED_PATTERNS = [
  /\bstudies show\b/i,
  /\bexperts agree\b/i,
  /\bresearch proves\b/i,
  /\bscientists say\b/i,
  /\bit is scientifically proven\b/i,
  /\bclinically proven\b/i,
] as const;

export interface ClaimGuardInput {
  content: string;
  evidenceIds?: readonly string[];
  unsupportedClaimPatterns?: readonly RegExp[];
}

export interface ClaimGuardResult {
  rejected: boolean;
  reasonCode: "unsupported_claim" | null;
  matchedPatterns: readonly string[];
}

export function auditGenericUnsupportedClaims(input: ClaimGuardInput): ClaimGuardResult {
  const patterns = input.unsupportedClaimPatterns ?? DEFAULT_UNSUPPORTED_PATTERNS;
  const hasEvidence = (input.evidenceIds?.length ?? 0) > 0;
  const matchedPatterns: string[] = [];

  for (const pattern of patterns) {
    if (pattern.test(input.content)) {
      matchedPatterns.push(pattern.source);
    }
  }

  if (matchedPatterns.length > 0 && !hasEvidence) {
    return {
      rejected: true,
      reasonCode: "unsupported_claim",
      matchedPatterns,
    };
  }

  return {
    rejected: false,
    reasonCode: null,
    matchedPatterns,
  };
}

export function rejectUnsupportedAuditClaims(input: ClaimGuardInput): void {
  const result = auditGenericUnsupportedClaims(input);
  if (result.rejected) {
    throw new Error("unsupported_claim_rejected");
  }
}
