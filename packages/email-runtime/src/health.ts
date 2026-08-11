import { loadEmailRuntimeConfig } from "./config.ts";
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
  };
}

/**
 * System Health for email. Boolean(RESEND_API_KEY) alone is never OPERATIONAL.
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
  const workerPathAvailable = options?.workerPathAvailable ?? true;
  const outboxAccessible = options?.outboxAccessible ?? null;

  if (!keyConfigured) {
    return {
      status: "NOT_CONFIGURED",
      detail: "Email provider API key is not configured.",
      checks: {
        keyConfigured: false,
        providerReachable: null,
        senderConfigured,
        senderVerified: null,
        outboxAccessible,
        workerPathAvailable,
      },
    };
  }

  const probe = await provider.probeReadiness();

  if (!probe.reachable) {
    return {
      status: "CONFIGURED",
      detail: probe.detail || "Provider key is present but provider is not reachable.",
      checks: {
        keyConfigured: true,
        providerReachable: false,
        senderConfigured,
        senderVerified: probe.senderVerified,
        outboxAccessible,
        workerPathAvailable,
      },
    };
  }

  if (probe.senderVerified === false || !senderConfigured) {
    return {
      status: "SENDER_UNVERIFIED",
      detail: !senderConfigured
        ? "EMAIL_FROM is missing or invalid."
        : probe.detail || "Sender/domain is not verified with the provider.",
      checks: {
        keyConfigured: true,
        providerReachable: true,
        senderConfigured,
        senderVerified: probe.senderVerified,
        outboxAccessible,
        workerPathAvailable,
      },
    };
  }

  if (outboxAccessible === false || workerPathAvailable === false) {
    return {
      status: "DEGRADED",
      detail: "Provider is reachable but outbox/worker path is unavailable.",
      checks: {
        keyConfigured: true,
        providerReachable: true,
        senderConfigured,
        senderVerified: probe.senderVerified,
        outboxAccessible,
        workerPathAvailable,
      },
    };
  }

  if (probe.senderVerified === true && senderConfigured && keyConfigured && probe.reachable) {
    return {
      status: "OPERATIONAL",
      detail: "Email provider configured, reachable, and sender appears verified.",
      checks: {
        keyConfigured: true,
        providerReachable: true,
        senderConfigured,
        senderVerified: true,
        outboxAccessible,
        workerPathAvailable,
      },
    };
  }

  // Key present + reachable, verification unknown → REACHABLE (not LIVE/OPERATIONAL).
  return {
    status: "REACHABLE",
    detail: probe.detail || "Provider is reachable; sender verification not confirmed.",
    checks: {
      keyConfigured: true,
      providerReachable: true,
      senderConfigured,
      senderVerified: probe.senderVerified,
      outboxAccessible,
      workerPathAvailable,
    },
  };
}
