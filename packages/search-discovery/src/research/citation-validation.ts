import type { ResearchClaim, ResearchSource, SourceSupportStatus } from "./types.ts";

export function validateClaimSourceMapping(args: {
  claims: readonly ResearchClaim[];
  sources: readonly ResearchSource[];
  requireClaimCitations: boolean;
}): {
  claims: ResearchClaim[];
  unsupportedCount: number;
  unknownSourceRefs: number;
} {
  const sourceIds = new Set(args.sources.map((s) => s.id));
  let unsupportedCount = 0;
  let unknownSourceRefs = 0;

  const claims: ResearchClaim[] = args.claims.map((claim) => {
    const validIds = claim.sourceIds.filter((id) => {
      if (!sourceIds.has(id)) {
        unknownSourceRefs += 1;
        return false;
      }
      return true;
    });

    let status: SourceSupportStatus = claim.sourceSupportStatus;
    if (validIds.length === 0) {
      status = "unsupported";
      unsupportedCount += 1;
    } else if (status === "unsupported") {
      status = "supported";
    }

    return {
      ...claim,
      sourceIds: validIds,
      sourceSupportStatus: status,
      confidence: claim.confidence ?? null,
    };
  });

  if (args.requireClaimCitations) {
    for (const claim of claims) {
      if (claim.statementKind === "sourced_fact" && claim.sourceIds.length === 0) {
        claim.sourceSupportStatus = "unsupported";
      }
    }
  }

  return { claims, unsupportedCount, unknownSourceRefs };
}

export function detectConflictingClaims(
  claims: readonly ResearchClaim[],
): readonly string[] {
  const disagreements: string[] = [];
  const byTopic = new Map<string, ResearchClaim[]>();
  for (const claim of claims) {
    const key = claim.text.slice(0, 40).toLowerCase();
    const list = byTopic.get(key) ?? [];
    list.push(claim);
    byTopic.set(key, list);
  }
  for (const group of byTopic.values()) {
    if (group.length < 2) continue;
    const statuses = new Set(group.map((c) => c.sourceSupportStatus));
    if (statuses.has("conflicting") || group.length > 1) {
      // Only flag when explicitly marked conflicting or texts diverge meaningfully.
      const texts = new Set(group.map((c) => c.text.trim().toLowerCase()));
      if (texts.size > 1) {
        disagreements.push(
          `Sources disagree on related claims: ${group.map((c) => c.id).join(", ")}`,
        );
      }
    }
  }
  return disagreements;
}
