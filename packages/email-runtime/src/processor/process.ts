import { emptyProviderEvidence, type EmailProviderEvidence } from "../provider-evidence.ts";
import { loadEmailRuntimeConfig } from "../config.ts";
import { getEmailEventContract } from "../events.ts";
import { emitEmailOperationalEvent } from "../observability.ts";
import { assertSafeHeaderValue } from "../recipient.ts";
import type { EmailOutboxRow, EmailProvider } from "../types.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import { EMAIL_MAX_ATTEMPTS, isRetryExhausted, nextEmailAttemptAt } from "./backoff.ts";

export interface ProcessOutboxResult {
  claimed: number;
  recovered: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

function extractRendered(row: EmailOutboxRow): { html: string; text: string } | null {
  const rendered = row.payload?._rendered as { html?: string; text?: string } | undefined;
  if (rendered && typeof rendered.html === "string" && typeof rendered.text === "string") {
    return { html: rendered.html, text: rendered.text };
  }
  return null;
}

function resolveMaxAttempts(row: EmailOutboxRow): number {
  try {
    const contract = getEmailEventContract(row.event_type);
    if (typeof contract.maxAttempts === "number" && contract.maxAttempts > 0) {
      return contract.maxAttempts;
    }
  } catch {
    // malformed/legacy row
  }
  return EMAIL_MAX_ATTEMPTS;
}

async function processOne(
  store: EmailOutboxStore,
  provider: EmailProvider,
  row: EmailOutboxRow
): Promise<"sent" | "retried" | "failed" | "skipped"> {
  if (row.status === "SENT" && row.provider_message_id) {
    return "skipped";
  }

  const attempt = row.attempt_count + 1;
  const rendered = extractRendered(row);
  if (!rendered) {
    await store.markFailed(row.id, {
      attemptCount: attempt,
      errorCode: "MISSING_RENDERED_BODY",
      errorSafe: "Outbox row is missing rendered email body",
    });
    emitEmailOperationalEvent({
      event: "email_send_failed",
      eventType: row.event_type,
      templateKey: row.template_key,
      tenantId: row.tenant_id,
      attempt,
      correlationId: row.correlation_id,
      outboxId: row.id,
      errorCategory: "unknown",
    });
    return "failed";
  }

  if (!provider.isConfigured()) {
    // Park without burning attempts — recovery will re-enter PENDING later.
    await store.markFailed(row.id, {
      attemptCount: row.attempt_count,
      errorCode: "NOT_CONFIGURED",
      errorSafe: "Email provider is not configured",
      status: "WAITING_CONFIGURATION",
      preserveAttemptCount: true,
    });
    emitEmailOperationalEvent({
      event: "email_send_failed",
      eventType: row.event_type,
      templateKey: row.template_key,
      tenantId: row.tenant_id,
      attempt: row.attempt_count,
      provider: provider.name,
      correlationId: row.correlation_id,
      outboxId: row.id,
      errorCategory: "not_configured",
      status: "WAITING_CONFIGURATION",
    });
    return "failed";
  }

  const config = loadEmailRuntimeConfig();
  emitEmailOperationalEvent({
    event: "email_send_started",
    eventType: row.event_type,
    templateKey: row.template_key,
    tenantId: row.tenant_id,
    attempt,
    provider: provider.name,
    correlationId: row.correlation_id,
    outboxId: row.id,
  });

  let subject: string;
  let from: string;
  let replyTo: string;
  try {
    subject = assertSafeHeaderValue(row.subject, "subject");
    from = assertSafeHeaderValue(config.from, "from");
    replyTo = assertSafeHeaderValue(config.replyTo, "reply-to");
  } catch {
    await store.markFailed(row.id, {
      attemptCount: attempt,
      errorCode: "HEADER_INJECTION",
      errorSafe: "Blocked header injection in email headers",
    });
    return "failed";
  }

  const outcome = await provider.send({
    to: row.recipient,
    subject,
    html: rendered.html,
    text: rendered.text,
    from,
    replyTo,
    idempotencyKey: `${row.event_type}:${row.idempotency_key}:${row.recipient}`,
    tags: [
      { name: "event_type", value: row.event_type },
      { name: "template", value: row.template_key },
    ],
  });

  if (outcome.ok) {
    await store.markSent(row.id, {
      provider: outcome.provider,
      providerMessageId: outcome.providerMessageId,
      attemptCount: attempt,
    });
    emitEmailOperationalEvent({
      event: "email_send_succeeded",
      eventType: row.event_type,
      templateKey: row.template_key,
      tenantId: row.tenant_id,
      attempt,
      provider: outcome.provider,
      correlationId: row.correlation_id,
      outboxId: row.id,
      status: "SENT",
    });
    return "sent";
  }

  const maxAttempts = resolveMaxAttempts(row);
  if (outcome.retryable && !isRetryExhausted(attempt, maxAttempts)) {
    const nextAt = nextEmailAttemptAt(attempt);
    await store.markRetry(row.id, {
      attemptCount: attempt,
      nextAttemptAt: nextAt.toISOString(),
      errorCode: outcome.errorCode,
      errorSafe: outcome.errorSafe,
    });
    emitEmailOperationalEvent({
      event: "email_send_retry",
      eventType: row.event_type,
      templateKey: row.template_key,
      tenantId: row.tenant_id,
      attempt,
      provider: outcome.provider,
      errorCategory: outcome.errorCategory,
      correlationId: row.correlation_id,
      outboxId: row.id,
      status: "RETRY_WAIT",
    });
    return "retried";
  }

  const terminalStatus =
    outcome.errorCategory === "not_configured" ||
    outcome.errorCategory === "auth_config" ||
    outcome.errorCategory === "sender_unverified"
      ? "WAITING_CONFIGURATION"
      : "FAILED";

  await store.markFailed(row.id, {
    attemptCount: attempt,
    errorCode: outcome.errorCode,
    errorSafe: outcome.errorSafe,
    status: terminalStatus,
    preserveAttemptCount: terminalStatus === "WAITING_CONFIGURATION" && outcome.errorCategory === "not_configured",
  });
  emitEmailOperationalEvent({
    event: "email_send_failed",
    eventType: row.event_type,
    templateKey: row.template_key,
    tenantId: row.tenant_id,
    attempt,
    provider: outcome.provider,
    errorCategory: outcome.errorCategory,
    correlationId: row.correlation_id,
    outboxId: row.id,
    status: terminalStatus,
  });
  return "failed";
}

/**
 * Claim pending/retry emails atomically and send via the provider adapter.
 * Recovers WAITING_CONFIGURATION from configuration knowledge plus latest
 * provider evidence — never from isConfigured()/key presence alone, and never
 * via privileged domain/account APIs.
 * Probe runs at most once per batch. Never marks SENT without a real provider message id.
 */
export function isProviderReadyForWaitingConfigRecovery(
  probe: {
    configured: boolean;
    reachable: boolean | null;
    senderVerified: boolean | null;
  },
  evidence?: EmailProviderEvidence | null
): boolean {
  if (probe.configured !== true) return false;
  if (probe.reachable === false) return false;
  if (probe.senderVerified === false) return false;
  // Explicit verified probe (in-memory tests) may recover after operator fix.
  if (probe.senderVerified === true) return true;

  const latest = evidence ?? emptyProviderEvidence();
  if (latest.kind === "auth_config" || latest.kind === "sender_unverified") return false;
  if (latest.kind === "delivery_proof" && latest.hasProviderMessageId) return true;
  // Sending-only path: key present, no blocking provider evidence (e.g. was NOT_CONFIGURED).
  return true;
}

export async function processEmailOutboxBatch(
  store: EmailOutboxStore,
  provider: EmailProvider,
  options: { limit?: number; leaseOwner?: string } = {}
): Promise<ProcessOutboxResult> {
  let recovered = 0;
  if (provider.isConfigured() && typeof store.recoverWaitingConfiguration === "function") {
    // One readiness probe per batch — never per queued row, never on key presence alone.
    const probe = await provider.probeReadiness();
    const evidence =
      typeof store.getLatestProviderEvidence === "function"
        ? await store.getLatestProviderEvidence()
        : emptyProviderEvidence();
    if (isProviderReadyForWaitingConfigRecovery(probe, evidence)) {
      const rows = await store.recoverWaitingConfiguration(options.limit ?? 100);
      recovered = rows.length;
    }
  }

  const claimed = await store.claimPending({
    limit: options.limit ?? 20,
    leaseOwner: options.leaseOwner ?? "email-processor",
  });

  const result: ProcessOutboxResult = {
    claimed: claimed.length,
    recovered,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of claimed) {
    const outcome = await processOne(store, provider, row);
    if (outcome === "sent") result.sent += 1;
    else if (outcome === "retried") result.retried += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.skipped += 1;
  }

  return result;
}
