// Run with: node --experimental-strip-types lib/social/__tests__/placeholder-detection.test.ts
import assert from "node:assert/strict";
import { findPlaceholderOrFiller } from "../placeholder-detection.ts";

function testCleanBusinessSpecificCaptionPasses() {
  const caption = "Fresh Malabar parathas served hot every morning at Coastal Kitchen, Kochi. Dine in from 8am.";
  assert.equal(findPlaceholderOrFiller(caption), null);
  console.log("placeholder-detection.test.ts: genuine business-specific copy passes clean — PASS");
}

function testBracketScaffoldingRejected() {
  for (const bad of [
    "Come visit us! [Add your custom words here]",
    "We are [Insert business name], the best in town.",
    "Located at [Add address], open daily.",
  ]) {
    assert.notEqual(findPlaceholderOrFiller(bad), null, `must reject: ${bad}`);
  }
  console.log("placeholder-detection.test.ts: bracket scaffolding rejected — PASS");
}

function testTemplateTokensRejected() {
  assert.notEqual(findPlaceholderOrFiller("Welcome to {{business_name}}!"), null);
  assert.notEqual(findPlaceholderOrFiller("TODO: write a real caption here"), null);
  assert.notEqual(findPlaceholderOrFiller("Lorem ipsum dolor sit amet"), null);
  assert.notEqual(findPlaceholderOrFiller("This is a placeholder caption."), null);
  console.log("placeholder-detection.test.ts: template tokens (TODO/lorem ipsum/{{}}) rejected — PASS");
}

function testBriefsNamedGenericPhrasesRejected() {
  // Verbatim examples the build brief calls out as unacceptable default content.
  for (const bad of [
    "Contact us today to learn more!",
    "We sell amazing products for everyone.",
    "Quality you can trust, every single time.",
    "Best service in town, guaranteed.",
    "Don't miss out on this!",
    "We're excited to announce our new store.",
    "Visit us today and see for yourself.",
    "Grow your business with us this year.",
    "We are your trusted partner in this industry.",
    "Something special is waiting for you inside.",
    "Experience excellence with every visit.",
    "Elevate your experience with us.",
    "Discover the magic of our space.",
    "Unleash your potential today.",
  ]) {
    assert.notEqual(findPlaceholderOrFiller(bad), null, `must reject: ${bad}`);
  }
  console.log("placeholder-detection.test.ts: brief's named generic filler phrases rejected — PASS");
}

function testCaseInsensitiveAndSubstringMatch() {
  assert.notEqual(findPlaceholderOrFiller("VISIT US TODAY for our weekend sale."), null);
  assert.notEqual(findPlaceholderOrFiller("Quality You Can Trust — that's our promise."), null);
  console.log("placeholder-detection.test.ts: case-insensitive substring matching — PASS");
}

function testReturnsTheOffendingSubstring() {
  const found = findPlaceholderOrFiller("Hello [Insert business name], welcome!");
  assert.equal(found, "[Insert business name]");
  console.log("placeholder-detection.test.ts: returns the exact offending match for diagnosability — PASS");
}

function testAiInstructionLeakageRejected() {
  // Finished Premium Marketing Creative brief Section 2: implementation
  // instructions must never survive into customer-facing output --
  // including on-image text fields, which get rendered as real pixels.
  const cases = [
    "Create for Instagram: bridal styling special",
    "Instagram post about our new menu",
    "Social media post celebrating our anniversary",
    "Social media graphic for the weekend sale",
    "AI generated image of a chef plating food",
    "Add text here about the offer",
    "Logo here",
    "CTA here: book now",
    "Insert website below",
    "Contact details available on request",
    "Your business name goes here",
  ];
  for (const text of cases) {
    assert.ok(findPlaceholderOrFiller(text), `expected instruction-leakage to be caught in: "${text}"`);
  }
  console.log("placeholder-detection.test.ts: AI-instruction/designer-instruction leakage rejected — PASS");
}

function run() {
  testCleanBusinessSpecificCaptionPasses();
  testBracketScaffoldingRejected();
  testTemplateTokensRejected();
  testBriefsNamedGenericPhrasesRejected();
  testCaseInsensitiveAndSubstringMatch();
  testReturnsTheOffendingSubstring();
  testAiInstructionLeakageRejected();
  console.log("placeholder-detection.test.ts: ALL PASS (Section 8 placeholder/template rejection)");
}

run();
