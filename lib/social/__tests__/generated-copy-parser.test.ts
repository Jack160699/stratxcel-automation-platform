// Run with: node --experimental-strip-types lib/social/__tests__/generated-copy-parser.test.ts
import assert from "node:assert/strict";
import { parseGeneratedCopy } from "../generated-copy-parser.ts";

function testParsesWellFormedJson() {
  const text = JSON.stringify({ title: "Fresh Fish Curry", masterIdea: "Feature the fish curry", caption: "Fresh Kerala fish curry served hot every morning.", hashtags: ["#FortKochi", "KeralaFood"] });
  const result = parseGeneratedCopy(text);
  assert.equal(result.title, "Fresh Fish Curry");
  assert.equal(result.caption, "Fresh Kerala fish curry served hot every morning.");
  assert.deepEqual(result.hashtags, ["FortKochi", "KeralaFood"], "leading # must be stripped");
  console.log("generated-copy-parser.test.ts: parses well-formed JSON — PASS");
}

function testHandlesJsonEmbeddedInProse() {
  // Models sometimes wrap JSON in prose despite instructions -- the regex
  // extraction must still find it.
  const text = `Here is the post:\n\n${JSON.stringify({ title: "T", masterIdea: "M", caption: "A real caption here.", hashtags: [] })}\n\nLet me know if you'd like changes.`;
  const result = parseGeneratedCopy(text);
  assert.equal(result.caption, "A real caption here.");
  console.log("generated-copy-parser.test.ts: extracts JSON embedded in surrounding prose — PASS");
}

function testNeverThrowsOnMalformedResponse() {
  for (const bad of ["", "not json at all", "{broken json", "null", "[]"]) {
    const result = parseGeneratedCopy(bad);
    assert.equal(result.caption, "");
    assert.equal(result.title, "");
    assert.deepEqual(result.hashtags, []);
  }
  console.log("generated-copy-parser.test.ts: never throws on malformed/empty responses — PASS");
}

function testTitleFallsBackToCaptionPrefix() {
  const text = JSON.stringify({ caption: "A caption with no title provided by the model at all here.", hashtags: [] });
  const result = parseGeneratedCopy(text);
  assert.equal(result.title, "A caption with no title provided by the model at all here.".slice(0, 60));
  console.log("generated-copy-parser.test.ts: title falls back to a caption prefix when missing — PASS");
}

function testDoesNotReadContentPillarOrObjectiveFromModel() {
  // Phase C: strategy is decided by CreativeBrief before generation, never
  // parsed back from the model's response -- even if the model includes
  // these fields, they must be ignored.
  const text = JSON.stringify({ contentPillar: "Invented Pillar", objective: "SALES", title: "T", masterIdea: "M", caption: "Real caption text here.", hashtags: [] });
  const result = parseGeneratedCopy(text);
  assert.ok(!("contentPillar" in result));
  assert.ok(!("objective" in result));
  console.log("generated-copy-parser.test.ts: ignores contentPillar/objective even if the model includes them — PASS");
}

function run() {
  testParsesWellFormedJson();
  testHandlesJsonEmbeddedInProse();
  testNeverThrowsOnMalformedResponse();
  testTitleFallsBackToCaptionPrefix();
  testDoesNotReadContentPillarOrObjectiveFromModel();
  console.log("generated-copy-parser.test.ts: ALL PASS");
}

run();
