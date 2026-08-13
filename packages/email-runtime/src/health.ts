import { isEmailProcessorPathConfigured, loadEmailRuntimeConfig } from "./config.ts";
import {
  emptyProviderEvidence,
  sanitizeEmailHealthDetail,
  type EmailProviderEvidence,
} from "./provider-evidence.ts";
import type { EmailHealthStatus, EmailProvider } from "./types.ts";
import { createEmailProvider } from "./providers/factory.ts";

export interface EmailHealthSnapshot {
  status: EmailHealthStatus;
  detail: string;
  checks: {
    keyConfigured: boolean;
    senderConfigured: boolean;
    outboxAccessible: boolean | null;
    workerPathAvailable: boolean;
    processorMode: string;
    deliveryProven: boolean;
    latestEvidenceKind: EmailProviderEvidence["kind"];
    providerReachable: boolean | null;
    senderVerified: boolean | null;
  };
}

/**
 * System Health for email.
 *
 * Configuration knowledge (key, EMAIL_FROM, processor, outbox, heartbeat) is
 * separate from runtime delivery proof (SENT + provider_message_id).
 *
 * Boolean(RESEND_API_KEY) is never OPERATIONAL.
 * A sending-only key must not call Resend domain/account-admin APIs.
 * Historical success does not stay OPERATIONAL if later evidence is auth/sender failure.
 */
export async function probeEmailSystemHealth(options?: {
  provider?: EmailProvider;
  outboxAccessible?: boolean | null;
  workerPathAvailable?: boolean;
  providerEvidence?: EmailProviderEvidence | null;
}): Promise<EmailHealthSnapshot> {
  const config = loadEmailRuntimeConfig();
  const provider = options?.provider ?? createEmailProvider();
  const keyConfigured = provider.isConfigured();
  const senderConfigured = Boolean(config.from && config.from.includes("@"));
  const processorConfigured = isEmailProcessorPathConfigured();
  const workerPathAvailable =
    typeof options?.workerPathAvailable === "boolean"
      ? options.workerPathAvailable
      : processorConfigured;
  const outboxAccessible = options?.outboxAccessible ?? null;
  const evidence = options?.providerEvidence ?? emptyProviderEvidence();

  const probe = await provider.probeReadiness();
  const deliveryProven = evidence.kind === "delivery_proof" && evidence.hasProviderMessageId === true;
  const senderRejected = evidence.kind === "sender_unverified" || probe.senderVerified === false;
  const authRejected = evidence.kind === "auth_config";

  const senderVerified: boolean | null = senderRejected ? false : deliveryProven ? true : probe.senderVerified;
  const providerReachable = probe.reachable;

  const baseChecks = {
    keyConfigured,
    senderConfigured,
    outboxAccessible,
    workerPathAvailable,
    processorMode: config.processorMode || "unset",
    deliveryProven,
    latestEvidenceKind: evidence.kind,
    providerReachable,
    senderVerified,
  };

  const snapshot = (status: EmailHealthStatus, detail: string): EmailHealthSnapshot => ({
    status,
    detail: sanitizeEmailHealthDetail(detail),
    checks: baseChecks,
  });

  if (!keyConfigured) {
    return snapshot("NOT_CONFIGURED", "Email provider API key is not configured.");
  }

  if (!senderConfigured) {
    return snapshot("SENDER_UNVERIFIED", "EMAIL_FROM is missing or invalid.");
  }

  if (senderRejected) {
    return snapshot(
      "SENDER_UNVERIFIED",
      "Latest provider evidence is a sender/domain verification rejection. Sending-only keys do not enumerate domains."
    );
  }

  if (authRejected) {
    return snapshot(
      "DEGRADED",
      "Latest provider evidence is an API key auth/config rejection (HTTP 401/403)."
    );
  }

  if (outboxAccessible === false || !workerPathAvailable) {
    return snapshot(
      "DEGRADED",
      !workerPathAvailable
        ? `Provider key is configured but processor path is not healthy (EMAIL_PROCESSOR_MODE=${config.processorMode || "unset"}; Vercel sub-daily cron is not used).`
        : "Provider key is configured but outbox is inaccessible."
    );
  }

  if (deliveryProven && outboxAccessible === true && workerPathAvailable && senderConfigured) {
    return snapshot(
      "OPERATIONAL",
      "Email is operational: sending key configured, outbox and processor healthy, and a real provider message id is persisted."
    );
  }

  if (workerPathAvailable && outboxAccessible === true && senderConfigured) {
    return snapshot(
      "REACHABLE_UNPROVEN",
      "Email is configured and the processor/outbox path is healthy, but delivery is unproven until a real provider send persists a message id."
    );
  }

  return snapshot(
    "CONFIGURED",
    probe.detail || "Email provider key is configured; delivery proof has not been established."
  );
}
