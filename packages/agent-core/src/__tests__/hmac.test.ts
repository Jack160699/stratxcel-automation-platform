// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/hmac.test.ts
import assert from "node:assert/strict";
import { verifyAgentChannelRequest, buildAgentChannelSignature, __resetNonceCacheForTests } from "../hmac.ts";

async function run() {
  const SECRET = "test-hmac-secret";
  process.env.STRATXCEL_AGENT_CHANNEL_SECRET = SECRET;
  __resetNonceCacheForTests();

  const rawBody = JSON.stringify({ senderPhone: "919876543210", providerMessageId: "wamid.1", text: "WHOAMI" });

  // 35. valid accepted
  {
    const signed = buildAgentChannelSignature(rawBody)!;
    const result = verifyAgentChannelRequest({
      rawBody,
      timestampHeader: signed.timestamp,
      nonceHeader: signed.nonce,
      signatureHeader: signed.signature,
    });
    assert.deepEqual(result, { ok: true });
  }

  // 36. bad signature rejected
  {
    __resetNonceCacheForTests();
    const signed = buildAgentChannelSignature(rawBody)!;
    const result = verifyAgentChannelRequest({
      rawBody,
      timestampHeader: signed.timestamp,
      nonceHeader: `${signed.nonce}-fresh1`,
      signatureHeader: "0".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "bad_signature");
  }

  // 37. stale timestamp rejected
  {
    __resetNonceCacheForTests();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 60); // 1 hour old
    // Build a signature that WOULD be valid for this timestamp/nonce/body, to
    // isolate the staleness check from the signature check.
    const nonce = "stale-test-nonce";
    const secret = process.env.STRATXCEL_AGENT_CHANNEL_SECRET!;
    const { createHmac, createHash } = await import("node:crypto");
    const bodyDigest = createHash("sha256").update(rawBody, "utf8").digest("hex");
    const message = `${staleTimestamp}.${nonce}.${bodyDigest}`;
    const signature = createHmac("sha256", secret).update(message, "utf8").digest("hex");

    const result = verifyAgentChannelRequest({
      rawBody,
      timestampHeader: staleTimestamp,
      nonceHeader: nonce,
      signatureHeader: signature,
    });
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "stale_timestamp");
  }

  // 38. replayed nonce rejected
  {
    __resetNonceCacheForTests();
    const signed = buildAgentChannelSignature(rawBody)!;
    const first = verifyAgentChannelRequest({
      rawBody,
      timestampHeader: signed.timestamp,
      nonceHeader: signed.nonce,
      signatureHeader: signed.signature,
    });
    assert.equal(first.ok, true);

    // Re-send the exact same request (same timestamp+nonce+signature).
    const second = verifyAgentChannelRequest({
      rawBody,
      timestampHeader: signed.timestamp,
      nonceHeader: signed.nonce,
      signatureHeader: signed.signature,
    });
    assert.equal(second.ok, false);
    assert.equal((second as any).reason, "replayed_nonce");
  }

  // 39. altered body rejected
  {
    __resetNonceCacheForTests();
    const signed = buildAgentChannelSignature(rawBody)!;
    const alteredBody = JSON.stringify({ senderPhone: "919876543210", providerMessageId: "wamid.1", text: "CONFIRM 999999" });
    const result = verifyAgentChannelRequest({
      rawBody: alteredBody,
      timestampHeader: signed.timestamp,
      nonceHeader: signed.nonce,
      signatureHeader: signed.signature,
    });
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "bad_signature");
  }

  // not configured -> fails closed, never throws
  {
    delete process.env.STRATXCEL_AGENT_CHANNEL_SECRET;
    const result = verifyAgentChannelRequest({
      rawBody,
      timestampHeader: "123",
      nonceHeader: "n",
      signatureHeader: "s",
    });
    assert.deepEqual(result, { ok: false, reason: "not_configured" });
    assert.equal(buildAgentChannelSignature(rawBody), null);
    process.env.STRATXCEL_AGENT_CHANNEL_SECRET = SECRET;
  }

  // 40. no service-role key used as the HMAC secret — the module never reads
  // SUPABASE_SERVICE_ROLE_KEY at all; prove it by setting a service-role key
  // that would NOT match a signature built with the real agent secret, and
  // confirming that mismatched value cannot verify anything (i.e. the module
  // is not silently falling back to it).
  {
    __resetNonceCacheForTests();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "totally-different-service-role-key";
    const signed = buildAgentChannelSignature(rawBody)!;
    // Sign again using the service-role key to prove it produces a DIFFERENT
    // signature than the real one — if hmac.ts ever accidentally read
    // SUPABASE_SERVICE_ROLE_KEY instead of STRATXCEL_AGENT_CHANNEL_SECRET,
    // this would start passing, which is exactly what this assertion guards against.
    const { createHmac, createHash } = await import("node:crypto");
    const bodyDigest = createHash("sha256").update(rawBody, "utf8").digest("hex");
    const message = `${signed.timestamp}.${signed.nonce}.${bodyDigest}`;
    const wrongSignature = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY).update(message, "utf8").digest("hex");
    assert.notEqual(wrongSignature, signed.signature, "signing with SUPABASE_SERVICE_ROLE_KEY must never match the real HMAC secret's signature");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  delete process.env.STRATXCEL_AGENT_CHANNEL_SECRET;
  console.log("hmac.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
