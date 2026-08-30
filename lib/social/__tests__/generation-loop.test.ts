// Run with: node --experimental-strip-types lib/social/__tests__/generation-loop.test.ts
import assert from "node:assert/strict";
import { runGenerationLoop, correctiveInstructionsFor, DEFAULT_MAX_ATTEMPTS } from "../generation-loop.ts";
import { scoreGeneratedContent, type QualityScoreInput } from "../quality-score.ts";

const BASE_SCORE_INPUT: Omit<QualityScoreInput, "caption" | "title" | "hashtags"> = {
  businessName: "Coastal Kitchen",
  contentPillar: "Menu education",
  concept: "dish spotlight",
  industry: "restaurant",
  verifiedFacts: ["Business location (as provided by the owner): Fort Kochi"],
  brandTone: [],
  blockedPhrases: [],
  forbiddenClaims: [],
  audience: "local food lovers in Kochi",
  objective: "ENGAGEMENT",
  recentCaptions: [],
  recentConcepts: [],
};

const GOOD_CONTENT = {
  caption: "Fresh Kerala fish curry served hot every morning at Coastal Kitchen, Fort Kochi. Book a table for tonight's dinner service.",
  title: "Fresh Fish Curry Tonight",
  hashtags: ["#FortKochi", "#KeralaFood"],
};
const BAD_CONTENT = { caption: "Experience amazing service at our business. Contact us today!", title: "Amazing Service", hashtags: ["#business"] };

async function testSucceedsOnFirstAttemptWhenAlreadyGood() {
  let calls = 0;
  const result = await runGenerationLoop({
    generate: async () => {
      calls += 1;
      return GOOD_CONTENT;
    },
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, true);
  assert.equal(calls, 1, "must not call generate again once the first attempt already passes");
  assert.equal(result.attempts.length, 1);
  console.log("generation-loop.test.ts: succeeds on first attempt, no wasted retries — PASS");
}

async function testRetriesWithCorrectiveInstructionsUntilItPasses() {
  const receivedInstructions: string[][] = [];
  const result = await runGenerationLoop({
    generate: async (instructions) => {
      receivedInstructions.push(instructions);
      return receivedInstructions.length === 1 ? BAD_CONTENT : GOOD_CONTENT;
    },
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, true);
  assert.equal(result.attempts.length, 2);
  assert.equal(receivedInstructions[0].length, 0, "first attempt gets no corrective instructions");
  assert.ok(receivedInstructions[1].length > 0, "second attempt must receive corrective instructions from the first failure");
  assert.ok(receivedInstructions[1].some((i) => i.toLowerCase().includes("placeholder") || i.toLowerCase().includes("generic")), "the instruction must actually target what was wrong, not a blind retry");
  console.log("generation-loop.test.ts: regenerates with targeted corrective instructions until it passes — PASS");
}

async function testCorrectiveInstructionsAccumulateAcrossAttempts() {
  const receivedInstructions: string[][] = [];
  await runGenerationLoop({
    maxAttempts: 3,
    generate: async (instructions) => {
      receivedInstructions.push(instructions);
      return BAD_CONTENT; // always fails, to force all 3 attempts
    },
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(receivedInstructions.length, 3);
  assert.ok(receivedInstructions[2].length >= receivedInstructions[1].length, "instructions must accumulate, not reset each attempt");
  console.log("generation-loop.test.ts: corrective instructions accumulate across attempts — PASS");
}

async function testExhaustsMaxAttemptsAndReportsSpecificReason() {
  const result = await runGenerationLoop({
    generate: async () => BAD_CONTENT,
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, false);
  assert.equal(result.attempts.length, DEFAULT_MAX_ATTEMPTS);
  assert.ok(result.finalReason, "a failed loop must always report why");
  assert.notEqual(result.finalReason, "quality gate failed", "must never be the bare generic message the campaign was told to eliminate");
  console.log("generation-loop.test.ts: exhausts max attempts and reports a specific final reason — PASS");
}

async function testNonCorrectableFailureStopsImmediately() {
  let calls = 0;
  const result = await runGenerationLoop({
    generate: async () => {
      calls += 1;
      return { caption: "A perfectly fine caption about food and dining in the neighborhood.", title: "Fine Caption", hashtags: ["#food"] };
    },
    toScoreInput: () => ({ ...BASE_SCORE_INPUT, businessName: "", caption: "irrelevant", title: "irrelevant", hashtags: [] }),
  });
  assert.equal(result.success, false);
  assert.equal(calls, 1, "a non-correctable failure (missing brand context) must not burn the full retry budget");
  assert.equal(result.attempts.length, 1);
  console.log("generation-loop.test.ts: a non-correctable failure stops immediately instead of wasting retries — PASS");
}

// Self-Critique Q9 ("can it fail silently?"): a provider/network error mid-
// loop must never silently discard earlier attempts' diagnostics via an
// uncaught throw -- it must surface as a specific, diagnosable result.
async function testProviderErrorNeverSilentlyDiscardsPriorDiagnostics() {
  let calls = 0;
  const result = await runGenerationLoop({
    generate: async () => {
      calls += 1;
      if (calls === 1) return BAD_CONTENT; // real quality-gate failure, recorded normally
      throw new Error("upstream provider rate limited (HTTP 429)"); // then a real provider failure
    },
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, false);
  assert.equal(calls, 2);
  assert.equal(result.attempts.length, 2, "the failed first attempt's diagnostics must still be present, not discarded by the second attempt's throw");
  assert.equal(result.attempts[0].hardFailureReasons.length > 0, true, "attempt 1's real quality-gate failure reasons must survive");
  assert.equal(result.attempts[1].generationError, "upstream provider rate limited (HTTP 429)");
  assert.ok(result.finalReason?.includes("rate limited"), "the final reason must include the real underlying provider error, not a generic message");
  console.log("generation-loop.test.ts: a provider error mid-loop never silently discards prior attempt diagnostics — PASS");
}

// STRATXCEL full-system closure brief, Section 6/8: real bug found live --
// this is the exact class of failure ("AI service temporarily
// unavailable"/"Usage limit reached") confirmed to be the real root cause
// for 30 of StratXcel's 50 real recovery-exhausted queue items. A
// transient provider failure must be classified as genuinely retryable so
// prepareNearTermPackageItems (package-autopilot.ts) can leave the item's
// recovery budget untouched, mirroring the same real protection
// package-net-new-media.ts's NetNewGenerationError.retryable already gives
// image generation.
async function testTransientProviderFailureIsClassifiedAsRetryable() {
  const result = await runGenerationLoop({
    generate: async (): Promise<typeof GOOD_CONTENT> => {
      throw new Error("upstream request timed out");
    },
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, false);
  assert.equal(result.generationErrorRetryable, true, "a real transient provider condition (timeout) must be classified as retryable, never silently treated as a genuine content failure");
  console.log("generation-loop.test.ts: a transient provider failure (timeout) is classified as retryable — PASS");
}

async function testNonTransientProviderFailureIsNotRetryable() {
  const result = await runGenerationLoop({
    generate: async (): Promise<typeof GOOD_CONTENT> => {
      throw new Error("content blocked by safety system");
    },
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, false);
  assert.equal(result.generationErrorRetryable, false, "a genuine safety refusal is a real content-shaped outcome, not an infrastructure condition -- must never be classified as retryable");
  console.log("generation-loop.test.ts: a non-transient provider failure (safety refusal) is never classified as retryable — PASS");
}

async function testGenuineQualityGateExhaustionIsNeverRetryable() {
  const result = await runGenerationLoop({
    generate: async () => BAD_CONTENT, // always fails the real quality gate, never throws
    toScoreInput: (content) => ({ ...BASE_SCORE_INPUT, ...content }),
  });
  assert.equal(result.success, false);
  assert.equal(result.generationErrorRetryable, false, "a genuine, repeated quality-gate rejection is a real content-shaped outcome -- must correctly still consume the bounded recovery budget, never be exempted");
  console.log("generation-loop.test.ts: a genuine quality-gate exhaustion (not a provider error) is never classified as retryable — PASS");
}

function testCorrectiveInstructionsForReturnsSpecificText() {
  const badScore = scoreGeneratedContent({ ...BASE_SCORE_INPUT, ...BAD_CONTENT });
  const instructions = correctiveInstructionsFor(badScore);
  assert.ok(instructions.length > 0);
  assert.ok(instructions.every((i) => i.length > 20), "every instruction must be a real, specific sentence, not a stub");
  console.log("generation-loop.test.ts: correctiveInstructionsFor produces real, specific text per failure — PASS");
}

async function run() {
  await testSucceedsOnFirstAttemptWhenAlreadyGood();
  await testRetriesWithCorrectiveInstructionsUntilItPasses();
  await testCorrectiveInstructionsAccumulateAcrossAttempts();
  await testExhaustsMaxAttemptsAndReportsSpecificReason();
  await testNonCorrectableFailureStopsImmediately();
  await testProviderErrorNeverSilentlyDiscardsPriorDiagnostics();
  await testTransientProviderFailureIsClassifiedAsRetryable();
  await testNonTransientProviderFailureIsNotRetryable();
  await testGenuineQualityGateExhaustionIsNeverRetryable();
  testCorrectiveInstructionsForReturnsSpecificText();
  console.log("generation-loop.test.ts: ALL PASS");
}

run();
