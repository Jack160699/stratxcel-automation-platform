/**
 * Autonomous generate -> score -> diagnose -> regenerate loop (build brief
 * Phase E). Deterministic and provider-agnostic: `generate` is injected by
 * the caller, so this module -- and its full retry/correction behavior --
 * is testable with a fake generator and needs no live AI credentials.
 *
 * Not "simply retry the same generation" (explicitly disallowed by the
 * brief): every failed attempt produces SPECIFIC corrective instructions
 * from its hard-failure reasons, accumulated across attempts, and handed
 * back to the caller's `generate` function so the next prompt actually
 * targets what was wrong -- never a blind retry of an identical prompt.
 */

import { scoreGeneratedContent, type QualityScoreInput, type QualityScoreResult, type QualityFailureReason } from "./quality-score.ts";

export const DEFAULT_MAX_ATTEMPTS = 3;

const CORRECTIVE_INSTRUCTION: Record<QualityFailureReason, (detail: string) => string> = {
  GENERIC_COPY: () => "Increase the use of verified business-specific details and remove generic promotional wording.",
  LOW_BUSINESS_SPECIFICITY: () => "Increase the use of verified business-specific details and remove generic promotional wording.",
  UNSUPPORTED_FACT: (detail) => `Remove this specific claim, which is not in the verified business facts: ${detail}. Never invent a fact.`,
  PLACEHOLDER_DETECTED: () => "Remove all placeholder or template scaffolding text and write real, finished copy.",
  DUPLICATE_CONCEPT: () => "Choose a new content pillar and creative concept not used in recent tenant content.",
  WEAK_CTA: () => "Add a specific, actionable call-to-action appropriate to the business (e.g. book, visit, order, call, enquire).",
  LOW_INDUSTRY_RELEVANCE: () => "Use language and details specific to this industry and this business, not generic service language.",
  BRAND_CONTEXT_MISSING: () => "Required brand/business context is missing for this generation -- this cannot be corrected by rewriting; check the input pipeline.",
  MALFORMED_STRUCTURE: () => "Return a complete, valid response with every required field populated.",
  FORBIDDEN_CLAIM: (detail) => `Remove this phrase, which is forbidden by brand rules: ${detail}.`,
};

/** A failure reason that no amount of rewriting the copy can fix -- retrying
 * with a corrective instruction is pointless and wastes an AI call. */
const NON_CORRECTABLE_REASONS = new Set<QualityFailureReason>(["BRAND_CONTEXT_MISSING"]);

export function correctiveInstructionsFor(result: QualityScoreResult): string[] {
  return result.hardFailures.map((failure) => CORRECTIVE_INSTRUCTION[failure.reason](failure.detail));
}

export interface GenerationAttemptRecord {
  attempt: number;
  passed: boolean;
  score: number;
  hardFailureReasons: QualityFailureReason[];
  correctiveInstructions: string[];
  /** Set when `generate()` itself threw (a provider/network error, not a
   * quality-gate failure) -- every other field is a zeroed placeholder for
   * this record. Self-Critique Q9 ("can it fail silently?"): this exists so
   * a mid-loop provider error still surfaces the full attempt history
   * instead of an uncaught throw silently discarding what earlier attempts
   * already diagnosed. */
  generationError?: string;
}

export interface GenerationLoopResult<T> {
  success: boolean;
  content: T | null;
  scoreResult: QualityScoreResult | null;
  attempts: GenerationAttemptRecord[];
  /** Specific, diagnosable -- never "quality gate failed" -- populated only when success is false. */
  finalReason: string | null;
}

export interface GenerationLoopInput<T> {
  maxAttempts?: number;
  /** Produces one candidate given the corrective instructions accumulated
   * from all prior failed attempts (empty on the first attempt). */
  generate: (correctiveInstructions: string[]) => Promise<T>;
  /** Turns a generated candidate into scorer input -- kept separate from
   * `generate` so callers can score without re-deriving business context. */
  toScoreInput: (content: T) => QualityScoreInput;
}

export async function runGenerationLoop<T>(input: GenerationLoopInput<T>): Promise<GenerationLoopResult<T>> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attempts: GenerationAttemptRecord[] = [];
  const accumulatedInstructions: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let content: T;
    try {
      content = await input.generate([...accumulatedInstructions]);
    } catch (err) {
      // A provider/network failure, not a quality-gate failure -- stop here
      // rather than retrying blindly, but preserve every diagnostic already
      // collected instead of letting this throw discard them uncaught.
      const message = err instanceof Error ? err.message : "generation call failed";
      attempts.push({ attempt, passed: false, score: 0, hardFailureReasons: [], correctiveInstructions: [], generationError: message });
      return {
        success: false,
        content: null,
        scoreResult: null,
        attempts,
        finalReason: `generation call failed on attempt ${attempt}/${maxAttempts}: ${message}`,
      };
    }
    const scoreResult = scoreGeneratedContent(input.toScoreInput(content));
    const hardFailureReasons = scoreResult.hardFailures.map((f) => f.reason);
    const correctiveInstructions = correctiveInstructionsFor(scoreResult);
    attempts.push({ attempt, passed: scoreResult.passed, score: scoreResult.score, hardFailureReasons, correctiveInstructions });

    if (scoreResult.passed) {
      return { success: true, content, scoreResult, attempts, finalReason: null };
    }

    // A non-correctable failure (e.g. missing brand context) means every
    // further attempt would fail identically -- stop immediately instead of
    // burning the remaining attempt budget on retries that cannot succeed.
    if (hardFailureReasons.some((reason) => NON_CORRECTABLE_REASONS.has(reason))) {
      return {
        success: false,
        content: null,
        scoreResult,
        attempts,
        finalReason: scoreResult.diagnostics.filter((d) => d.startsWith("[")).join(" ") || "generation failed a non-correctable quality gate",
      };
    }

    accumulatedInstructions.push(...correctiveInstructions);
  }

  const last = attempts[attempts.length - 1];
  return {
    success: false,
    content: null,
    scoreResult: null,
    attempts,
    finalReason: `exhausted ${maxAttempts} attempts; last attempt failed: ${last.hardFailureReasons.join(", ") || `score ${last.score} below threshold`}`,
  };
}
