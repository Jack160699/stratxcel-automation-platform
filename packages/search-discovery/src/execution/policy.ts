/**
 * Search Action Policy & Entitlement Enforcement Guard
 */

export type ExecutionPolicyClassification = "SAFE" | "REVIEW_REQUIRED" | "BLOCKED";

export interface ActionSafetyEvaluation {
  classification: ExecutionPolicyClassification;
  reason: string;
  violations?: string[];
}

const BLOCKED_PATTERNS = [
  /fake\s+(?:[a-z0-9_-]+\s+)?(?:review|rating|testimonial|persona|credential|award|statistic|location|office|staff|doctor|attorney|case\s*study|pricing)/i,
  /fabricated\s+(?:[a-z0-9_-]+\s+)?(?:review|rating|testimonial|persona|credential|award|statistic|location|office|staff|citation|case\s*study|claim)/i,
  /buy\s+backlinks/i,
  /pbn\s+link/i,
  /keyword\s+stuffing/i,
  /hidden\s+text/i,
  /cloaking/i,
  /unauthorized\s+(?:post|publication|external|article|blast)/i,
  /deceptive\s+claim/i,
  /mass\s+(?:community|reddit|quora|forum)\s+posting/i,
  /manipulative\s+engagement/i,
  /unsupported\s+(?:medical|legal|financial)\s+claim/i,
  /unsupported\s+guarantee/i,
  /guarantee(?:d|s)?\s+(?:100%|top\s+ranking|first\s+page|revenue|cure|return|traffic)/i,
  /false\s+testimonial/i,
  /\bspam\b/i,
];


/**
 * Evaluates whether a proposed search action is SAFE, requires manual owner review, or is BLOCKED by platform policy.
 */
export function evaluateActionSafety(action: {
  actionKind?: string;
  proposedChange: string;
  targetUrl?: string;
  affectedQuery?: string;
}): ActionSafetyEvaluation {
  const textToCheck = `${action.actionKind ?? ""} ${action.proposedChange} ${action.targetUrl ?? ""} ${action.affectedQuery ?? ""}`;

  // 1. Check for blocked patterns / platform violations
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        classification: "BLOCKED",
        reason: "Proposed action violates StratXcel anti-spam and platform safety policies.",
        violations: [pattern.source],
      };
    }
  }

  // 2. Classify REVIEW_REQUIRED actions
  if (
    /create\s+page|new\s+landing\s+page|publish\s+article|delete\s+page|substantial\s+content\s+rewrite/i.test(
      action.proposedChange
    )
  ) {
    return {
      classification: "REVIEW_REQUIRED",
      reason: "Creating new pages or major content modifications requires business owner approval.",
    };
  }

  // 3. Classify SAFE actions
  return {
    classification: "SAFE",
    reason: "Deterministic metadata, structured JSON-LD schema, or technical SEO optimization.",
  };
}

export interface ExecutionPrecheckInput {
  tenantId: string;
  planTier: string;
  subscriptionStatus?: string;
  isActionApproved?: boolean;
  actionClass: string;
  proposedChange: string;
  connectorStatus?: {
    isHealthy: boolean;
    writeEnabled: boolean;
    cmsType?: string;
  };
  killSwitchActive?: boolean;
  targetDomainMatch?: boolean;
}

export interface ExecutionPrecheckResult {
  allowed: boolean;
  blockerCode?: string;
  blockerReason?: string;
}

/**
 * Capability-based execution precheck.
 * Evaluates subscription entitlement, connector health, authorization, target ownership, and policy.
 */
export function precheckSearchActionExecution(
  input: ExecutionPrecheckInput
): ExecutionPrecheckResult {
  // 1. Paid Entitlement Enforcement (Free tier strictly blocked)
  if (!input.planTier || input.planTier === "free" || input.subscriptionStatus !== "active") {
    return {
      allowed: false,
      blockerCode: "SUBSCRIPTION_REQUIRED",
      blockerReason: "Active Search Growth OS subscription (Starter, Growth, or Business) is required to execute actions live.",
    };
  }

  // 2. Kill Switch Check
  if (input.killSwitchActive) {
    return {
      allowed: false,
      blockerCode: "KILL_SWITCH_ACTIVE",
      blockerReason: "Search action execution is temporarily paused by platform operations kill switch.",
    };
  }

  // 3. Policy Classification Check
  const safety = evaluateActionSafety({ proposedChange: input.proposedChange });
  if (safety.classification === "BLOCKED") {
    return {
      allowed: false,
      blockerCode: "ACTION_POLICY_BLOCKED",
      blockerReason: safety.reason,
    };
  }

  // 4. Owner Authorization Check for Review-Required Actions
  if (
    (safety.classification === "REVIEW_REQUIRED" || input.actionClass === "approval_required") &&
    !input.isActionApproved
  ) {
    return {
      allowed: false,
      blockerCode: "APPROVAL_REQUIRED",
      blockerReason: "Action requires explicit business owner approval before live execution.",
    };
  }

  // 5. Connector Health & Write Permission Check
  if (!input.connectorStatus || !input.connectorStatus.isHealthy) {
    return {
      allowed: false,
      blockerCode: "CONNECTOR_UNHEALTHY",
      blockerReason: "Connected CMS / website integration is unreachable or unhealthy.",
    };
  }

  if (!input.connectorStatus.writeEnabled) {
    return {
      allowed: false,
      blockerCode: "CONNECTOR_READ_ONLY",
      blockerReason: "Connected CMS integration only has read permission. Enable write permission to mutate website content.",
    };
  }

  // 6. Target Domain Match Check
  if (input.targetDomainMatch === false) {
    return {
      allowed: false,
      blockerCode: "TARGET_DOMAIN_MISMATCH",
      blockerReason: "Target URL does not belong to the verified domain registered for this tenant.",
    };
  }

  return { allowed: true };
}
