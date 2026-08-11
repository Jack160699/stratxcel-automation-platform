import type { MutationGateInput, MutationGateResult } from "./types.ts";
import { assertSameTenant } from "./tenant-scope.ts";

/**
 * Mutation authorization for CRM writes and WhatsApp sends.
 * Hermes-proposed text never grants send/write authorization.
 */
export function authorizeRevenueMutation(input: MutationGateInput): MutationGateResult {
  try {
    assertSameTenant(input.tenantId, input.resourceTenantId, input.kind);
  } catch {
    return { allowed: false, reason: "tenant_mismatch", draftingAllowed: false };
  }

  void input.hermesProposedText;

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
    if (input.approvalStatus === "APPROVED" || input.standingAuthorization === true) {
      return { allowed: true, reason: "authorized", draftingAllowed: true };
    }
    return { allowed: false, reason: "send_authorization_required", draftingAllowed: true };
  }

  if (input.approvalStatus === "APPROVED" || input.standingAuthorization === true) {
    return { allowed: true, reason: "authorized", draftingAllowed: true };
  }
  return { allowed: false, reason: "crm_write_authorization_required", draftingAllowed: true };
}

export function isDraftOnly(sequence: { sendAuthorized: boolean }): boolean {
  return sequence.sendAuthorized === false;
}
