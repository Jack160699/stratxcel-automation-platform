// Dedicated "third-class generic AI copy" regression suite (build brief
// Phase H). Complements quality-score.test.ts's broader coverage with a
// single file that exists specifically to catch generic-copy regressions.
//
// HONEST LIMITATION (see this file's last test and the final report): this
// is a deterministic, keyword/heuristic-based scorer, not an LLM judge. It
// reliably catches the brief's own named phrases and rewards genuine,
// measurable specificity (business name + verified facts + industry
// vocabulary actually present). It will NOT catch every possible creative
// paraphrase of generic marketing speak that avoids all of those signals --
// that class of judgment genuinely requires a live model call, which this
// build does not have. The ablation test below demonstrates the mechanism
// it DOES implement: reward for real specificity, not just absence of
// banned words.
//
// Run with: node --experimental-strip-types lib/social/__tests__/generic-content-regression.test.ts

import assert from "node:assert/strict";
import { scoreGeneratedContent, type QualityScoreInput } from "../quality-score.ts";
import { findPlaceholderOrFiller } from "../placeholder-detection.ts";

const BASE: QualityScoreInput = {
  caption: "",
  title: "",
  hashtags: [],
  businessName: "Coastal Kitchen",
  contentPillar: "Menu education",
  concept: "dish spotlight",
  industry: "restaurant",
  verifiedFacts: ["Business location (as provided by the owner): Fort Kochi"],
  audience: "local food lovers in Kochi",
  objective: "ENGAGEMENT",
};

// Every "third-class generic AI copy" phrase this campaign was explicitly
// told to reject.
const PHASE_H_NAMED_PHRASES = [
  "Grow your business...",
  "Quality you can trust...",
  "Contact us today...",
  "Experience excellence...",
  "Don't miss out...",
  "Visit us today...",
  "Your trusted partner...",
  "Something special is waiting...",
  "Elevate your experience...",
];

function testEveryNamedPhraseIsCaught() {
  for (const phrase of PHASE_H_NAMED_PHRASES) {
    const caption = `${phrase} We're here for you.`;
    const scoreResult = scoreGeneratedContent({ ...BASE, caption, title: "Update", hashtags: ["#update"] });
    const flaggedByScorer = scoreResult.hardFailures.length > 0;
    const flaggedByPlaceholderDetector = Boolean(findPlaceholderOrFiller(caption));
    assert.ok(flaggedByScorer || flaggedByPlaceholderDetector, `must be rejected: "${phrase}"`);
  }
  console.log("generic-content-regression.test.ts: every Phase H-named generic phrase is rejected — PASS");
}

// --- The brief's own explicit BAD vs BETTER example. ---
function testBadVsBetterExample() {
  const bad = scoreGeneratedContent({ ...BASE, caption: "Experience amazing service at our business. Contact us today!", title: "Amazing Service", hashtags: ["#business"] });
  const better = scoreGeneratedContent({
    ...BASE,
    industry: "salon",
    caption: "Need a trim before the weekend? Book your appointment at Coastal Kitchen's sister salon in Fort Kochi -- walk-ins welcome Saturday morning.",
    title: "Book Your Weekend Trim",
    hashtags: ["#FortKochi"],
  });
  assert.ok(bad.hardFailures.length > 0, "BAD example must hard-fail");
  assert.ok(better.score > bad.score, "BETTER example must score meaningfully higher than BAD");
  console.log("generic-content-regression.test.ts: brief's own BAD vs BETTER example -- BETTER clearly outscores BAD — PASS");
}

// --- Ablation: proves the system rewards genuine specificity, not merely
// the absence of banned keywords. Same sentence SHAPE, same lack of banned
// phrases, only the presence of real business/fact grounding differs. ---
function testRewardsRealSpecificityNotJustAbsenceOfBadWords() {
  const withSpecifics: QualityScoreInput = {
    ...BASE,
    caption: "Fresh Kerala fish curry served hot every morning at Coastal Kitchen, Fort Kochi. Book a table for tonight's dinner service.",
    title: "Fresh Fish Curry Tonight",
    hashtags: ["#FortKochi"],
  };
  const withoutSpecifics: QualityScoreInput = {
    ...BASE,
    caption: "Fresh food served hot every morning at our place. Book a table for tonight's dinner service.",
    title: "Fresh Food Tonight",
    hashtags: ["#dinner"],
  };
  const scoredWith = scoreGeneratedContent(withSpecifics);
  const scoredWithout = scoreGeneratedContent(withoutSpecifics);
  // Neither literally contains a banned phrase -- the difference is purely
  // whether the copy is actually grounded in the real business.
  assert.equal(findPlaceholderOrFiller(withSpecifics.caption), null);
  assert.equal(findPlaceholderOrFiller(withoutSpecifics.caption), null);
  assert.ok(scoredWith.score > scoredWithout.score, "removing business name + real facts (while keeping the same sentence shape and no banned words) must measurably lower the score -- proving this isn't just blacklist-avoidance");
  console.log("generic-content-regression.test.ts: real specificity is rewarded beyond mere absence of banned words (documented scorer limitation: not a full semantic/LLM judge) — PASS");
}

function run() {
  testEveryNamedPhraseIsCaught();
  testBadVsBetterExample();
  testRewardsRealSpecificityNotJustAbsenceOfBadWords();
  console.log("generic-content-regression.test.ts: ALL PASS");
}

run();
