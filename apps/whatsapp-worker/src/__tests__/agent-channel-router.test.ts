// Run with: node --experimental-strip-types apps/whatsapp-worker/src/__tests__/agent-channel-router.test.ts
import assert from "node:assert/strict";
import { routeToAgentChannel } from "../agent-channel-router.ts";

// All env reads inside routeToAgentChannel()/buildAgentChannelSignature()/
// isWhatsAppAgentChannelEnabled() happen at CALL time, not module-load time,
// so a single import can be reused across differently-configured cases below.

async function run() {
  const sampleMessage = {
    from: "919876543210",
    providerMessageId: "wamid.agent-router-1",
    body: "WHOAMI",
    kind: "text",
  } as any;

  const originalFetch = globalThis.fetch;

  // --- Regression #44/45: flag absent/false -> router itself is defensive
  // and returns "unlinked" without ever calling fetch, even if invoked
  // directly. The real regression guarantee that processor.ts's behavior is
  // unchanged when the flag is off is covered separately by
  // auto-reply.test.ts / durable-ack.test.ts staying green unmodified.
  {
    delete process.env.WHATSAPP_AGENT_CHANNEL_ENABLED;
    delete process.env.STRATXCEL_AGENT_CHANNEL_SECRET;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch must not be called when the flag is off");
    }) as typeof fetch;
    const result = await routeToAgentChannel({ endpointUrl: "http://localhost:0/unused", message: sampleMessage });
    assert.deepEqual(result, { outcome: "unlinked" });
    assert.equal(fetchCalled, false, "router must not call fetch when the flag is disabled");
  }

  // --- Flag on, secret not configured -> fail closed to "unavailable", never fetch. ---
  {
    process.env.WHATSAPP_AGENT_CHANNEL_ENABLED = "true";
    delete process.env.STRATXCEL_AGENT_CHANNEL_SECRET;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    const result = await routeToAgentChannel({ endpointUrl: "http://localhost:0/unused", message: sampleMessage });
    assert.equal(result.outcome, "unavailable");
    assert.equal(fetchCalled, false);
  }

  // --- Flag on, secret configured, endpoint returns a typed outcome. ---
  {
    process.env.WHATSAPP_AGENT_CHANNEL_ENABLED = "true";
    process.env.STRATXCEL_AGENT_CHANNEL_SECRET = "test-secret-router";
    let capturedHeaders: Record<string, string> | null = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({ outcome: "reply", text: "Linked as Stratxcel staff." }),
      } as Response;
    }) as typeof fetch;
    const result = await routeToAgentChannel({ endpointUrl: "http://localhost:0/agent", message: sampleMessage });
    assert.deepEqual(result, { outcome: "reply", text: "Linked as Stratxcel staff." });
    assert.ok(capturedHeaders && capturedHeaders["x-stratxcel-signature"], "must sign the request");
  }

  // --- Endpoint unreachable / non-2xx -> "unavailable", never throws. ---
  {
    process.env.WHATSAPP_AGENT_CHANNEL_ENABLED = "true";
    process.env.STRATXCEL_AGENT_CHANNEL_SECRET = "test-secret-router";
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await routeToAgentChannel({ endpointUrl: "http://localhost:0/agent", message: sampleMessage });
    assert.equal(result.outcome, "unavailable");
  }

  globalThis.fetch = originalFetch;
  delete process.env.WHATSAPP_AGENT_CHANNEL_ENABLED;
  delete process.env.STRATXCEL_AGENT_CHANNEL_SECRET;

  console.log("agent-channel-router.test.ts (@stratxcel/whatsapp-worker): ALL PASS");
}

run();
