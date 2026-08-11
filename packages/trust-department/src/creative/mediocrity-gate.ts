import type { QaCheckResult } from "../types.ts";

export interface MediocrityGateInput {
  content: string;
  originalityScore?: number;
  clarityScore?: number;
  strategicFitScore?: number;
}

const GENERIC_PHRASES = [
  "in today's fast-paced world",
  "look no further",
  "best in class",
  "synergy",
  "game changer",
  "take your business to the next level",
  "we are passionate about",
] as const;

export function scoreMediocrity(input: MediocrityGateInput): number {
  const content = input.content.toLowerCase();
  let penalty = 0;

  for (const phrase of GENERIC_PHRASES) {
    if (content.includes(phrase)) penalty += 12;
  }

  const originality = input.originalityScore ?? 70;
  const clarity = input.clarityScore ?? 70;
  const strategic = input.strategicFitScore ?? 70;

  const composite = (originality + clarity + strategic) / 3 - penalty;
  return Math.max(0, Math.min(100, composite));
}

export function checkCreativeMediocrity(input: MediocrityGateInput): QaCheckResult {
  const score = scoreMediocrity(input);
  const findings: QaCheckResult["findings"][number][] = [];

  if (score < 55) {
    findings.push({
      kind: "creative",
      severity: "block",
      reasonCode: "mediocrity",
      message: "Creative output is generic or mediocre and cannot proceed",
    });
  }

  return {
    reviewerDepartment: "quality",
    reviewerRole: "creative_critic",
    findings,
    suggestedDecision: findings.length > 0 ? "BLOCK" : "PASS",
  };
}

export function rejectMediocreCreative(input: MediocrityGateInput): void {
  const result = checkCreativeMediocrity(input);
  if (result.suggestedDecision === "BLOCK") {
    throw new Error("mediocre_creative_rejected");
  }
}
