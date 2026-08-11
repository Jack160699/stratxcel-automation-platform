import { isEmailProcessorPathConfigured, loadEmailRuntimeConfig } from "./config.ts";
import type { EmailHealthStatus, EmailProvider } from "./types.ts";
import { createEmailProvider } from "./providers/factory.ts";

export interface EmailHealthSnapshot {
  status: EmailHealthStatus;
  detail: string;
  checks: {
    keyConfigured: boolean;
    providerReachable: boolean | null;
    senderConfigured: boolean;
    senderVerified: boolean | null;
    outboxAccessible: boolean | null;
    workerPathAvailable: boolean;
    processorMode: string;
  };
}

/**
 * System Health for email. Boolean(RESEND_API_KEY) alone is never OPERATIONAL.
 * workerPathAvailable must be proven (heartbeat / configured processor mode) —
 * never hard-coded true.
 */
export async function probeEmailSystemHealth(options?: {
  provider?: EmailProvider;
  outboxAccessible?: boolean | null;
  workerPathAvailable?: boolean;
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

  const baseChecks = {
    keyConfigured,
    providerReachable: null as boolean | null,
    senderConfigured,
    senderVerified: null as boolean | null,
    outboxAccessible,
    workerPathAvailable,
    processorMode: config.processorMode || "unset",
  };

  if (!keyConfigured) {
    return {
      status: "NOT_CONFIGURED",
      detail: "Email provider API key is not configured.",
      checks: baseChecks,
    };
  }

  const probe = await provider.probeReadiness();
  baseChecks.providerReachable = probe.reachable;
  baseChecks.senderVerified = probe.senderVerified;

  if (!probe.reachable) {
    return {
      status: "CONFIGURED",
      detail: probe.detail || "Provider key is present but provider is not reachable.",
      checks: baseChecks,
    };
  }

  if (probe.senderVerified === false || !senderConfigured) {
    return {
      status: "SENDER_UNVERIFIED",
      detail: !senderConfigured
        ? "EMAIL_FROM is missing or invalid."
        : probe.detail || "Sender/domain is not verified with the provider.",
      checks: baseChecks,
    };
  }

  if (outboxAccessible === false || !workerPathAvailable) {
    return {
      status: "DEGRADED",
      detail: !workerPathAvailable
        ? `Provider reachable but processor path is not configured (EMAIL_PROCESSOR_MODE=${config.processorMode || "unset"}; Vercel sub-daily cron is not used).`
        : "Provider is reachable but outbox is inaccessible.",
      checks: baseChecks,
    };
  }

  if (probe.senderVerified === true && senderConfigured && keyConfigured && probe.reachable && workerPathAvailable) {
    return {
      status: "OPERATIONAL",
      detail: "Email provider configured, reachable, sender verified, and processor path available.",
      checks: baseChecks,
    };
  }

  return {
    status: "REACHABLE",
    detail: probe.detail || "Provider is reachable; sender verification not confirmed.",
    checks: baseChecks,
  };
}
