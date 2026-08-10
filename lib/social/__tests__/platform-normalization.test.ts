// Tests the canonical platform normalization boundary (Section 8 of the
// Copilot workspace/execution-integrity brief): a connected Threads account
// stored as "threads" must match a model-generated content variant platform
// of "THREADS", while genuinely different platforms must still fail.
// Run with: node --experimental-strip-types lib/social/__tests__/platform-normalization.test.ts

import assert from "node:assert/strict";
import { normalizePlatform, platformsMatch, requirePlatform, ContentDraftValidationError } from "../content-options.ts";

function run() {
  // normalizePlatform is case/whitespace-insensitive for every real platform.
  for (const [input, expected] of [
    ["threads", "threads"],
    ["THREADS", "threads"],
    ["Threads", "threads"],
    ["  threads  ", "threads"],
    ["linkedin", "linkedin"],
    ["LINKEDIN", "linkedin"],
    ["facebook", "facebook"],
    ["FACEBOOK", "facebook"],
    ["instagram", "instagram"],
    ["INSTAGRAM", "instagram"],
    ["youtube", "youtube"],
    ["YOUTUBE", "youtube"],
  ] as const) {
    assert.equal(normalizePlatform(input), expected, `normalizePlatform(${JSON.stringify(input)})`);
  }
  assert.equal(normalizePlatform("myspace"), null, "unknown platform normalizes to null, never a guess");
  assert.equal(normalizePlatform(null), null);
  assert.equal(normalizePlatform(42), null);

  // requirePlatform throws a normal (retryable) error for an invalid value,
  // and returns the canonical lowercase value for a valid one regardless of casing.
  assert.equal(requirePlatform("THREADS"), "threads");
  assert.throws(() => requirePlatform("myspace"), ContentDraftValidationError);
  assert.throws(() => requirePlatform(""), ContentDraftValidationError);

  // platformsMatch: the exact production bug — a connected account stored as
  // "threads" and a model-generated variant platform of "THREADS" must match.
  assert.equal(platformsMatch("threads", "THREADS"), true);
  assert.equal(platformsMatch("THREADS", "threads"), true);
  assert.equal(platformsMatch("LinkedIn", "linkedin"), true);
  assert.equal(platformsMatch("FACEBOOK", "Facebook"), true);
  assert.equal(platformsMatch("Instagram", "INSTAGRAM"), true);
  assert.equal(platformsMatch("YouTube", "youtube"), true);

  // Different platforms must still fail regardless of casing.
  assert.equal(platformsMatch("threads", "linkedin"), false);
  assert.equal(platformsMatch("THREADS", "Instagram"), false);
  assert.equal(platformsMatch("facebook", "youtube"), false);
  assert.equal(platformsMatch(null, "threads"), false);
  assert.equal(platformsMatch("threads", "not-a-platform"), false);

  console.log("platform-normalization.test.ts: ALL PASS (canonical casing, same-platform match, cross-platform rejection)");
}

run();
