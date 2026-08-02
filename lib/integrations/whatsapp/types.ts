export interface ParsedInboundWhatsAppMessage {
  from: string;
  body: string;
  providerMessageId: string;
  timestampIso: string;
}

export interface SendWhatsAppMessageResult {
  id: string;
  mode: "shadow" | "live";
}

export interface WhatsAppAdapter {
  readonly mode: "disabled" | "shadow" | "live";
  sendMessage(input: { tenantId: string; to: string; body: string }): Promise<SendWhatsAppMessageResult>;
}

export class IntegrationDisabledError extends Error {
  constructor(integration: string) {
    super(`${integration} integration is disabled — set its _INTEGRATION_MODE env var to "shadow" to enable shadow-mode testing`);
    this.name = "IntegrationDisabledError";
  }
}
