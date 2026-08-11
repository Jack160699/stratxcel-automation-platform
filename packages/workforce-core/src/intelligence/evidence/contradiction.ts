import type { EvidenceClaim, ScopedEvidenceRecord } from "../types.ts";
import { resolveClaimStatus, type EvidenceValidationContext } from "./model.ts";

export interface ContradictionFinding {
  claimA: string; claimB: string; evidenceIdsA: readonly string[]; evidenceIdsB: readonly string[];
  severity: "low" | "medium" | "high"; resolution: "prefer_first_party" | "mark_conflicting" | "research_required"; rationale: string;
}

const PAIRS: [RegExp, RegExp][] = [[/no website/i, /has website/i], [/high traffic/i, /low traffic/i], [/slow response/i, /fast response/i]];

export function detectContradictions(args: { claims: readonly EvidenceClaim[]; records: readonly ScopedEvidenceRecord[]; ctx: EvidenceValidationContext }): ContradictionFinding[] {
  const out: ContradictionFinding[] = [];
  for (let i = 0; i < args.claims.length; i++) {
    for (let j = i + 1; j < args.claims.length; j++) {
      const a = args.claims[i]!; const b = args.claims[j]!;
      if (!PAIRS.some(([x, y]) => (x.test(a.statement) && y.test(b.statement)) || (x.test(b.statement) && y.test(a.statement)))) continue;
      const ra = resolveClaimStatus({ statement: a.statement, requestedStatus: a.status, supportingRecords: args.records, ctx: args.ctx });
      const rb = resolveClaimStatus({ statement: b.statement, requestedStatus: b.status, supportingRecords: args.records, ctx: args.ctx });
      out.push({ claimA: a.statement, claimB: b.statement, evidenceIdsA: ra.evidenceIds, evidenceIdsB: rb.evidenceIds, severity: ra.evidenceIds.length && !rb.evidenceIds.length ? "low" : "high", resolution: ra.evidenceIds.length && !rb.evidenceIds.length ? "prefer_first_party" : "research_required", rationale: "Conflicting evidence-backed claims" });
    }
  }
  return out;
}

export function applyContradictionVerdicts(claims: readonly EvidenceClaim[], contradictions: readonly ContradictionFinding[]): EvidenceClaim[] {
  const bad = new Set(contradictions.flatMap((c) => [c.claimA, c.claimB]));
  return claims.map((c) => bad.has(c.statement) ? { ...c, qualityVerdict: "CONFLICTING" as const, status: c.status === "KNOWN" ? "DERIVED" : c.status } : c);
}
