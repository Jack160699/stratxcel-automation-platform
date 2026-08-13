/**
 * Delivery readiness vocabulary — distinguishes contract/template support
 * from production producers and live verification.
 */
export type EmailDeliveryReadiness =
  | "CONTRACT_READY"
  | "PRODUCER_WIRED"
  | "PRODUCER_NOT_AVAILABLE"
  | "PRODUCER_NOT_READY"
  | "OUTBOX_READY"
  | "PROCESSOR_READY"
  | "PROCESSOR_NOT_CONFIGURED"
  | "PROVIDER_READY"
  | "LIVE_VERIFIED";

export interface EmailEventDeliveryStatus {
  eventType: string;
  contract: "CONTRACT_READY";
  template: "CONTRACT_READY";
  outbox: "OUTBOX_READY";
  producer: EmailDeliveryReadiness;
  notes: string;
}

/**
 * Truthful producer wiring status for V1 events.
 * Template/contract existence alone never implies PRODUCER_WIRED.
 */
export const EMAIL_EVENT_DELIVERY_STATUS: Record<string, EmailEventDeliveryStatus> = {
  ACCOUNT_WELCOME: {
    eventType: "ACCOUNT_WELCOME",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_NOT_AVAILABLE",
    notes:
      "Signup uses client-side supabase.auth.signUp(); Supabase Auth owns confirmation mail. No safe authoritative app-side post-create hook without inventing auth webhooks.",
  },
  AUDIT_PAYMENT_RECEIPT: {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired after Razorpay webhook markWebhookEventProcessed for CAPTURED audit_fee orders.",
  },
  AUDIT_DELIVERED: {
    eventType: "AUDIT_DELIVERED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes:
      "Wired after complete_audit_and_issue_subscription_credit_v5 (staff) and complete_automatic_audit_generation_v1 (mission-worker) succeed. Email failure never undoes Audit completion.",
  },
  SUBSCRIPTION_ACTIVATED: {
    eventType: "SUBSCRIPTION_ACTIVATED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired from subscription.activated / authenticated lifecycle webhook results.",
  },
  SUBSCRIPTION_PAYMENT_SUCCESS: {
    eventType: "SUBSCRIPTION_PAYMENT_SUCCESS",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired after CAPTURED subscription_payment orders.",
  },
  SUBSCRIPTION_PAYMENT_FAILED: {
    eventType: "SUBSCRIPTION_PAYMENT_FAILED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired from subscription.halted / pending lifecycle events.",
  },
  SUBSCRIPTION_RENEWAL_UPCOMING: {
    eventType: "SUBSCRIPTION_RENEWAL_UPCOMING",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes:
      "Wired from /api/internal/subscriptions/renew pre-renewal candidate scan (Payment-Link managed renewals within 3 days).",
  },
  SUBSCRIPTION_RENEWED: {
    eventType: "SUBSCRIPTION_RENEWED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired after subscription charge fulfillment; periodEnd from subscriptions.current_period_end.",
  },
  SUBSCRIPTION_CANCEL_SCHEDULED: {
    eventType: "SUBSCRIPTION_CANCEL_SCHEDULED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired from subscription.cancelled with cancel_at_cycle_end.",
  },
  SUBSCRIPTION_CANCELLED: {
    eventType: "SUBSCRIPTION_CANCELLED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired from immediate subscription.cancelled.",
  },
  INVOICE_OR_RECEIPT_READY: {
    eventType: "INVOICE_OR_RECEIPT_READY",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired for non-audit fulfilled payment purposes.",
  },
  APPROVAL_REQUIRED: {
    eventType: "APPROVAL_REQUIRED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired after requestApproval insert.",
  },
  MISSION_COMPLETED: {
    eventType: "MISSION_COMPLETED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired from mission-worker terminal success.",
  },
  MISSION_FAILED: {
    eventType: "MISSION_FAILED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired from final (non-retryable) mission failure only.",
  },
  SUPPORT_ESCALATION_CREATED: {
    eventType: "SUPPORT_ESCALATION_CREATED",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Wired after createHumanHandoff.",
  },
  IMPORTANT_ACCOUNT_NOTICE: {
    eventType: "IMPORTANT_ACCOUNT_NOTICE",
    contract: "CONTRACT_READY",
    template: "CONTRACT_READY",
    outbox: "OUTBOX_READY",
    producer: "PRODUCER_WIRED",
    notes: "Available helper; optional customer ack on support escalation.",
  },
};

export function getEmailEventDeliveryStatus(eventType: string): EmailEventDeliveryStatus | null {
  return EMAIL_EVENT_DELIVERY_STATUS[eventType] ?? null;
}
