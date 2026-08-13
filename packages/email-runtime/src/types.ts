export type EmailOutboxStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "RETRY_WAIT"
  | "FAILED"
  | "CANCELLED"
  | "WAITING_CONFIGURATION";

export type EmailEventType =
  | "ACCOUNT_WELCOME"
  | "AUDIT_PAYMENT_RECEIPT"
  | "AUDIT_DELIVERED"
  | "SUBSCRIPTION_ACTIVATED"
  | "SUBSCRIPTION_PAYMENT_SUCCESS"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "SUBSCRIPTION_RENEWAL_UPCOMING"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_CANCEL_SCHEDULED"
  | "SUBSCRIPTION_CANCELLED"
  | "INVOICE_OR_RECEIPT_READY"
  | "APPROVAL_REQUIRED"
  | "MISSION_COMPLETED"
  | "MISSION_FAILED"
  | "SUPPORT_ESCALATION_CREATED"
  | "IMPORTANT_ACCOUNT_NOTICE";

export type EmailPriority = "low" | "normal" | "high";

export type EmailHealthStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "REACHABLE"
  | "SENDER_UNVERIFIED"
  | "OPERATIONAL"
  | "DEGRADED";

export type EmailErrorCategory =
  | "not_configured"
  | "invalid_recipient"
  | "header_injection"
  | "auth_config"
  | "sender_unverified"
  | "hard_reject"
  | "rate_limited"
  | "timeout"
  | "network"
  | "provider_5xx"
  | "provider_4xx"
  | "unknown";

export interface EmailSendRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailSendResult {
  ok: true;
  provider: string;
  providerMessageId: string;
  safeMetadata?: Record<string, unknown>;
}

export interface EmailSendFailure {
  ok: false;
  provider: string;
  retryable: boolean;
  errorCode: string;
  errorCategory: EmailErrorCategory;
  errorSafe: string;
  httpStatus?: number;
}

export type EmailProviderSendOutcome = EmailSendResult | EmailSendFailure;

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(request: EmailSendRequest): Promise<EmailProviderSendOutcome>;
  probeReadiness(): Promise<{
    configured: boolean;
    reachable: boolean;
    senderVerified: boolean | null;
    detail: string;
  }>;
}

export interface RenderedEmail {
  templateKey: string;
  templateVersion: number;
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export interface EmailOutboxRow {
  id: string;
  tenant_id: string | null;
  owner_id: string | null;
  event_type: EmailEventType;
  recipient: string;
  recipient_hash: string | null;
  template_key: string;
  template_version: number;
  subject: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  provider: string | null;
  provider_message_id: string | null;
  status: EmailOutboxStatus;
  attempt_count: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_error_code: string | null;
  last_error_safe: string | null;
  sent_at: string | null;
  correlation_id: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueEmailInput {
  eventType: EmailEventType;
  recipient: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  tenantId?: string | null;
  ownerId?: string | null;
  correlationId?: string | null;
  /** When true, skip enqueue if recipient fails validation — return structured result. */
  allowMissingRecipient?: boolean;
}

export interface EnqueueEmailResult {
  enqueued: boolean;
  duplicate: boolean;
  outboxId?: string;
  reason?: string;
}
