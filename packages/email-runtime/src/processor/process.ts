import { loadEmailRuntimeConfig } from "../config.ts";
import { emitEmailOperationalEvent } from "../observability.ts";
import { assertSafeHeaderValue } from "../recipient.ts";
import type { EmailOutboxRow, EmailProvider } from "../types.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import { EMAIL_MAX_ATTEMPTS, isRetryExhausted, nextEmailAttemptAt } from "./backoff.ts";

export interface ProcessOutboxResult {
  claimed: number;
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

async function processOne(
  store: EmailOutboxStore,
  provider: EmailProvider,
  row: EmailOutboxRow
): Promise<"sent" | "retried" | "failed" | "skipped"> {
  // Already sent — worker restart / double-claim safety.
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
    await store.markFailed(row.id, {
      attemptCount: attempt,
      errorCode: "NOT_CONFIGURED",
      errorSafe: "Email provider is not configured",
      status: "WAITING_CONFIGURATION",
    });
    emitEmailOperationalEvent({
      event: "email_send_failed",
      eventType: row.event_type,
      templateKey: row.template_key,
      tenantId: row.tenant_id,
      attempt,
      provider: provider.name,
      correlationId: row.correlation_id,
      outboxId: row.id,
      errorCategory: "not_configured",
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

  const maxAttempts = EMAIL_MAX_ATTEMPTS;
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
    outcome.errorCategory === "not_configured" || outcome.errorCategory === "auth_config"
      ? "WAITING_CONFIGURATION"
      : outcome.errorCategory === "sender_unverified"
        ? "WAITING_CONFIGURATION"
        : "FAILED";

  await store.markFailed(row.id, {
    attemptCount: attempt,
    errorCode: outcome.errorCode,
    errorSafe: outcome.errorSafe,
    status: terminalStatus,
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
 * Never marks SENT without a real provider message id.
 */
export async function processEmailOutboxBatch(
  store: EmailOutboxStore,
  provider: EmailProvider,
  options: { limit?: number; leaseOwner?: string } = {}
): Promise<ProcessOutboxResult> {
  const claimed = await store.claimPending({
    limit: options.limit ?? 20,
    leaseOwner: options.leaseOwner ?? "email-processor",
  });

  const result: ProcessOutboxResult = {
    claimed: claimed.length,
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
