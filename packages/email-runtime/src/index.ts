export type {
  EmailOutboxStatus,
  EmailEventType,
  EmailPriority,
  EmailHealthStatus,
  EmailErrorCategory,
  EmailSendRequest,
  EmailSendResult,
  EmailSendFailure,
  EmailProviderSendOutcome,
  EmailProvider,
  RenderedEmail,
  EmailOutboxRow,
  EnqueueEmailInput,
  EnqueueEmailResult,
} from "./types.ts";

export { createServiceClient, type ServiceClient } from "./db.ts";
export { loadEmailRuntimeConfig, extractEmailAddress, type EmailRuntimeConfig } from "./config.ts";
export {
  validateRecipient,
  sanitizeHeaderValue,
  assertSafeHeaderValue,
  hashRecipient,
} from "./recipient.ts";
export { EMAIL_EVENT_CONTRACTS, getEmailEventContract } from "./events.ts";
export { renderEmailTemplate } from "./templates/render.ts";
export {
  createEmailProvider,
  InMemoryEmailProvider,
  FakeEmailProvider,
  ResendEmailProvider,
} from "./providers/factory.ts";
export { emitEmailOperationalEvent } from "./observability.ts";
export { probeEmailSystemHealth, type EmailHealthSnapshot } from "./health.ts";
export {
  computeEmailBackoffSeconds,
  nextEmailAttemptAt,
  isRetryExhausted,
  EMAIL_MAX_ATTEMPTS,
} from "./processor/backoff.ts";
export { processEmailOutboxBatch, type ProcessOutboxResult } from "./processor/process.ts";
export { enqueueTransactionalEmail } from "./outbox/enqueue.ts";
export { InMemoryEmailOutboxStore } from "./outbox/memory-store.ts";
export { PostgresEmailOutboxStore, createPostgresEmailOutboxStore } from "./outbox/postgres-store.ts";
export type { EmailOutboxStore, InsertOutboxInput } from "./outbox/store.ts";

export {
  enqueuePaymentOutcomeEmails,
  issueEmailNotificationsBestEffort,
  appApprovalsUrl,
  resolveTenantOwnerEmailForNotify,
  type PaymentEmailHookInput,
} from "./integrations/payments.ts";
export {
  enqueueApprovalRequiredEmail,
  enqueueApprovalRequiredEmailBestEffort,
  supportMailbox,
  type ApprovalEmailInput,
} from "./integrations/approvals.ts";
export {
  enqueueMissionCompletedEmail,
  enqueueMissionFailedEmail,
  enqueueMissionTerminalEmailBestEffort,
  type MissionEmailInput,
  type MissionEmailFailureKind,
} from "./integrations/missions.ts";
export {
  enqueueSupportEscalationEmail,
  enqueueSupportEscalationEmailBestEffort,
  type SupportEscalationEmailInput,
} from "./integrations/support.ts";
