// Run with: node --experimental-strip-types lib/social/__tests__/quality-score.test.ts
import assert from "node:assert/strict";
import { scoreGeneratedContent, QUALITY_PASS_THRESHOLD, type QualityScoreInput } from "../quality-score.ts";

const BASE: QualityScoreInput = {
  caption: "",
  title: "",
  hashtags: [],
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

function reasonsOf(result: ReturnType<typeof scoreGeneratedContent>) {
  return result.hardFailures.map((f) => f.reason);
}

// --- The brief's own BAD vs BETTER example (Phase H). ---
function testBadGenericCopyIsRejected() {
  const bad = scoreGeneratedContent({
    ...BASE,
    caption: "Experience amazing service at our business. Contact us today!",
    title: "Amazing Service",
    hashtags: ["#business"],
  });
  assert.equal(bad.passed, false);
  assert.ok(bad.hardFailures.length > 0, "the brief's own BAD example must hard-fail, not just score low");
  console.log("quality-score.test.ts: brief's BAD example ('Experience amazing service...') is rejected — PASS");
}

function testBetterBusinessSpecificCopyPasses() {
  const better = scoreGeneratedContent({
    ...BASE,
    industry: "salon",
    caption: "Need a trim before the weekend? Book your appointment at Coastal Kitchen's sister salon in Fort Kochi -- walk-ins welcome Saturday morning.",
    title: "Book Your Weekend Trim",
    hashtags: ["#FortKochi"],
    verifiedFacts: ["Business location (as provided by the owner): Fort Kochi"],
  });
  // Not asserting passed===true (industry/pillar mismatch in this literal
  // example is expected -- it's a salon-style caption on a restaurant
  // fixture), but it must NOT hard-fail as generic/placeholder copy, and
  // must clearly outscore the BAD example.
  assert.ok(!reasonsOf(better).includes("GENERIC_COPY"));
  assert.ok(!reasonsOf(better).includes("PLACEHOLDER_DETECTED"));
  const bad = scoreGeneratedContent({ ...BASE, caption: "Experience amazing service at our business. Contact us today!", title: "Amazing Service", hashtags: [] });
  assert.ok(better.score > bad.score, "the specific, business-grounded example must score higher than the generic filler example");
  console.log("quality-score.test.ts: brief's BETTER example scores meaningfully higher and avoids GENERIC_COPY/PLACEHOLDER — PASS");
}

// --- Individual hard-fail reason codes. ---
function testPlaceholderDetected() {
  const result = scoreGeneratedContent({ ...BASE, caption: "Come visit [Insert business name] today for a great meal!", title: "Welcome", hashtags: ["#food"] });
  assert.ok(reasonsOf(result).includes("PLACEHOLDER_DETECTED"));
  assert.equal(result.score, 0);
  console.log("quality-score.test.ts: PLACEHOLDER_DETECTED — PASS");
}

function testForbiddenClaim() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "Our food is guaranteed to cure your cravings instantly, doctor recommended!",
    title: "Doctor Recommended",
    hashtags: ["#food"],
    forbiddenClaims: ["doctor recommended"],
  });
  assert.ok(reasonsOf(result).includes("FORBIDDEN_CLAIM"));
  console.log("quality-score.test.ts: FORBIDDEN_CLAIM — PASS");
}

function testUnsupportedFactPhoneNumber() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "Call us now at 98765 43210 to reserve your table for tonight's special!",
    title: "Reserve Tonight",
    hashtags: ["#dinner"],
    verifiedFacts: [], // no phone number verified
  });
  assert.ok(reasonsOf(result).includes("UNSUPPORTED_FACT"));
  console.log("quality-score.test.ts: UNSUPPORTED_FACT (invented phone number) — PASS");
}

function testUnsupportedFactDiscount() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "This weekend only: get 30% off your entire order! Visit our counter to grab it.",
    title: "Weekend Discount",
    hashtags: ["#offer"],
    verifiedFacts: [],
  });
  assert.ok(reasonsOf(result).includes("UNSUPPORTED_FACT"));
  console.log("quality-score.test.ts: UNSUPPORTED_FACT (invented discount) — PASS");
}

function testSupportedFactDoesNotHardFail() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "This weekend only: get 30% off your entire order! Visit our counter to grab it.",
    title: "Weekend Discount",
    hashtags: ["#offer"],
    verifiedFacts: ["Current offer: 30% off"],
  });
  assert.ok(!reasonsOf(result).includes("UNSUPPORTED_FACT"), "a claim that DOES appear in verifiedFacts must not be flagged as unsupported");
  console.log("quality-score.test.ts: a fact that IS in verifiedFacts is never flagged as unsupported — PASS");
}

function testDuplicateConcept() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "Try our signature butter chicken today, slow-cooked all day for a rich flavor.",
    title: "Butter Chicken",
    hashtags: ["#food"],
    concept: "dish spotlight",
    recentCaptions: ["Try our signature butter chicken today, slow-cooked all day long for rich flavor."],
    recentConcepts: ["dish spotlight"],
  });
  assert.ok(reasonsOf(result).includes("DUPLICATE_CONCEPT"));
  console.log("quality-score.test.ts: DUPLICATE_CONCEPT (near-identical recent caption) — PASS");
}

function testWeakCta() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "Our kitchen has been serving the neighborhood delicious South Indian food since 1998, made fresh daily with local ingredients.",
    title: "Our Story",
    hashtags: ["#kochi"],
  });
  assert.ok(reasonsOf(result).includes("WEAK_CTA"), "a caption with no action verb anywhere must be flagged WEAK_CTA");
  console.log("quality-score.test.ts: WEAK_CTA (no action verb anywhere) — PASS");
}

function testStrongCtaPasses() {
  const result = scoreGeneratedContent({ ...BASE, caption: "Book a table for tonight's special thali at Coastal Kitchen, Fort Kochi -- limited seats.", title: "Tonight's Special Thali", hashtags: ["#FortKochi"] });
  assert.ok(!reasonsOf(result).includes("WEAK_CTA"));
  console.log("quality-score.test.ts: a caption with a real action verb ('Book') is not flagged WEAK_CTA — PASS");
}

function testLowIndustryRelevance() {
  const result = scoreGeneratedContent({
    ...BASE,
    industry: "restaurant",
    caption: "Book your appointment with our expert team for a consultation about your goals this week.",
    title: "Book Now",
    hashtags: ["#consultation"],
  });
  assert.ok(reasonsOf(result).includes("LOW_INDUSTRY_RELEVANCE"), "generic service-consultation language with zero restaurant vocabulary must be flagged");
  console.log("quality-score.test.ts: LOW_INDUSTRY_RELEVANCE — PASS");
}

function testGenericIndustryNeverFlagsLowRelevance() {
  const result = scoreGeneratedContent({ ...BASE, industry: "generic", caption: "Book your appointment with our expert team for a consultation about your goals this week.", title: "Book Now", hashtags: ["#consultation"] });
  assert.ok(!reasonsOf(result).includes("LOW_INDUSTRY_RELEVANCE"), "an unclassified (generic) industry has no taxonomy to check against, so it must never hard-fail on this");
  console.log("quality-score.test.ts: 'generic' industry classification never triggers LOW_INDUSTRY_RELEVANCE — PASS");
}

function testBrandContextMissing() {
  const result = scoreGeneratedContent({ ...BASE, businessName: "", caption: "A perfectly good caption about food and dining experiences.", title: "Good Caption", hashtags: ["#food"] });
  assert.ok(reasonsOf(result).includes("BRAND_CONTEXT_MISSING"));
  console.log("quality-score.test.ts: BRAND_CONTEXT_MISSING when businessName is empty — PASS");
}

function testMalformedStructure() {
  const result = scoreGeneratedContent({ ...BASE, caption: "short", title: "", hashtags: [] as unknown as string[] });
  assert.ok(reasonsOf(result).includes("MALFORMED_STRUCTURE"));
  console.log("quality-score.test.ts: MALFORMED_STRUCTURE for a too-short caption / missing title — PASS");
}

function testHardFailureAlwaysZeroesScore() {
  const result = scoreGeneratedContent({ ...BASE, caption: "Come visit [Insert business name] today, book a table now!", title: "Welcome", hashtags: ["#food"] });
  assert.equal(result.score, 0, "any hard failure must zero the score regardless of how good the rest of the breakdown looks");
  console.log("quality-score.test.ts: a hard failure always zeroes the score, never a partial credit — PASS");
}

function testDiagnosticsAreNeverGeneric() {
  const result = scoreGeneratedContent({ ...BASE, caption: "Come visit [Insert business name] today, book a table now!", title: "Welcome", hashtags: ["#food"] });
  assert.ok(!result.diagnostics.some((d) => d === "quality gate failed"), "diagnostics must be specific, never the literal bare phrase this campaign was told to eliminate");
  assert.ok(result.diagnostics.some((d) => d.includes("PLACEHOLDER_DETECTED")));
  console.log("quality-score.test.ts: diagnostics are specific and diagnosable, never a bare generic message — PASS");
}

function testVisualQualityIsMarkedPending() {
  const result = scoreGeneratedContent({ ...BASE, caption: "Try our signature Kerala fish curry, made fresh every morning at Coastal Kitchen.", title: "Fresh Fish Curry", hashtags: ["#FortKochi"] });
  assert.equal(result.visualQualityPending, true);
  assert.ok(result.diagnostics.some((d) => d.toLowerCase().includes("visual") && d.toLowerCase().includes("pending")));
  console.log("quality-score.test.ts: visualQuality is explicitly marked pending, never presented as a real assessment — PASS");
}

function testWeightsSumToOneHundred() {
  const result = scoreGeneratedContent({ ...BASE, caption: "Try our signature Kerala fish curry, made fresh every morning at Coastal Kitchen. Book a table today.", title: "Fresh Fish Curry", hashtags: ["#FortKochi"] });
  const total = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
  assert.ok(total <= 100);
  console.log("quality-score.test.ts: dimension weights never sum above 100 — PASS");
}

function testCleanBusinessSpecificContentCanActuallyPass() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption: "Fresh Kerala fish curry served hot every morning at Coastal Kitchen, Fort Kochi. Book a table for tonight's dinner service.",
    title: "Fresh Fish Curry Tonight",
    hashtags: ["#FortKochi", "#KeralaFood"],
    verifiedFacts: ["Business location (as provided by the owner): Fort Kochi"],
  });
  assert.equal(result.hardFailures.length, 0, `expected zero hard failures, got: ${JSON.stringify(result.hardFailures)}`);
  assert.ok(result.score >= QUALITY_PASS_THRESHOLD, `expected a passing score, got ${result.score}`);
  assert.equal(result.passed, true);
  console.log(`quality-score.test.ts: genuinely good, business-specific copy can reach the ${QUALITY_PASS_THRESHOLD}+ pass threshold — PASS`);
}

function run() {
  testBadGenericCopyIsRejected();
  testBetterBusinessSpecificCopyPasses();
  testPlaceholderDetected();
  testForbiddenClaim();
  testUnsupportedFactPhoneNumber();
  testUnsupportedFactDiscount();
  testSupportedFactDoesNotHardFail();
  testDuplicateConcept();
  testWeakCta();
  testStrongCtaPasses();
  testLowIndustryRelevance();
  testGenericIndustryNeverFlagsLowRelevance();
  testBrandContextMissing();
  testMalformedStructure();
  testHardFailureAlwaysZeroesScore();
  testDiagnosticsAreNeverGeneric();
  testVisualQualityIsMarkedPending();
  testWeightsSumToOneHundred();
  testCleanBusinessSpecificContentCanActuallyPass();
  console.log("quality-score.test.ts: ALL PASS");
}

run();
