// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/webhook.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { parseInboundWhatsAppWebhook, parseWhatsAppStatusUpdates, verifyWhatsAppWebhookSignature } from "../webhook.ts";
import { canTransitionWhatsAppStatus } from "../messages.ts";

function run() {
  const payload = {
    entry: [
      {
        id: "waba_123",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "phone_abc", display_phone_number: "+91 90000 00000" },
              messages: [
                { id: "wamid.1", from: "919999999999", timestamp: "1780000000", type: "text", text: { body: "Hi there" } },
                { id: "wamid.2", from: "919999999999", timestamp: "1780000010", type: "image", image: { id: "media_1", mime_type: "image/jpeg", caption: "invoice" } },
                { id: "wamid.3", from: "919999999999", timestamp: "1780000020", type: "document", document: { id: "media_2", mime_type: "application/pdf", filename: "quote.pdf" } },
                { id: "wamid.4", from: "919999999999", timestamp: "1780000030", type: "audio", audio: { id: "media_3", mime_type: "audio/ogg" } },
                { id: "wamid.5", from: "919999999999", timestamp: "1780000040", type: "voice", voice: { id: "media_4", mime_type: "audio/ogg" } },
                { id: "wamid.6", from: "919999999999", timestamp: "1780000050", type: "sticker" }, // unsupported, should be skipped
              ],
            },
          },
        ],
      },
    ],
  };

  const parsed = parseInboundWhatsAppWebhook(payload);
  assert.equal(parsed.length, 5);

  const [text, image, document, audio, voice] = parsed;
  assert.equal(text.kind, "text");
  assert.equal(text.body, "Hi there");
  assert.equal(text.phoneNumberId, "phone_abc");
  assert.equal(text.wabaId, "waba_123");
  assert.equal(text.displayPhoneNumber, "+91 90000 00000");
  assert.equal(text.mediaId, null);

  assert.equal(image.kind, "image");
  assert.equal(image.body, "invoice");
  assert.equal(image.mediaId, "media_1");
  assert.equal(image.mimeType, "image/jpeg");

  assert.equal(document.kind, "document");
  assert.equal(document.body, "quote.pdf");
  assert.equal(document.mediaId, "media_2");

  assert.equal(audio.kind, "audio");
  assert.equal(audio.mediaId, "media_3");

  assert.equal(voice.kind, "voice");
  assert.equal(voice.mediaId, "media_4");

  assert.deepEqual(parseInboundWhatsAppWebhook({}), []);

  // A change with no metadata.phone_number_id can't be routed — skipped entirely
  const noPhoneId = parseInboundWhatsAppWebhook({
    entry: [{ id: "waba_x", changes: [{ value: { messages: [{ id: "m", from: "1", timestamp: "1", type: "text", text: { body: "x" } }] } }] }],
  });
  assert.deepEqual(noPhoneId, []);

  const rawBody = JSON.stringify(payload);
  const secret = "test-app-secret";
  process.env.WHATSAPP_APP_SECRET = secret;
  const validSig = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, validSig), true);
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, "sha256=deadbeef"), false);
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, null), false);
  // Test parseWhatsAppStatusUpdates with Meta error payloads
  const statusPayload = {
    entry: [
      {
        id: "1420911403384345",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "993296527209625", display_phone_number: "+91 77778 12777" },
              statuses: [
                {
                  id: "wamid.delivered123",
                  status: "delivered",
                  timestamp: "1726054800",
                  recipient_id: "919900234189",
                },
                {
                  id: "wamid.failed456",
                  status: "failed",
                  timestamp: "1726054821",
                  recipient_id: "918242407890",
                  errors: [
                    {
                      code: 131026,
                      title: "Message undeliverable",
                      message: "Message Undeliverable.",
                      error_data: { details: "Message Undeliverable." },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const parsedStatuses = parseWhatsAppStatusUpdates(statusPayload);
  assert.equal(parsedStatuses.length, 2);

  assert.equal(parsedStatuses[0].providerMessageId, "wamid.delivered123");
  assert.equal(parsedStatuses[0].status, "delivered");
  assert.equal(parsedStatuses[0].phoneNumberId, "993296527209625");
  assert.equal(parsedStatuses[0].recipientId, "919900234189");

  assert.equal(parsedStatuses[1].providerMessageId, "wamid.failed456");
  assert.equal(parsedStatuses[1].status, "failed");
  assert.equal(parsedStatuses[1].recipientId, "918242407890");
  assert.equal(parsedStatuses[1].errors?.length, 1);
  assert.equal(parsedStatuses[1].errors?.[0]?.code, 131026);
  assert.equal(parsedStatuses[1].errors?.[0]?.title, "Message undeliverable");

  // Test canTransitionWhatsAppStatus guards
  assert.equal(canTransitionWhatsAppStatus("queued", "sent"), true);
  assert.equal(canTransitionWhatsAppStatus("sent", "delivered"), true);
  assert.equal(canTransitionWhatsAppStatus("delivered", "read"), true);
  assert.equal(canTransitionWhatsAppStatus("delivered", "failed"), false, "DELIVERED must NEVER overwrite with FAILED");
  assert.equal(canTransitionWhatsAppStatus("read", "failed"), false, "READ must NEVER overwrite with FAILED");
  assert.equal(canTransitionWhatsAppStatus("read", "delivered"), false, "READ cannot regress to DELIVERED");
  assert.equal(canTransitionWhatsAppStatus("sent", "failed"), true);
  assert.equal(canTransitionWhatsAppStatus("failed", "sent"), false);

  console.log("webhook.test.ts (@stratxcel/whatsapp): ALL PASS (inbound, status error parsing, and transition guards)");
}

run();
