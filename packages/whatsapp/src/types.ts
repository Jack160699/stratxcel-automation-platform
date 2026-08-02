export type InboundMessageKind = "text" | "image" | "document" | "audio" | "voice" | "unsupported";

export interface ParsedInboundWhatsAppMessage {
  from: string;
  /** Text body for "text" messages, or the caption for media types that have one. Empty string if neither applies. */
  body: string;
  kind: InboundMessageKind;
  /** Present only for media message kinds — the Meta media ID needed to fetch the actual file via a separate Graph API call. */
  mediaId: string | null;
  mimeType: string | null;
  providerMessageId: string;
  timestampIso: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhoneNumber: string | null;
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
