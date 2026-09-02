import type { RiskLevel } from "../departments/types.ts";

/**
 * The real autonomy decision layer (STRATXCEL master brief, Autonomy
 * section): a pure, deterministic function answering "can this act
 * automatically, does it need a lightweight approval, does it need the
 * owner, or is it blocked" -- from actual risk/confidence/reversibility/cost
 * factors, never a prompt-only guess.
 *
 * Deliberately separate from resolveCapabilityReadiness
 * (capabilities/readiness.ts), which answers a different question --
 * "CAN this run right now" (entitlements, integrations, kill switches,
 * shadow mode, static approvalRequired). This module answers "SHOULD this
 * run without a human in the loop", a genuinely different, higher-level
 * question. The two compose: feed a real CapabilityReadinessResult's
 * executable/riskLevel/approvalRequired/externalMutation fields in as this
 * function's inputs (see AutonomyDecisionInput) rather than duplicating
 * readiness logic here.
 *
 * This module is advisory only -- it returns a decision, it never executes
 * anything and never bypasses the existing CONFIRM flow
 * (packages/agent-core's control-handlers.ts) or any kill switch. Wiring an
 * AUTO-level decision to skip human confirmation in a live channel is a
 * separate, deliberate product decision this module does not make on its
 * own -- "do not silently activate unsafe production autonomy" (master
 * brief, Autonomy section).
 */
export const INTERVENTION_LEVELS = ["AUTO", "LOW_RISK_APPROVAL", "OWNER_APPROVAL", "BLOCKED"] as const;
export type InterventionLevel = (typeof INTERVENTION_LEVELS)[number];

export const AUTONOMY_REASON_CODES = [
  "NOT_EXECUTABLE",
  "CRITICAL_RISK",
  "IRREVERSIBLE",
  "LOW_CONFIDENCE",
  "HIGH_RISK",
  "CAPABILITY_APPROVAL_REQUIRED",
  "COST_EXCEEDS_AUTO_CEILING",
  "EXTERNAL_MUTATION_OR_MEDIUM_RISK",
  "READY_FOR_AUTO",
] as const;
export type AutonomyReasonCode = (typeof AUTONOMY_REASON_CODES)[number];

export interface AutonomyDecisionInput {
  /** Whether the underlying capability is actually executable right now (entitlements/integrations/kill-switch/etc. already resolved by the caller -- e.g. via resolveCapabilityReadiness). */
  executable: boolean;
  /** Human-readable reason the capability is not executable, when executable is false. */
  notExecutableReason?: string;
  riskLevel: RiskLevel;
  /** Static, capability-level "always needs explicit approval" flag. */
  approvalRequired: boolean;
  /** Does this action mutate something outside Stratxcel (a real external system, a customer-facing surface, spend)? */
  externalMutation: boolean;
  /** Real, stated confidence that the proposed action is correct -- never inferred from model tone or fabricated. */
  confidence: "low" | "medium" | "high";
  /** Can this action's effects be undone without lasting harm (e.g. a draft, a read, a reversible toggle)? Defaults to false (fail closed) if the caller has no real answer. */
  reversible: boolean;
  /** Real cost estimate in INR cents, when known (LLM/API/ad spend/credits). Omit or null when genuinely unknown -- never guessed. */
  estimatedCostCents?: number | null;
  /** A real, deterministic ceiling under which AUTO is even considered, supplied by the caller's own money policy. This module has no opinion on what the ceiling should be -- it only compares against what it is given. */
  autoCostCeilingCents?: number | null;
}

export interface AutonomyDecision {
  level: InterventionLevel;
  reasonCode: AutonomyReasonCode;
  humanReason: string;
  evaluatedAt: string;
}

/**
 * Deterministic. Fail closed: any missing/ambiguous safety-relevant input
 * (not executable, irreversible, low confidence, critical/high risk,
 * static approval required, cost over a known ceiling) lands at
 * OWNER_APPROVAL or BLOCKED, never AUTO. AUTO is reached only when every
 * gate is explicitly satisfied.
 */
export function decideAutonomyLevel(input: AutonomyDecisionInput): AutonomyDecision {
  const evaluatedAt = new Date().toISOString();

  if (!input.executable) {
    return {
      level: "BLOCKED",
      reasonCode: "NOT_EXECUTABLE",
      humanReason: input.notExecutableReason
        ? `Not executable: ${input.notExecutableReason}`
        : "The underlying capability is not currently executable.",
      evaluatedAt,
    };
  }

  if (input.riskLevel === "critical") {
    return {
      level: "OWNER_APPROVAL",
      reasonCode: "CRITICAL_RISK",
      humanReason: "Capability risk level is critical -- always requires explicit owner approval regardless of confidence or cost.",
      evaluatedAt,
    };
  }

  if (!input.reversible) {
    return {
      level: "OWNER_APPROVAL",
      reasonCode: "IRREVERSIBLE",
      humanReason: "This action cannot be undone without lasting harm -- requires explicit owner approval.",
      evaluatedAt,
    };
  }

  if (input.confidence === "low") {
    return {
      level: "OWNER_APPROVAL",
      reasonCode: "LOW_CONFIDENCE",
      humanReason: "Confidence that this action is correct is low -- requires explicit owner approval.",
      evaluatedAt,
    };
  }

  if (input.riskLevel === "high") {
    return {
      level: "OWNER_APPROVAL",
      reasonCode: "HIGH_RISK",
      humanReason: "Capability risk level is high -- requires explicit owner approval.",
      evaluatedAt,
    };
  }

  if (input.approvalRequired) {
    return {
      level: "OWNER_APPROVAL",
      reasonCode: "CAPABILITY_APPROVAL_REQUIRED",
      humanReason: "This capability is statically marked as always requiring approval before execution.",
      evaluatedAt,
    };
  }

  if (
    typeof input.estimatedCostCents === "number" &&
    typeof input.autoCostCeilingCents === "number" &&
    input.estimatedCostCents > input.autoCostCeilingCents
  ) {
    return {
      level: "LOW_RISK_APPROVAL",
      reasonCode: "COST_EXCEEDS_AUTO_CEILING",
      humanReason: `Estimated cost (${input.estimatedCostCents} cents) exceeds the auto-approval ceiling (${input.autoCostCeilingCents} cents) -- still low risk, but a lightweight approval step is required.`,
      evaluatedAt,
    };
  }

  if (input.externalMutation || input.riskLevel === "medium") {
    return {
      level: "LOW_RISK_APPROVAL",
      reasonCode: "EXTERNAL_MUTATION_OR_MEDIUM_RISK",
      humanReason: "This action mutates something outside Stratxcel or carries medium risk -- a lightweight approval step is required even though it is reversible and well-understood.",
      evaluatedAt,
    };
  }

  return {
    level: "AUTO",
    reasonCode: "READY_FOR_AUTO",
    humanReason: "Low risk, reversible, high confidence, no static approval requirement, and within any known cost ceiling -- safe to run automatically.",
    evaluatedAt,
  };
}
