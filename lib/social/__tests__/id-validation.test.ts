// Tests the UUID guard that stands between model-generated tool arguments
// and Postgres (Section 9 of the integrity brief): a fabricated identifier
// like "SOCIAL_POSTING_Q3_2026" or "stratxcel-general-marketing" must never
// reach a `.eq("id", …)` filter — it must be rejected here first, as a
// normal retryable tool error, never a raw `invalid input syntax for type
// uuid` Postgres failure.
// Run with: node --experimental-strip-types lib/social/__tests__/id-validation.test.ts

import assert from "node:assert/strict";
import { isUuid, requireUuid, optionalUuid } from "../agent/id-validation.ts";

function run() {
  const realUuid = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  assert.equal(isUuid(realUuid), true);
  assert.equal(isUuid(realUuid.toUpperCase()), true, "UUIDs are case-insensitive");
  assert.equal(isUuid("SOCIAL_POSTING_Q3_2026"), false);
  assert.equal(isUuid("stratxcel-general-marketing"), false);
  assert.equal(isUuid("attach_01J9G6XN9M5R5S3J8Y7X4Q9Z1A"), false);
  assert.equal(isUuid("media_12345"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(123), false);

  assert.equal(requireUuid(realUuid, "campaignId"), realUuid);
  assert.throws(() => requireUuid("SOCIAL_POSTING_Q3_2026", "campaignId"), /campaignId must be a real ID/);
  assert.throws(() => requireUuid(undefined, "variantId"), /variantId must be a real ID/);
  // The error must name the offending field so the model can self-correct.
  try {
    requireUuid("stratxcel-general-marketing", "campaignId");
    assert.fail("expected requireUuid to throw");
  } catch (error) {
    assert.match((error as Error).message, /campaignId/);
    assert.match((error as Error).message, /stratxcel-general-marketing/);
    assert.match((error as Error).message, /Never invent one/);
  }

  // Optional relationship fields: absent/empty is a safe null, never a guess.
  assert.equal(optionalUuid(null, "campaignId"), null);
  assert.equal(optionalUuid(undefined, "campaignId"), null);
  assert.equal(optionalUuid("", "campaignId"), null);
  assert.equal(optionalUuid(realUuid, "campaignId"), realUuid);
  assert.throws(() => optionalUuid("SOCIAL_POSTING_Q3_2026", "campaignId"));

  console.log("id-validation.test.ts: ALL PASS (real UUID accepted, fabricated names rejected with a self-correcting message, optional fields stay null)");
}

run();
