/**
 * Hard Brand Brain + Trust gate before READY FOR APPROVAL.
 * Extends legacy pillar/audience/product checks with blocked phrases,
 * forbidden claims, unsupported marketing claims, and shadow-aware capability truth.
 */

import { auditGenericUnsupportedClaims } from "@stratxcel/trust-department";
import type { ProductCapabilityEvidence } from "./capability-evidence.ts";

export type TrustGateDecision = "PASS" | "REVISE" | "BLOCK" | "HUMAN_REVIEW";

export interface TrustHardGateInput {
  caption: string;
  blockedPhrases?: readonly string[];
  forbiddenClaims?: readonly string[];
  /** Additional unsupported claim regex sources or literal phrases. */
  unsupportedClaimPhrases?: readonly string[];
  evidenceIds?: readonly string[];
  capabilityEvidence?: ProductCapabilityEvidence | null;
  /** When true, content is about Stratxcel itself. */
  isSelfMarketing?: boolean;
}

export interface TrustHardGateResult {
  decision: TrustGateDecision;
  reasons: string[];
  matchedBlockedPhrases: string[];
  matchedForbiddenClaims: string[];
  matchedUnsupportedClaims: string[];
}

/** Normalize for blocked-phrase matching: case, hyphens, punctuation, whitespace. */
export function normalizePhraseForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212\-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsNormalizedPhrase(haystack: string, needle: string): boolean {
  const h = normalizePhraseForMatch(haystack);
  const n = normalizePhraseForMatch(needle);
  if (!n) return false;
  // Word-boundary-ish: allow phrase as contiguous normalized tokens.
  return (` ${h} `).includes(` ${n} `);
}

const DEFAULT_UNSUPPORTED_LITERALS = [
  "zero manual errors",
  "primary bottleneck slowing your growth",
  "works 24/7",
  "guaranteed",
  "will increase revenue",
  "turn visitors into users and users into growth",
  "automatically publish your campaigns live",
  "already automatically publish",
] as const;

export function evaluateBrandTrustHardGate(input: TrustHardGateInput): TrustHardGateResult {
  const reasons: string[] = [];
  const matchedBlockedPhrases: string[] = [];
  const matchedForbiddenClaims: string[] = [];
  const matchedUnsupportedClaims: string[] = [];

  for (const phrase of input.blockedPhrases ?? []) {
    if (containsNormalizedPhrase(input.caption, phrase)) {
      matchedBlockedPhrases.push(phrase);
      reasons.push(`blocked_phrase:${phrase}`);
    }
  }

  for (const claim of input.forbiddenClaims ?? []) {
    if (containsNormalizedPhrase(input.caption, claim)) {
      matchedForbiddenClaims.push(claim);
      reasons.push(`forbidden_claim:${claim}`);
    }
  }

  const unsupportedLiterals = [
    ...DEFAULT_UNSUPPORTED_LITERALS,
    ...(input.unsupportedClaimPhrases ?? []),
  ];
  for (const claim of unsupportedLiterals) {
    if (containsNormalizedPhrase(input.caption, claim)) {
      matchedUnsupportedClaims.push(claim);
      reasons.push(`unsupported_claim:${claim}`);
    }
  }

  const claimGuard = auditGenericUnsupportedClaims({
    content: input.caption,
    evidenceIds: input.evidenceIds,
  });
  if (claimGuard.rejected) {
    matchedUnsupportedClaims.push(...claimGuard.matchedPatterns);
    reasons.push("unsupported_claim:generic_pattern");
  }

  if (input.isSelfMarketing && input.capabilityEvidence) {
    const ev = input.capabilityEvidence;
    const livePublishClaim =
      /\b(?:automatically\s+publish|publish(?:es|ing)?\s+(?:your\s+)?(?:campaigns?\s+)?live|live\s+24\s*\/?\s*7|already\s+(?:live|publishing))\b/i.test(
        input.caption,
      );
    if (livePublishClaim) {
      if (ev.shadowMode || ev.dryRun || ev.socialPublishExecutable !== true) {
        matchedUnsupportedClaims.push("misleading_live_publish_claim");
        reasons.push("shadow_aware_claim:live_publish_not_truthful");
      }
    }
    if (/\bimage\s+generat/i.test(input.caption) && ev.imageGenerationStatus !== "OPERATIONAL") {
      matchedUnsupportedClaims.push("image_generation_live_claim");
      reasons.push("capability_claim:image_generation_not_live");
    }
    if (/\bwhatsapp\b/i.test(input.caption) && /\b(?:send|live|configured)\b/i.test(input.caption) && ev.whatsappSendStatus !== "OPERATIONAL") {
      matchedUnsupportedClaims.push("whatsapp_live_claim");
      reasons.push("capability_claim:whatsapp_not_live");
    }
  }

  if (matchedBlockedPhrases.length || matchedForbiddenClaims.length) {
    return {
      decision: "BLOCK",
      reasons,
      matchedBlockedPhrases,
      matchedForbiddenClaims,
      matchedUnsupportedClaims,
    };
  }

  if (matchedUnsupportedClaims.length) {
    return {
      decision: input.evidenceIds?.length ? "HUMAN_REVIEW" : "REVISE",
      reasons,
      matchedBlockedPhrases,
      matchedForbiddenClaims,
      matchedUnsupportedClaims,
    };
  }

  return {
    decision: "PASS",
    reasons: [],
    matchedBlockedPhrases,
    matchedForbiddenClaims,
    matchedUnsupportedClaims,
  };
}

export function trustDecisionToReviewStatus(decision: TrustGateDecision): "PASS" | "REVISE" | "BLOCK" | "PENDING" {
  if (decision === "PASS") return "PASS";
  if (decision === "BLOCK") return "BLOCK";
  if (decision === "HUMAN_REVIEW" || decision === "REVISE") return "REVISE";
  return "PENDING";
}

/** Approval UI must not show Approve when Trust hard-failed. */
export function canShowApprovalControl(decision: TrustGateDecision): boolean {
  return decision === "PASS";
}
