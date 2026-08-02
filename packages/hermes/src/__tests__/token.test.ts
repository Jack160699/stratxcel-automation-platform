// Run with: node --experimental-strip-types packages/hermes/src/__tests__/token.test.ts
import assert from "node:assert/strict";
import { issueMissionToken, verifyMissionToken, isToolAllowed } from "../token.ts";

function run() {
  process.env.HERMES_GATEWAY_SECRET = "test-gateway-secret";

  const token = issueMissionToken({
    missionId: "mission-1",
    tenantId: "tenant-1",
    allowedTools: ["get_brand_context", "create_draft_artifact"],
  });

  const verified = verifyMissionToken(token);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.payload.missionId, "mission-1");
    assert.equal(verified.payload.tenantId, "tenant-1");
    assert.equal(isToolAllowed(verified.payload, "get_brand_context"), true);
    assert.equal(isToolAllowed(verified.payload, "submit_publish_request"), false);
  }

  // Tampering with the payload (even just re-encoding a modified tenantId)
  // must invalidate the signature.
  const [encodedPayload, signature] = token.split(".");
  const tamperedPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  tamperedPayload.tenantId = "attacker-tenant";
  const tamperedEncoded = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
  const tamperedToken = `${tamperedEncoded}.${signature}`;
  const tamperedResult = verifyMissionToken(tamperedToken);
  assert.equal(tamperedResult.ok, false);
  if (!tamperedResult.ok) assert.equal(tamperedResult.reason, "invalid_signature");

  // Malformed tokens
  assert.equal(verifyMissionToken("not-a-real-token").ok, false);

  // Expiry
  const expiredToken = issueMissionToken({ missionId: "m2", tenantId: "t2", allowedTools: [], ttlMs: -1000 });
  const expiredResult = verifyMissionToken(expiredToken);
  assert.equal(expiredResult.ok, false);
  if (!expiredResult.ok) assert.equal(expiredResult.reason, "expired");

  // Wrong secret can't verify a token issued under a different secret
  const otherToken = issueMissionToken({ missionId: "m3", tenantId: "t3", allowedTools: [] });
  process.env.HERMES_GATEWAY_SECRET = "different-secret";
  assert.equal(verifyMissionToken(otherToken).ok, false);

  delete process.env.HERMES_GATEWAY_SECRET;
  console.log("token.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
