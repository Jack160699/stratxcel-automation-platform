/**
 * Email Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface SendEmailInput {
  tenantId: string;
  projectId?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  templateVars?: Record<string, unknown>;
}

export interface SendEmailResult {
  messageId: string;
  provider: string;
  status: "SENT" | "QUEUED" | "FAILED";
  deliveredAt: string;
}

export interface EmailProvider {
  name: string;
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockEmailProvider implements EmailProvider {
  public name = "mock_email";
  public sentMessages: SendEmailInput[] = [];

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sentMessages.push(input);
    return {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: this.name,
      status: "SENT",
      deliveredAt: new Date().toISOString(),
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "email",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockEmailProvider = new MockEmailProvider();
