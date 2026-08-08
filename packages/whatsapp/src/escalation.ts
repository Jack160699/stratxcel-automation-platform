export type EscalationReason =
  | "customer_requested_human"
  | "low_confidence"
  | "complaint_or_risk"
  | "billing_or_payment"
  | "repeated_low_confidence";

export interface EscalationCheck {
  shouldEscalate: boolean;
  reason: EscalationReason | null;
}

// Deliberately narrow, anchored-enough patterns — same false-positive-averse
// philosophy as isOptOutMessage: a missed escalation just continues normal
// (shadow-only) processing; an over-eager one would incorrectly hand every
// conversation to a human.
const HUMAN_REQUEST_PATTERNS = [/\b(talk|speak|connect) (to|with) (a |an )?(human|person|agent|someone|representative)\b/i, /\bcustomer (service|support|care)\b/i, /\breal person\b/i];
const COMPLAINT_PATTERNS = [/\b(complain|complaint|unacceptable|terrible|worst|scam|fraud|cheat(ed)?|lawyer|legal action|consumer court)\b/i];
const BILLING_PATTERNS = [/\b(refund|charged|overcharg|invoice|billing issue|payment (failed|not received|issue)|cancel (my )?subscription)\b/i];

/**
 * Deterministic, keyword-based — not an AI confidence score (no real AI
 * provider is configured; see packages/hermes). "Visibly derived from
 * actual conversation" per the task's own qualification rule: the reason
 * returned is always traceable to the specific pattern that matched, never
 * an opaque "AI decided."
 */
export function checkEscalation(input: { body: string; compilerMatched: boolean; consecutiveLowConfidenceCount?: number }): EscalationCheck {
  const trimmed = input.body.trim();

  if (HUMAN_REQUEST_PATTERNS.some((p) => p.test(trimmed))) {
    return { shouldEscalate: true, reason: "customer_requested_human" };
  }
  if (COMPLAINT_PATTERNS.some((p) => p.test(trimmed))) {
    return { shouldEscalate: true, reason: "complaint_or_risk" };
  }
  if (BILLING_PATTERNS.some((p) => p.test(trimmed))) {
    return { shouldEscalate: true, reason: "billing_or_payment" };
  }
  if ((input.consecutiveLowConfidenceCount ?? 0) >= 2 && !input.compilerMatched) {
    return { shouldEscalate: true, reason: "repeated_low_confidence" };
  }
  return { shouldEscalate: false, reason: null };
}
