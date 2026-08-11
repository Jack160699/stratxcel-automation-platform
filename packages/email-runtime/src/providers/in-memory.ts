import type {
  EmailProvider,
  EmailProviderSendOutcome,
  EmailSendRequest,
} from "../types.ts";

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

  constructor(options: { configured?: boolean } = {}) {
    this.configured = options.configured !== false;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  setConfigured(value: boolean): void {
    this.configured = value;
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
    return {
      configured: this.configured,
      reachable: this.configured,
      senderVerified: this.configured ? true : null,
      detail: this.configured ? "In-memory provider ready for tests" : "In-memory provider not configured",
    };
  }
}

export const FakeEmailProvider = InMemoryEmailProvider;
