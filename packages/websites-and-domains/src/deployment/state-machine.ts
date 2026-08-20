/**
 * Deployment State Machine — explicit, machine-readable states for the
 * complete website deployment lifecycle. Every transition is validated;
 * invalid transitions are rejected rather than silently accepted.
 *
 * States:
 *   PROJECT_CREATED → SPEC_GENERATED → SITE_GENERATED → PREVIEW_DEPLOYED
 *   → CUSTOMER_APPROVED → PAYMENT_CONFIRMED → DOMAIN_REGISTERED
 *   → HOSTING_CREATED → DNS_CONFIGURED → SSL_READY
 *   → PRODUCTION_DEPLOYED → QA_PASSED → LIVE
 *
 * Failure from any state transitions to FAILED.
 * FAILED can transition back to the state it failed from (retry).
 */

export type DeploymentState =
  | "PROJECT_CREATED"
  | "SPEC_GENERATED"
  | "SITE_GENERATED"
  | "PREVIEW_DEPLOYED"
  | "CUSTOMER_APPROVED"
  | "PAYMENT_CONFIRMED"
  | "DOMAIN_REGISTERED"
  | "HOSTING_CREATED"
  | "DNS_CONFIGURED"
  | "SSL_READY"
  | "PRODUCTION_DEPLOYED"
  | "QA_PASSED"
  | "LIVE"
  | "FAILED"
  | "SUSPENDED";

export interface StateTransition {
  from: DeploymentState;
  to: DeploymentState;
  action: string;
  requiresPayment?: boolean;
  requiresCustomerApproval?: boolean;
  isAsync?: boolean;
  retryable?: boolean;
}

/**
 * Canonical transition table. The "from → to" pairs are the ONLY valid
 * transitions. Anything not listed here is rejected.
 */
const TRANSITIONS: readonly StateTransition[] = [
  { from: "PROJECT_CREATED",     to: "SPEC_GENERATED",     action: "generate_spec" },
  { from: "SPEC_GENERATED",      to: "SITE_GENERATED",     action: "generate_site" },
  { from: "SITE_GENERATED",      to: "PREVIEW_DEPLOYED",   action: "deploy_preview",              isAsync: true, retryable: true },
  { from: "PREVIEW_DEPLOYED",    to: "CUSTOMER_APPROVED",  action: "customer_approve",             requiresCustomerApproval: true },
  { from: "CUSTOMER_APPROVED",   to: "PAYMENT_CONFIRMED",  action: "confirm_payment",              requiresPayment: true },
  { from: "PAYMENT_CONFIRMED",   to: "DOMAIN_REGISTERED",  action: "register_domain",              isAsync: true, retryable: true },
  { from: "DOMAIN_REGISTERED",   to: "HOSTING_CREATED",    action: "create_hosting",               isAsync: true, retryable: true },
  { from: "HOSTING_CREATED",     to: "DNS_CONFIGURED",     action: "configure_dns",                isAsync: true, retryable: true },
  { from: "DNS_CONFIGURED",      to: "SSL_READY",          action: "verify_ssl",                   isAsync: true, retryable: true },
  { from: "SSL_READY",           to: "PRODUCTION_DEPLOYED", action: "deploy_production",            isAsync: true, retryable: true },
  { from: "PRODUCTION_DEPLOYED", to: "QA_PASSED",          action: "run_qa",                       isAsync: true, retryable: true },
  { from: "QA_PASSED",           to: "LIVE",               action: "publish" },
  // Skip-domain path: customer approves without a custom domain
  { from: "CUSTOMER_APPROVED",   to: "HOSTING_CREATED",    action: "skip_domain_create_hosting",   isAsync: true, retryable: true },
  { from: "PAYMENT_CONFIRMED",   to: "HOSTING_CREATED",    action: "skip_domain_create_hosting",   isAsync: true, retryable: true },
  // Failure transitions (any state → FAILED)
  { from: "SPEC_GENERATED",      to: "FAILED",             action: "generation_failed" },
  { from: "SITE_GENERATED",      to: "FAILED",             action: "preview_deploy_failed" },
  { from: "PREVIEW_DEPLOYED",    to: "FAILED",             action: "approval_failed" },
  { from: "PAYMENT_CONFIRMED",   to: "FAILED",             action: "domain_registration_failed",   retryable: true },
  { from: "DOMAIN_REGISTERED",   to: "FAILED",             action: "hosting_creation_failed",       retryable: true },
  { from: "HOSTING_CREATED",     to: "FAILED",             action: "dns_configuration_failed",      retryable: true },
  { from: "DNS_CONFIGURED",      to: "FAILED",             action: "ssl_verification_failed",       retryable: true },
  { from: "SSL_READY",           to: "FAILED",             action: "production_deploy_failed",      retryable: true },
  { from: "PRODUCTION_DEPLOYED", to: "FAILED",             action: "qa_failed",                     retryable: true },
  // Suspension
  { from: "LIVE",                to: "SUSPENDED",          action: "suspend" },
  { from: "SUSPENDED",           to: "LIVE",               action: "unsuspend" },
] as const;

// Build a lookup set for O(1) validation.
const VALID_TRANSITIONS = new Set(
  TRANSITIONS.map((t) => `${t.from}→${t.to}`)
);

// Also index by action for action-based lookups.
const ACTION_INDEX = new Map<string, StateTransition>(
  TRANSITIONS.map((t) => [t.action, t])
);

export interface TransitionResult {
  ok: boolean;
  from: DeploymentState;
  to: DeploymentState;
  action: string;
  error?: string;
}

/**
 * Validates whether a state transition is allowed.
 */
export function isValidTransition(from: DeploymentState, to: DeploymentState): boolean {
  return VALID_TRANSITIONS.has(`${from}→${to}`);
}

/**
 * Attempts to transition from one state to another.
 * Returns a result indicating success or failure with a reason.
 */
export function validateTransition(from: DeploymentState, to: DeploymentState, action: string): TransitionResult {
  if (!VALID_TRANSITIONS.has(`${from}→${to}`)) {
    return {
      ok: false,
      from,
      to,
      action,
      error: `Invalid transition: ${from} → ${to}. This transition is not allowed by the deployment state machine.`,
    };
  }
  return { ok: true, from, to, action };
}

/**
 * Given the current state, returns all valid next states.
 */
export function getNextStates(current: DeploymentState): DeploymentState[] {
  return TRANSITIONS
    .filter((t) => t.from === current)
    .map((t) => t.to);
}

/**
 * Returns the transition metadata for a given action.
 */
export function getTransitionByAction(action: string): StateTransition | undefined {
  return ACTION_INDEX.get(action);
}

/**
 * Returns whether a retry is possible from the FAILED state back to
 * the state the project failed from. This is determined by the original
 * transition's retryable flag.
 */
export function canRetryFromFailed(originalAction: string): boolean {
  const transition = ACTION_INDEX.get(originalAction);
  return transition?.retryable === true;
}

/**
 * Ordered list of states in the happy-path pipeline, for progress display.
 */
export const DEPLOYMENT_PIPELINE_STATES: readonly DeploymentState[] = [
  "PROJECT_CREATED",
  "SPEC_GENERATED",
  "SITE_GENERATED",
  "PREVIEW_DEPLOYED",
  "CUSTOMER_APPROVED",
  "PAYMENT_CONFIRMED",
  "DOMAIN_REGISTERED",
  "HOSTING_CREATED",
  "DNS_CONFIGURED",
  "SSL_READY",
  "PRODUCTION_DEPLOYED",
  "QA_PASSED",
  "LIVE",
] as const;

/**
 * Human-readable labels for deployment states, for the customer dashboard.
 */
export const DEPLOYMENT_STATE_LABELS: Record<DeploymentState, string> = {
  PROJECT_CREATED: "Project created",
  SPEC_GENERATED: "Specification ready",
  SITE_GENERATED: "Website generated",
  PREVIEW_DEPLOYED: "Preview ready",
  CUSTOMER_APPROVED: "Approved by you",
  PAYMENT_CONFIRMED: "Payment confirmed",
  DOMAIN_REGISTERED: "Domain registered",
  HOSTING_CREATED: "Hosting configured",
  DNS_CONFIGURED: "DNS configured",
  SSL_READY: "SSL certificate active",
  PRODUCTION_DEPLOYED: "Deployed to production",
  QA_PASSED: "Quality checks passed",
  LIVE: "Live",
  FAILED: "Failed",
  SUSPENDED: "Suspended",
};

/**
 * Maps deployment states to the database deployment_status enum.
 */
export function toDbDeploymentStatus(state: DeploymentState): string {
  switch (state) {
    case "PROJECT_CREATED":
    case "SPEC_GENERATED":
    case "SITE_GENERATED":
      return "NOT_STARTED";
    case "PREVIEW_DEPLOYED":
    case "CUSTOMER_APPROVED":
    case "PAYMENT_CONFIRMED":
      return "PREVIEW_DEPLOYED";
    case "DOMAIN_REGISTERED":
    case "HOSTING_CREATED":
      return "DEPLOYING";
    case "DNS_CONFIGURED":
      return "DNS_PENDING";
    case "SSL_READY":
      return "SSL_PENDING";
    case "PRODUCTION_DEPLOYED":
    case "QA_PASSED":
      return "QA_RUNNING";
    case "LIVE":
      return "LIVE";
    case "FAILED":
      return "FAILED";
    case "SUSPENDED":
      return "SUSPENDED";
  }
}
