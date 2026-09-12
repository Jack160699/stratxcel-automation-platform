/**
 * Production Email Provider Adapter
 *
 * Connects to Resend / SendGrid API with transactional delivery tracking.
 */

import type { EmailProvider, SendEmailInput, SendEmailResult } from "./interface.ts";
import type { CapabilityHealthResult } from "../config/health.ts";
import { ProviderError } from "../resilience/errors.ts";

export class ProductionEmailProvider implements EmailProvider {
  public name = "production_resend";
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY;
  }

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = this.apiKey || process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY;

    if (!apiKey) {
      throw new ProviderError({
        message: "Email Provider API key is not configured in production environment",
        code: "AUTHENTICATION_FAILED",
        provider: this.name,
        capability: "email",
      });
    }

    const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      throw new ProviderError({
        message: data.message || `Resend send failed with status ${res.status}`,
        code: "PROVIDER_ERROR",
        provider: this.name,
        capability: "email",
      });
    }

    return {
      messageId: data.id,
      provider: this.name,
      status: "SENT",
      deliveredAt: new Date().toISOString(),
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    const apiKey = this.apiKey || process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY;
    const hasKey = Boolean(apiKey && apiKey.trim().length > 0);

    return {
      capability: "email",
      provider: this.name,
      status: hasKey ? "READY" : "NOT_CONFIGURED",
      isReady: hasKey,
      message: hasKey ? "Production Email provider ready" : "Missing RESEND_API_KEY / EMAIL_PROVIDER_API_KEY",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const productionEmailProvider = new ProductionEmailProvider();
