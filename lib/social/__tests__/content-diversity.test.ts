// Run with: node --experimental-strip-types lib/social/__tests__/content-diversity.test.ts
import assert from "node:assert/strict";
import { textSimilarity, checkRepetition, selectLeastRecentlyUsed, DUPLICATE_SIMILARITY_THRESHOLD } from "../content-diversity.ts";

function testTextSimilarityBasics() {
  assert.equal(textSimilarity("", "anything"), 0);
  assert.equal(textSimilarity("hello world", "hello world"), 1);
  const partial = textSimilarity("Fresh coffee brewed daily at our cafe", "Fresh pastries baked daily at our cafe");
  assert.ok(partial > 0.3 && partial < 1, `expected partial overlap, got ${partial}`);
  console.log("content-diversity.test.ts: textSimilarity basics — PASS");
}

function testSelectLeastRecentlyUsedPrefersUnused() {
  const pick = selectLeastRecentlyUsed(["a", "b", "c"], ["a", "a", "b"]);
  assert.equal(pick, "c", "an option never used recently must win over ones used repeatedly");
  console.log("content-diversity.test.ts: selectLeastRecentlyUsed prefers a genuinely unused option — PASS");
}

function testSelectLeastRecentlyUsedIsDeterministic() {
  // Same inputs -> same output, every time (no randomness).
  const results = new Set<string>();
  for (let i = 0; i < 5; i += 1) results.add(selectLeastRecentlyUsed(["x", "y", "z"], ["x", "y"]));
  assert.equal(results.size, 1);
  console.log("content-diversity.test.ts: selectLeastRecentlyUsed is deterministic — PASS");
}

function testSelectLeastRecentlyUsedThrowsOnEmptyCandidates() {
  assert.throws(() => selectLeastRecentlyUsed([], ["a"]));
  console.log("content-diversity.test.ts: throws on empty candidate list rather than returning undefined — PASS");
}

function testCheckRepetitionCatchesImmediateConceptRepeat() {
  const result = checkRepetition({ concept: "dish spotlight" }, [{ concept: "dish spotlight" }]);
  assert.equal(result.isDuplicate, true);
  assert.ok(result.reason?.includes("dish spotlight"));
  console.log("content-diversity.test.ts: catches the exact same concept posted twice in a row — PASS");
}

function testCheckRepetitionAllowsDifferentConcept() {
  const result = checkRepetition({ concept: "menu education" }, [{ concept: "dish spotlight" }]);
  assert.equal(result.isDuplicate, false);
  console.log("content-diversity.test.ts: a genuinely different concept is not flagged — PASS");
}

function testCheckRepetitionCatchesNearDuplicateCaption() {
  const recent = [{ captionText: "Fresh hot parathas served every morning at our Kochi kitchen. Come dine in from 8am!" }];
  const candidate = { captionText: "Fresh hot parathas served every morning at our Kochi kitchen. Come dine in from 8am today!" };
  const result = checkRepetition(candidate, recent);
  assert.equal(result.isDuplicate, true);
  assert.ok(result.similarity >= DUPLICATE_SIMILARITY_THRESHOLD);
  console.log("content-diversity.test.ts: near-identical caption text is caught as a duplicate — PASS");
}

function testCheckRepetitionAllowsSamePillarDifferentSpecifics() {
  const recent = [{ captionText: "Try our signature butter chicken, slow-cooked all day in a rich tomato gravy." }];
  const candidate = { captionText: "Our weekend brunch menu now features a new masala dosa with three homemade chutneys." };
  const result = checkRepetition(candidate, recent);
  assert.equal(result.isDuplicate, false, "two genuinely different dishes on the same pillar must not be flagged as duplicates");
  console.log("content-diversity.test.ts: same pillar, different specifics -> not a duplicate — PASS");
}

function testEmptyHistoryNeverFlags() {
  const result = checkRepetition({ concept: "anything", captionText: "Some caption text here" }, []);
  assert.equal(result.isDuplicate, false);
  console.log("content-diversity.test.ts: no history -> never a false duplicate flag — PASS");
}

function run() {
  testTextSimilarityBasics();
  testSelectLeastRecentlyUsedPrefersUnused();
  testSelectLeastRecentlyUsedIsDeterministic();
  testSelectLeastRecentlyUsedThrowsOnEmptyCandidates();
  testCheckRepetitionCatchesImmediateConceptRepeat();
  testCheckRepetitionAllowsDifferentConcept();
  testCheckRepetitionCatchesNearDuplicateCaption();
  testCheckRepetitionAllowsSamePillarDifferentSpecifics();
  testEmptyHistoryNeverFlags();
  console.log("content-diversity.test.ts: ALL PASS");
}

run();
