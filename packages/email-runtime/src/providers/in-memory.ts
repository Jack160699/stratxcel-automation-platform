import type {
  EmailProvider,
  EmailProviderSendOutcome,
  EmailSendRequest,
} from "../types.ts";

export type InMemoryProbeState = {
  configured: boolean;
  reachable: boolean;
  senderVerified: boolean | null;
  detail: string;
};

/**
 * Deterministic fake provider for tests. Never contacts a network.
 * Does not fabricate success unless callers enqueue successful responses.
 */
export class InMemoryEmailProvider implements EmailProvider {
  readonly name = "in-memory";
  private configured: boolean;
  readonly sent: EmailSendRequest[] = [];
  private nextOutcome: EmailProviderSendOutcome | null = null;
  private sequence = 0;
  private probeOverride: InMemoryProbeState | null = null;
  probeCallCount = 0;

  constructor(options: { configured?: boolean; probe?: Partial<InMemoryProbeState> } = {}) {
    this.configured = options.configured !== false;
    if (options.probe) {
      this.probeOverride = {
        configured: options.probe.configured ?? this.configured,
        reachable: options.probe.reachable ?? this.configured,
        senderVerified: options.probe.senderVerified ?? (this.configured ? true : null),
        detail: options.probe.detail ?? "In-memory probe override",
      };
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  setConfigured(value: boolean): void {
    this.configured = value;
  }

  setProbe(probe: Partial<InMemoryProbeState> | null): void {
    if (probe == null) {
      this.probeOverride = null;
      return;
    }
    this.probeOverride = {
      configured: probe.configured ?? this.configured,
      reachable: probe.reachable ?? false,
      senderVerified: probe.senderVerified ?? null,
      detail: probe.detail ?? "In-memory probe override",
    };
  }

  /** Queue a one-shot outcome for the next send(). */
  enqueueOutcome(outcome: EmailProviderSendOutcome): void {
    this.nextOutcome = outcome;
  }

  async send(request: EmailSendRequest): Promise<EmailProviderSendOutcome> {
    if (!this.configured) {
      return {
        ok: false,
        provider: this.name,
        retryable: false,
        errorCode: "NOT_CONFIGURED",
        errorCategory: "not_configured",
        errorSafe: "Email provider is not configured",
      };
    }

    this.sent.push(request);

    if (this.nextOutcome) {
      const outcome = this.nextOutcome;
      this.nextOutcome = null;
      return outcome;
    }

    this.sequence += 1;
    return {
      ok: true,
      provider: this.name,
      providerMessageId: `mem_${this.sequence}`,
      safeMetadata: { mode: "in-memory" },
    };
  }

  async probeReadiness() {
    this.probeCallCount += 1;
    if (this.probeOverride) {
      return { ...this.probeOverride };
    }
    return {
      configured: this.configured,
      reachable: this.configured,
      senderVerified: this.configured ? true : null,
      detail: this.configured ? "In-memory provider ready for tests" : "In-memory provider not configured",
    };
  }
}

export const FakeEmailProvider = InMemoryEmailProvider;
