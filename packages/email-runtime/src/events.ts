import type { EmailEventType, EmailPriority } from "./types.ts";

export interface EmailEventContract {
  eventType: EmailEventType;
  templateKey: string;
  templateVersion: number;
  priority: EmailPriority;
  tenantRequired: boolean;
  maxAttempts: number;
  /** Human-readable required payload keys (validated loosely for presence). */
  requiredPayloadKeys: string[];
  /** How to build the default idempotency key fragment when callers omit one. */
  idempotencyDescription: string;
}

/**
 * Explicit contracts for every V1 transactional email event.
 * Do not email users for arbitrary internal system noise.
 */
export const EMAIL_EVENT_CONTRACTS: Record<EmailEventType, EmailEventContract> = {
  ACCOUNT_WELCOME: {
    eventType: "ACCOUNT_WELCOME",
    templateKey: "account_welcome",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: false,
    maxAttempts: 5,
    requiredPayloadKeys: ["accountLabel"],
    idempotencyDescription: "welcome:{userId}",
  },
  AUDIT_PAYMENT_RECEIPT: {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    templateKey: "audit_payment_receipt",
    templateVersion: 1,
    priority: "high",
    tenantRequired: false,
    maxAttempts: 5,
    requiredPayloadKeys: ["productName", "amountLabel", "currency", "paymentReference", "paidAt"],
    idempotencyDescription: "audit_receipt:{paymentOrderId}",
  },
  SUBSCRIPTION_ACTIVATED: {
    eventType: "SUBSCRIPTION_ACTIVATED",
    templateKey: "subscription_activated",
    templateVersion: 1,
    priority: "high",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "subscriptionId"],
    idempotencyDescription: "sub_activated:{subscriptionId}",
  },
  SUBSCRIPTION_PAYMENT_SUCCESS: {
    eventType: "SUBSCRIPTION_PAYMENT_SUCCESS",
    templateKey: "subscription_payment_success",
    templateVersion: 1,
    priority: "high",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "amountLabel", "currency", "paymentReference"],
    idempotencyDescription: "sub_pay_ok:{paymentOrderId}",
  },
  SUBSCRIPTION_PAYMENT_FAILED: {
    eventType: "SUBSCRIPTION_PAYMENT_FAILED",
    templateKey: "subscription_payment_failed",
    templateVersion: 1,
    priority: "high",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "subscriptionId"],
    idempotencyDescription: "sub_pay_fail:{subscriptionId}:{periodOrEvent}",
  },
  SUBSCRIPTION_RENEWAL_UPCOMING: {
    eventType: "SUBSCRIPTION_RENEWAL_UPCOMING",
    templateKey: "subscription_renewal_upcoming",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "renewalDate", "subscriptionId"],
    idempotencyDescription: "sub_renew_upcoming:{subscriptionId}:{periodEnd}",
  },
  SUBSCRIPTION_RENEWED: {
    eventType: "SUBSCRIPTION_RENEWED",
    templateKey: "subscription_renewed",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "subscriptionId", "periodEnd"],
    idempotencyDescription: "sub_renewed:{subscriptionId}:{periodEnd}",
  },
  SUBSCRIPTION_CANCEL_SCHEDULED: {
    eventType: "SUBSCRIPTION_CANCEL_SCHEDULED",
    templateKey: "subscription_cancel_scheduled",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "subscriptionId", "effectiveDate"],
    idempotencyDescription: "sub_cancel_sched:{subscriptionId}",
  },
  SUBSCRIPTION_CANCELLED: {
    eventType: "SUBSCRIPTION_CANCELLED",
    templateKey: "subscription_cancelled",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["planName", "subscriptionId"],
    idempotencyDescription: "sub_cancelled:{subscriptionId}",
  },
  INVOICE_OR_RECEIPT_READY: {
    eventType: "INVOICE_OR_RECEIPT_READY",
    templateKey: "invoice_or_receipt_ready",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["documentLabel", "reference"],
    idempotencyDescription: "invoice:{invoiceId}",
  },
  APPROVAL_REQUIRED: {
    eventType: "APPROVAL_REQUIRED",
    templateKey: "approval_required",
    templateVersion: 1,
    priority: "high",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["businessName", "missionTitle", "approvalSummary", "approvalUrl"],
    idempotencyDescription: "approval_required:{approvalId}",
  },
  MISSION_COMPLETED: {
    eventType: "MISSION_COMPLETED",
    templateKey: "mission_completed",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["missionTitle", "missionId"],
    idempotencyDescription: "mission_completed:{missionId}",
  },
  MISSION_FAILED: {
    eventType: "MISSION_FAILED",
    templateKey: "mission_failed",
    templateVersion: 1,
    priority: "normal",
    tenantRequired: true,
    maxAttempts: 5,
    requiredPayloadKeys: ["missionTitle", "missionId", "failureKind"],
    idempotencyDescription: "mission_failed:{missionId}",
  },
  SUPPORT_ESCALATION_CREATED: {
    eventType: "SUPPORT_ESCALATION_CREATED",
    templateKey: "support_escalation_created",
    templateVersion: 1,
    priority: "high",
    tenantRequired: false,
    maxAttempts: 5,
    requiredPayloadKeys: ["issueSummary", "referenceId", "priority"],
    idempotencyDescription: "support_esc:{handoffId}",
  },
  IMPORTANT_ACCOUNT_NOTICE: {
    eventType: "IMPORTANT_ACCOUNT_NOTICE",
    templateKey: "important_account_notice",
    templateVersion: 1,
    priority: "high",
    tenantRequired: false,
    maxAttempts: 5,
    requiredPayloadKeys: ["noticeTitle", "noticeBody"],
    idempotencyDescription: "account_notice:{noticeId}",
  },
};

export function getEmailEventContract(eventType: EmailEventType): EmailEventContract {
  return EMAIL_EVENT_CONTRACTS[eventType];
}
