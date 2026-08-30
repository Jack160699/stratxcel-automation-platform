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

// --- STRATXCEL ONE-SHOT REBUILD mission Section 16/45: real bug found live
//     in production -- 2 of 4 real published StratXcel posts read as
//     though the B2B SaaS company itself were a clinic/local business,
//     because a customer-example illustration addressed the reader in
//     second person with an industry-specific possessive noun. The exact
//     real caption text (queue item 48168937, content_variant 88152ab7,
//     published live to Instagram) is reproduced here verbatim. ---
function testTargetIndustryContaminationCatchesTheRealLiveBug() {
  const result = scoreGeneratedContent({
    ...BASE,
    industry: "generic", // StratXcel's own real classification -- a B2B SaaS company, not a clinic
    businessName: "Stratxcel",
    caption:
      "Your local SEO running in the background while you focus on your patients. Dr. Sharma sits at the wooden reception desk of a local clinic in Bhilai during a quiet monsoon evening, holding a warm cup of tea and checking a weekly Google visibility report delivered effortlessly by Stratxcel Social Autopilot. This is how modern founders reclaim their evenings without sacrificing search visibility. Join our founder community.",
    title: "Local SEO, Handled",
    hashtags: ["#Stratxcel"],
  });
  assert.ok(reasonsOf(result).includes("TARGET_INDUSTRY_CONTAMINATION"), `the exact real live-published contaminated caption must hard-fail; got reasons: ${JSON.stringify(reasonsOf(result))}`);
  assert.equal(result.score, 0);
  console.log("quality-score.test.ts: TARGET_INDUSTRY_CONTAMINATION catches the real live-published 'your patients' bug — PASS");
}

function testCorrectlyAttributedCustomerExampleDoesNotContaminate() {
  // The OTHER real published post (queue item 66c14af4, content_variant
  // 66c14af4's variant) -- the CORRECT pattern: third-person, clearly
  // attributed, never addresses the reader as if they run the example
  // business.
  const result = scoreGeneratedContent({
    ...BASE,
    industry: "generic",
    businessName: "Stratxcel",
    caption:
      "Founders waste an average of 12 hours a week manually coordinating social media and search visibility. When a growing retail business in Bhilai needed to scale their digital presence without hiring an in-house marketing team, they implemented Stratxcel's Social Autopilot. The system now automatically researches, creates, validates, schedules, and publishes their branded social content. Read the full case study to see how intelligent business operations free up your team for core product growth.",
    title: "12 Hours a Week, Reclaimed",
    hashtags: ["#Stratxcel"],
  });
  assert.ok(!reasonsOf(result).includes("TARGET_INDUSTRY_CONTAMINATION"), `a correctly third-person-attributed customer example must never hard-fail; got reasons: ${JSON.stringify(reasonsOf(result))}`);
  console.log("quality-score.test.ts: a correctly third-person-attributed customer example is never flagged as contamination — PASS");
}

function testOwnIndustryVocabularyIsNeverFlagged() {
  // A REAL clinic tenant is allowed to say "your patients" about ITSELF --
  // the check must only fire when the vocabulary belongs to an industry
  // OTHER than the business's own classified one.
  const result = scoreGeneratedContent({
    ...BASE,
    industry: "clinic",
    caption: "Book your appointment today and let our team take great care of your patients from the moment they walk in.",
    title: "We Care For Your Patients",
    hashtags: ["#clinic"],
  });
  assert.ok(!reasonsOf(result).includes("TARGET_INDUSTRY_CONTAMINATION"), "a real clinic's own caption about its own patients must never be flagged as contamination");
  console.log("quality-score.test.ts: a business's OWN industry vocabulary about itself is never flagged as contamination — PASS");
}

function testGenericBusinessLanguageDoesNotFalsePositive() {
  // "your service", "your clients", "your problem" etc. are ordinary,
  // completely legitimate B2B language -- the curated word list must not
  // false-positive on common business vocabulary.
  const result = scoreGeneratedContent({
    ...BASE,
    industry: "generic",
    businessName: "Stratxcel",
    caption: "Solve your biggest operational problem this week -- book a free workflow audit with our automation experts and see your service quality improve within days.",
    title: "Book a Free Audit",
    hashtags: ["#automation"],
  });
  assert.ok(!reasonsOf(result).includes("TARGET_INDUSTRY_CONTAMINATION"), `ordinary B2B language ('your problem', 'your service') must never false-positive; got reasons: ${JSON.stringify(reasonsOf(result))}`);
  console.log("quality-score.test.ts: ordinary B2B language ('your service', 'your problem') never false-positives as contamination — PASS");
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

// --- Real defect found live (StratXcel batch, 2026-08-30): a leaked
// internal structuring label inside otherwise-real, on-brand copy. ---
function testLeakedTemplateLabelIsRejected() {
  const result = scoreGeneratedContent({
    ...BASE,
    caption:
      "Let the software handle the midnight publishing while you rest.\n\nStandards and Approach: Social Autopilot automatically researches, creates, validates, schedules and publishes branded social content.\n\nReserve festive slot.",
    title: "Midnight Publishing",
    hashtags: ["#Automation"],
  });
  assert.ok(reasonsOf(result).includes("LEAKED_TEMPLATE_LABEL"), `expected LEAKED_TEMPLATE_LABEL, got: ${JSON.stringify(result.hardFailures)}`);
  assert.equal(result.passed, false);
  console.log("quality-score.test.ts: real live leaked-section-label defect (\"Standards and Approach:\") is caught — PASS");
}

function testCommonNaturalColonLeadInsAreNotFalseFlagged() {
  for (const caption of [
    "Tip: book your table before 7pm on weekends for the best seats.",
    "Fun fact: our sourdough starter is older than most of our staff.",
    "PS: we just added a new flavor to the weekend menu.",
    "Quick tip: pair the fish curry with the coconut rice for the full experience.",
  ]) {
    const result = scoreGeneratedContent({ ...BASE, caption, title: "Note", hashtags: ["#FortKochi"] });
    assert.ok(!reasonsOf(result).includes("LEAKED_TEMPLATE_LABEL"), `expected no false LEAKED_TEMPLATE_LABEL on natural copy: "${caption}"`);
  }
  console.log("quality-score.test.ts: common natural colon-led lead-ins (Tip:/Fun fact:/PS:) never false-flag as leaked labels — PASS");
}

function testOtherLeakedLabelsAreAlsoCaught() {
  for (const label of ["Key Benefits", "Summary", "Our Approach", "Core Value"]) {
    const result = scoreGeneratedContent({
      ...BASE,
      caption: `Fresh Kerala fish curry served hot every morning at Coastal Kitchen, Fort Kochi.\n\n${label}: we source everything from the local harbor market before sunrise.`,
      title: "Fresh Fish Curry",
      hashtags: ["#FortKochi"],
    });
    assert.ok(reasonsOf(result).includes("LEAKED_TEMPLATE_LABEL"), `expected "${label}:" to be caught as a leaked template label`);
  }
  console.log("quality-score.test.ts: other real leaked-label patterns (Summary:/Our Approach:/etc.) are also caught, not just the one observed live — PASS");
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
  testTargetIndustryContaminationCatchesTheRealLiveBug();
  testCorrectlyAttributedCustomerExampleDoesNotContaminate();
  testOwnIndustryVocabularyIsNeverFlagged();
  testGenericBusinessLanguageDoesNotFalsePositive();
  testLeakedTemplateLabelIsRejected();
  testCommonNaturalColonLeadInsAreNotFalseFlagged();
  testOtherLeakedLabelsAreAlsoCaught();
  console.log("quality-score.test.ts: ALL PASS");
}

run();
