
import type { ResearchClaim, ResearchRequest, ResearchResult, ResearchSource } from "./types.ts";
import { RESEARCH_BOUNDS } from "./types.ts";

export interface QualityGateInput {
  request: ResearchRequest;
  summary: string;
  claims: readonly ResearchClaim[];
  sources: readonly ResearchSource[];
  disagreements?: readonly string[];
}

export function evaluateResearchQuality(input: QualityGateInput): {
  pass: boolean;
  status: ResearchResult["status"];
  reasons: string[];
} {
  const reasons: string[] = [];
  const summary = input.summary.trim();
  const domainMatches = (domain: string, entry: string): boolean =>
    domain === entry || domain.endsWith(`.${entry}`);

  if (!summary || summary.length < 20) {
    reasons.push("empty_or_short_summary");
  }

  if (input.request.requireWebEvidence) {
    if (input.sources.length < 1) {
      reasons.push("require_web_evidence_zero_sources");
      reasons.push("INSUFFICIENT_PUBLIC_PRESENCE");
    }
    if (input.request.requiredDomains?.length) {
      for (const required of input.request.requiredDomains) {
        const covered = input.sources.some((s) => domainMatches(s.domain, required));
        if (!covered) reasons.push(`required_domain_missing:${required}`);
      }
    }
  }

  const uniqueDomains = new Set(input.sources.map((s) => s.domain.toLowerCase()));
  if (input.sources.length > 0 && (input.sources.length < 3 || uniqueDomains.size < 2)) {
    // Sparse presence is informational — not an automatic hard fail.
    reasons.push("INSUFFICIENT_PUBLIC_PRESENCE");
  }

  const uniqueUrls = new Set(input.sources.map((s) => s.canonicalUrl.toLowerCase()));
  if (input.sources.length > 0 && uniqueUrls.size === 0) {
    reasons.push("duplicate_only_evidence");
  }

  for (const source of input.sources) {
    if (!/^https?:\/\//i.test(source.url) || !source.domain) {
      reasons.push(`invalid_source_url:${source.id}`);
    }
  }

  if (input.request.requireClaimCitations) {
    const sourcedFacts = input.claims.filter((c) => c.statementKind === "sourced_fact");
    const unsupported = sourcedFacts.filter(
      (c) => c.sourceSupportStatus === "unsupported" || c.sourceIds.length === 0,
    );
    const partial = sourcedFacts.filter((c) => c.sourceSupportStatus === "partial");
    if (sourcedFacts.length > 0 && unsupported.length === sourcedFacts.length) {
      reasons.push("all_sourced_facts_unsupported");
    }
    if (unsupported.length > 0) {
      reasons.push(`unsupported_claims:${unsupported.length}`);
      reasons.push("UNSUPPORTED_MATERIAL_CLAIM");
      reasons.push("require_claim_citations_failed");
    }
    // Partially supported material claims must not silently pass.
    if (partial.length > 0) {
      reasons.push(`partially_supported_claims:${partial.length}`);
      reasons.push("UNSUPPORTED_MATERIAL_CLAIM");
      reasons.push("require_claim_citations_failed");
    }
  }

  if (input.sources.length > input.request.maxSources) {
    reasons.push("max_sources_exceeded");
  }

  if (summary.length > RESEARCH_BOUNDS.questionMax * 4) {
    reasons.push("summary_too_large");
  }

  const critical = reasons.some(
    (r) =>
      r === "require_web_evidence_zero_sources" ||
      r === "empty_or_short_summary" ||
      r === "all_sourced_facts_unsupported" ||
      r === "require_claim_citations_failed" ||
      r === "UNSUPPORTED_MATERIAL_CLAIM" ||
      r.startsWith("required_domain_missing:"),
  );

  // Zero public sources with required web evidence → insufficient presence, not a claim-support failure.
  if (reasons.includes("require_web_evidence_zero_sources")) {
    return { pass: false, status: "INSUFFICIENT_EVIDENCE", reasons };
  }

  if (critical || reasons.includes("empty_or_short_summary")) {
    return {
      pass: false,
      status: "FAILED",
      reasons,
    };
  }

  // Sparse public presence alone remains PASS so local/low-presence businesses can still audit.
  return { pass: true, status: "PASS", reasons };
}
