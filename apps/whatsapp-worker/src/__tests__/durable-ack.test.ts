// Run with: node --experimental-strip-types apps/whatsapp-worker/src/__tests__/durable-ack.test.ts
//
// Proves server.ts's HTTP 200 is never emitted before every message/status
// in a delivery has reached a durable outcome (queued, an intentional
// policy drop, a recorded unmatched event, or resolved through existing
// idempotency), and that a genuine persistence failure returns a non-2xx
// so Meta redelivers — never silently. Uses hand-built fake
// http.IncomingMessage/ServerResponse objects (no real socket) and the
// shared in-memory fake Supabase — no network, no real Postgres, no real
// Meta call.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { QueueAdapter } from "@stratxcel/queue";
import { createFakeSupabase, type Tables } from "../../../../packages/whatsapp/src/__tests__/support/fake-supabase.ts";

Reflect.set(process.env, "NODE_ENV", "test");
const { handleInbound, handleVerification } = await import("../server.ts");

const TENANT = "tenant-1";
const APP_SECRET = "test-app-secret-not-real";

function sign(body: string): string {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
}

/** Minimal fake http.IncomingMessage: just enough for readRawBody()'s req.on('data'/'end') and req.headers. */
class FakeRequest extends EventEmitter {
  headers: Record<string, string>;
  constructor(body: string, headers: Record<string, string>) {
    super();
    this.headers = headers;
    queueMicrotask(() => {
      this.emit("data", Buffer.from(body, "utf8"));
      this.emit("end");
    });
  }
}

/** Minimal fake http.ServerResponse: records exactly what handleInbound/handleVerification write. */
function fakeResponse() {
  const res = {
    statusCode: undefined as number | undefined,
    headersSent: false,
    body: "",
    writeHead(status: number, _headers?: Record<string, string>) {
      res.statusCode = status;
      res.headersSent = true;
      return res;
    },
    end(chunk?: string) {
      if (chunk) res.body += chunk;
      return res;
    },
  };
  return res;
}

function fakeQueue(overrides: Partial<QueueAdapter> = {}): { queue: QueueAdapter; enqueueCalls: unknown[] } {
  const enqueueCalls: unknown[] = [];
  const queue: QueueAdapter = {
    async enqueue(input) {
      enqueueCalls.push(input);
      return { id: `job-${enqueueCalls.length}`, tenant_id: input.tenantId, job_type: input.jobType, status: "PENDING" } as never;
    },
    async claimNext() {
      return null;
    },
    async heartbeat() {
      return null;
    },
    async complete() {
      return null;
    },
    async fail() {
      return null;
    },
    async cancel() {
      return null;
    },
    async recoverExpiredLeases() {
      return [];
    },
    async listDeadLetter() {
      return [];
    },
    async listForTenant() {
      return [];
    },
    async requeueDeadLetter() {
      return null;
    },
    ...overrides,
  };
  return { queue, enqueueCalls };
}

function textMessagePayload(providerMessageId: string, phoneNumberId: string, from = "919999000004"): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "122126073314774540",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "910000000000", phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Durable Ack Test" }, wa_id: from }],
              messages: [{ from, id: providerMessageId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hello" } }],
            },
            field: "messages",
          },
        ],
      },
    ],
  });
}

function seed(overrides: Partial<Tables> = {}): Tables {
  return {
    whatsapp_phone_bindings: [{ id: "binding-1", tenant_id: TENANT, phone_number_id: "993296527209625", status: "active", inbound_enabled: true, outbound_enabled: false, source: "migrated_verified_bot" }],
    ...overrides,
  };
}

async function run() {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  try {
    // --- 1/2. HTTP 200 is not emitted before a successful enqueue; enqueue success -> 200 ---
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue, enqueueCalls } = fakeQueue();
      const body = textMessagePayload("wamid.durable-1", "993296527209625");
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
      assert.equal(enqueueCalls.length, 1, "the ack must not be sent until enqueue actually ran");
      assert.equal((enqueueCalls[0] as { idempotencyKey: string }).idempotencyKey, "whatsapp_message:wamid.durable-1");
    }

    // --- 3. enqueue failure -> non-2xx (Meta must redeliver) ----------------
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue } = fakeQueue({
        async enqueue() {
          throw new Error("simulated transient queue failure");
        },
      });
      const body = textMessagePayload("wamid.durable-3", "993296527209625");
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.ok(res.statusCode !== undefined && res.statusCode >= 500 && res.statusCode < 600, `expected a 5xx so Meta redelivers, got ${res.statusCode}`);
    }

    // --- 4. duplicate/deduped enqueue -> 200 --------------------------------
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue, enqueueCalls } = fakeQueue();
      const body = textMessagePayload("wamid.durable-4", "993296527209625");
      const req1 = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res1 = fakeResponse();
      await handleInbound(req1 as never, res1 as never, { queue, whatsapp });
      const req2 = new FakeRequest(body, { "x-hub-signature-256": sign(body) }); // simulates Meta's at-least-once redelivery
      const res2 = fakeResponse();
      await handleInbound(req2 as never, res2 as never, { queue, whatsapp });
      assert.equal(res1.statusCode, 200);
      assert.equal(res2.statusCode, 200, "a redelivery must still ack 200 — the queue's own idempotency handles the dedup, not the webhook layer");
      assert.equal(enqueueCalls.length, 2, "the webhook layer always calls enqueue — deduping is the queue adapter's job (proven separately by the terminal-idempotency tests), not server.ts's");
    }

    // --- 5. signature failure -> 401 without queue access -------------------
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue, enqueueCalls } = fakeQueue();
      const body = textMessagePayload("wamid.durable-5", "993296527209625");
      const req = new FakeRequest(body, { "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000" });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.equal(res.statusCode, 401);
      assert.equal(enqueueCalls.length, 0, "an invalid signature must never reach the queue at all");
    }

    // --- 6. inbound disabled -> 200 and no queue job ------------------------
    {
      const { client: whatsapp } = createFakeSupabase(seed({ whatsapp_phone_bindings: [{ id: "binding-1", tenant_id: TENANT, phone_number_id: "993296527209625", status: "active", inbound_enabled: false, outbound_enabled: false, source: "migrated_verified_bot" }] }));
      const { queue, enqueueCalls } = fakeQueue();
      const body = textMessagePayload("wamid.durable-6", "993296527209625");
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.equal(res.statusCode, 200, "an intentional policy drop is still a durable outcome — Meta must not be asked to redeliver forever");
      assert.equal(enqueueCalls.length, 0);
    }

    // --- unbound phone_number_id -> 200, unmatched event recorded, no queue job ---
    {
      const { client: whatsapp, tables } = createFakeSupabase(seed());
      const { queue, enqueueCalls } = fakeQueue();
      const body = textMessagePayload("wamid.durable-unbound", "000000000000000");
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.equal(res.statusCode, 200);
      assert.equal(enqueueCalls.length, 0);
      assert.equal((tables.whatsapp_unmatched_events ?? []).length, 1, "an unbound phone_number_id must still reach a durable outcome (a recorded unmatched event) before ack");
    }

    // --- 7. malformed JSON body does not crash the process, returns 400 ----
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue } = fakeQueue();
      const body = "{not valid json";
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp }); // must not throw
      assert.equal(res.statusCode, 400);
    }
    // valid JSON, wrong/empty shape: also must not crash, resolves harmlessly to 200
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue, enqueueCalls } = fakeQueue();
      const body = JSON.stringify({ unexpected: "shape" });
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.equal(res.statusCode, 200);
      assert.equal(enqueueCalls.length, 0);
    }

    // --- 8. status-update DB failure does not silently claim success -------
    {
      const { client: whatsapp } = createFakeSupabase(seed(), { failRpc: ["update_whatsapp_message_status"] });
      const { queue } = fakeQueue();
      const statusBody = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "122126073314774540",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { display_phone_number: "910000000000", phone_number_id: "993296527209625" },
                  statuses: [{ id: "wamid.outbound-status-test", status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)) }],
                },
                field: "messages",
              },
            ],
          },
        ],
      });
      const req = new FakeRequest(statusBody, { "x-hub-signature-256": sign(statusBody) });
      const res = fakeResponse();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      assert.ok(res.statusCode !== undefined && res.statusCode >= 500, `a transient status-update failure must not be acked as success, got ${res.statusCode}`);
    }

    // --- valid verification challenge -> 200 exact challenge, invalid token -> 403 ---
    {
      process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
      const url = new URL("http://local/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123");
      const res = fakeResponse();
      await handleVerification(url, res as never);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body, "abc123");

      const badUrl = new URL("http://local/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123");
      const res2 = fakeResponse();
      await handleVerification(badUrl, res2 as never);
      assert.equal(res2.statusCode, 403);
    }

    // --- 10. response stays fast when dependencies are healthy -------------
    {
      const { client: whatsapp } = createFakeSupabase(seed());
      const { queue } = fakeQueue();
      const body = textMessagePayload("wamid.durable-speed", "993296527209625");
      const req = new FakeRequest(body, { "x-hub-signature-256": sign(body) });
      const res = fakeResponse();
      const start = Date.now();
      await handleInbound(req as never, res as never, { queue, whatsapp });
      const elapsedMs = Date.now() - start;
      assert.equal(res.statusCode, 200);
      assert.ok(elapsedMs < 2000, `durable ack took ${elapsedMs}ms against an in-memory fake — should be near-instant, not waiting on conversation processing`);
    }

    console.log("durable-ack.test.ts (@stratxcel/whatsapp-worker): ALL PASS");
  } finally {
    if (originalSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = originalSecret;
  }
}

run();
