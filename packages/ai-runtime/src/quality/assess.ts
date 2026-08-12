import type { AIExecutionResult, AIQualityAssessment, AITaskClass } from "../types.ts";

export interface QualityEvaluateInput {
  taskClass: AITaskClass;
  text: string;
  qualityTarget?: number;
  requireEvidence?: boolean;
  blockedPhrases?: readonly string[];
  factsChecksum?: string;
}

const DEFAULT_TARGETS: Partial<Record<AITaskClass, number>> = {
  ROUTING: 0.55,
  GENERAL_SPECIALIST: 0.65,
  CONTENT: 0.72,
  CONTENT_STRATEGY: 0.72,
  CREATIVE_TEXT: 0.72,
  RESEARCH: 0.78,
  SEO_RESEARCH: 0.78,
  STRATEGY: 0.8,
  EXECUTIVE: 0.8,
  PREMIUM_AUDIT: 0.85,
  BRAND_TRUST: 0.75,
  ANALYTICS: 0.75,
  REPORTING: 0.75,
  WEBSITE_ENGINEERING: 0.78,
  SALES_CONVERSION: 0.7,
};

/**
 * Lightweight heuristic quality gate — deterministic, mockable, no LLM.
 * Real product critics may plug in via override.
 */
export function assessQuality(input: QualityEvaluateInput): AIQualityAssessment {
  const reasons: string[] = [];
  let score = 0.5;
  const text = (input.text ?? "").trim();
  const target = input.qualityTarget ?? DEFAULT_TARGETS[input.taskClass] ?? 0.7;

  if (!text) {
    return { score: 0, decision: "FAIL", reasons: ["empty_output"] };
  }

  if (text.length >= 40) {
    score += 0.15;
  } else {
    reasons.push("too_short");
    score -= 0.1;
  }

  if (text.length >= 120) score += 0.05;

  if (/[.!?]/.test(text)) score += 0.05;
  else reasons.push("low_clarity");

  if (input.blockedPhrases?.some((p) => text.toLowerCase().includes(p.toLowerCase()))) {
    return { score: 0, decision: "FAIL", reasons: ["blocked_phrase"] };
  }

  if (input.requireEvidence || input.taskClass === "RESEARCH" || input.taskClass === "SEO_RESEARCH") {
    const hasUrl = /https?:\/\//i.test(text) || /source:/i.test(text) || /citation/i.test(text);
    if (hasUrl) score += 0.15;
    else {
      reasons.push("missing_evidence");
      score -= 0.2;
    }
  }

  if (input.taskClass === "STRATEGY" || input.taskClass === "EXECUTIVE") {
    if (/next step|recommend|priority|bottleneck|sequence/i.test(text)) score += 0.1;
    else reasons.push("weak_actionability");
  }

  if (input.taskClass === "WEBSITE_ENGINEERING") {
    if (/```|function |const |class |security|validation/i.test(text)) score += 0.1;
    else reasons.push("weak_engineering_signal");
  }

  if (input.taskClass === "CONTENT" || input.taskClass === "CREATIVE_TEXT") {
    if (text.split(/\s+/).length >= 12) score += 0.08;
  }

  score = Math.max(0, Math.min(1, score));
  const decision = score >= target ? "PASS" : "FAIL";
  if (decision === "FAIL" && reasons.length === 0) reasons.push("below_quality_target");
  return { score, decision, reasons };
}

export function shouldEscalateForQuality(
  assessment: AIQualityAssessment,
  escalationLevel: number,
  maxEscalations: number,
): boolean {
  return assessment.decision === "FAIL" && escalationLevel < maxEscalations;
}

export function attachQuality(
  result: AIExecutionResult,
  assessment: AIQualityAssessment,
): AIExecutionResult {
  return {
    ...result,
    qualityScore: assessment.score,
    qualityDecision: assessment.decision,
  };
}
