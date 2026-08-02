// Run with: node --experimental-strip-types lib/integrations/whatsapp/__tests__/webhook.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { parseInboundWhatsAppWebhook, verifyWhatsAppWebhookSignature } from "../webhook.ts";

function run() {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: "wamid.1", from: "919999999999", timestamp: "1780000000", type: "text", text: { body: "Hi there" } },
                { id: "wamid.2", from: "919999999999", timestamp: "1780000010", type: "image" }, // non-text, skipped
              ],
            },
          },
        ],
      },
    ],
  };

  const parsed = parseInboundWhatsAppWebhook(payload);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].from, "919999999999");
  assert.equal(parsed[0].body, "Hi there");
  assert.equal(parsed[0].providerMessageId, "wamid.1");

  assert.deepEqual(parseInboundWhatsAppWebhook({}), []);

  // Signature verification (same X-Hub-Signature-256 scheme as Meta webhooks)
  const rawBody = JSON.stringify(payload);
  const secret = "test-app-secret";
  process.env.WHATSAPP_APP_SECRET = secret;
  const validSig = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, validSig), true);
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, "sha256=deadbeef"), false);
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, null), false);
  delete process.env.WHATSAPP_APP_SECRET;
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, validSig), false);

  console.log("webhook.test.ts (whatsapp): ALL PASS");
}

run();
