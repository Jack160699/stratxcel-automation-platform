import type { MutationGateInput, MutationGateResult } from "./types.ts";
import { assertSameTenant } from "./tenant-scope.ts";

/**
 * Revenue domain gate for CRM writes and WhatsApp sends.
 *
 * This is NOT the sole final authorization for external mutation.
 * Callers must ALSO pass:
 * - Capability Runtime gate (requestCapability / resolveCapabilityReadiness)
 * - tenant ownership
 * - entitlement
 * - integration readiness
 * - kill switch / Shadow where applicable
 *
 * Standing authorization must be kind-scoped — a boolean alone is never
 * universal across Social / Ads / Website.
 */
export function authorizeRevenueMutation(input: MutationGateInput): MutationGateResult {
  try {
    assertSameTenant(input.tenantId, input.resourceTenantId, input.kind);
  } catch {
    return { allowed: false, reason: "tenant_mismatch", draftingAllowed: false };
  }

  void input.hermesProposedText;

  const standingOk =
    input.standingAuthorization === true &&
    input.standingAuthorizationKind === input.kind;

  if (input.kind === "whatsapp.send") {
    if (input.optedOut === true) {
      return { allowed: false, reason: "opt_out", draftingAllowed: false };
    }
    if (input.conversationAutomationMode === "paused") {
      return { allowed: false, reason: "conversation_paused", draftingAllowed: true };
    }
    if (input.conversationAutomationMode === "handoff" && !input.isHumanInitiated) {
      return { allowed: false, reason: "conversation_awaiting_human", draftingAllowed: true };
    }
    if (input.outsideSessionWindow && input.hasMarketingConsent !== true) {
      return { allowed: false, reason: "marketing_consent_required", draftingAllowed: true };
    }
    if (input.approvalStatus === "APPROVED" || standingOk) {
      return { allowed: true, reason: "authorized", draftingAllowed: true };
    }
    return { allowed: false, reason: "send_authorization_required", draftingAllowed: true };
  }

  if (input.approvalStatus === "APPROVED" || standingOk) {
    return { allowed: true, reason: "authorized", draftingAllowed: true };
  }
  return { allowed: false, reason: "crm_write_authorization_required", draftingAllowed: true };
}

export function isDraftOnly(sequence: { sendAuthorized: boolean }): boolean {
  return sequence.sendAuthorized === false;
}

/**
 * Combined eligibility: revenue domain gate AND capability runtime executable.
 * Revenue approval alone cannot bypass capability gate.
 */
export function isRevenueExecutionEligible(input: {
  revenueGate: MutationGateResult;
  capabilityExecutable: boolean;
}): boolean {
  return input.revenueGate.allowed === true && input.capabilityExecutable === true;
}
