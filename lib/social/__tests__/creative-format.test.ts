import assert from "node:assert/strict";
import {
  CREATIVE_FORMATS,
  CREATIVE_FORMAT_REGISTRY,
  OBJECTIVE_TO_CREATIVE_FORMATS,
  OPPORTUNITY_TYPE_TO_CREATIVE_FORMATS,
  resolveCreativeFormat,
  buildCreativeFormatDirective,
  isValidCreativeFormat,
  type CreativeFormat,
} from "../creative-format.ts";
import { CONTENT_OBJECTIVE_VALUES } from "../content-options.ts";
import { CONTENT_OPPORTUNITY_DEFINITIONS, type ContentOpportunityType } from "../opportunity-map.ts";
import { buildCampaignStrategy } from "../campaign-strategy-planner.ts";
import { buildCreativeBrief } from "../creative-brief.ts";
import { buildCreativeTreatmentPrompt, validateCreativeTreatment, type CreativeTreatment } from "../creative-treatment.ts";
import { deriveBusinessContentIntelligence } from "../business-intelligence.ts";
import { deriveBrandVisualDNA } from "../brand-visual-dna.ts";
import { getIndustryVisualVocabulary } from "../industry-visual-vocabulary.ts";
import { RESTAURANT_FIXTURE } from "./fixtures/business-fixtures.ts";

const RESTAURANT_VERIFIED_FACTS = [
  `Business location (as provided by the owner): ${RESTAURANT_FIXTURE.brandBrain?.location}`,
  `Priority offering: ${RESTAURANT_FIXTURE.brandBrain?.priority_offering}`,
];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`creative-format.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`creative-format.test.ts: ${name} — FAIL`);
    throw err;
  }
}

test("every registered format has a definition with a real, non-empty directive", () => {
  for (const id of CREATIVE_FORMATS) {
    const def = CREATIVE_FORMAT_REGISTRY[id];
    assert.equal(def.id, id);
    assert.ok(def.directive.length > 30, `${id} directive is suspiciously short`);
    assert.ok(def.preferredBlocks.length > 0, `${id} has no preferred blocks`);
    assert.ok(def.textPolicy === "photo_led" || def.textPolicy === "structure_required");
  }
});

test("isValidCreativeFormat accepts every real id and rejects garbage", () => {
  for (const id of CREATIVE_FORMATS) assert.ok(isValidCreativeFormat(id));
  assert.equal(isValidCreativeFormat("NOT_A_FORMAT"), false);
  assert.equal(isValidCreativeFormat(null), false);
  assert.equal(isValidCreativeFormat(42), false);
});

test("every real ContentObjective has a real, non-empty format mapping", () => {
  for (const objective of CONTENT_OBJECTIVE_VALUES) {
    const candidates = OBJECTIVE_TO_CREATIVE_FORMATS[objective];
    assert.ok(candidates && candidates.length > 0, `objective ${objective} has no mapped formats`);
    for (const c of candidates) assert.ok(isValidCreativeFormat(c), `objective ${objective} maps to invalid format ${c}`);
  }
});

test("every real ContentOpportunityType has a real, non-empty format mapping", () => {
  for (const opp of Object.keys(CONTENT_OPPORTUNITY_DEFINITIONS) as ContentOpportunityType[]) {
    const candidates = OPPORTUNITY_TYPE_TO_CREATIVE_FORMATS[opp];
    assert.ok(candidates && candidates.length > 0, `opportunity ${opp} has no mapped formats`);
    for (const c of candidates) assert.ok(isValidCreativeFormat(c), `opportunity ${opp} maps to invalid format ${c}`);
  }
});

test("resolveCreativeFormat prefers the opportunity-type signal over the objective fallback", () => {
  // COMPARISON_GUIDE's real strategicObjective is AUTHORITY, whose own
  // objective-level candidates do NOT include COMPARISON -- proving the
  // opportunity-type mapping is genuinely consulted first, not just the
  // broader objective fallback silently winning every time.
  const chosen = resolveCreativeFormat({ opportunityType: "COMPARISON_GUIDE", objective: "AUTHORITY" });
  assert.ok(["COMPARISON", "PROBLEM_SOLUTION"].includes(chosen));
});

test("resolveCreativeFormat rotates away from a recently-used format instead of always returning the first candidate", () => {
  const first = resolveCreativeFormat({ opportunityType: "PRODUCT_SPOTLIGHT", objective: "SALES" });
  const second = resolveCreativeFormat({ opportunityType: "PRODUCT_SPOTLIGHT", objective: "SALES", recentFormats: [first] });
  assert.notEqual(second, first, "expected a genuinely different format once the first was marked as recently used");
});

test("buildCreativeFormatDirective names the format and reuses its registered directive verbatim", () => {
  const text = buildCreativeFormatDirective("OFFER_PROMOTION");
  assert.match(text, /OFFER_PROMOTION/);
  assert.ok(text.includes(CREATIVE_FORMAT_REGISTRY.OFFER_PROMOTION.directive));
});

test("28-day campaign plan: every day carries a valid creativeFormat, and the calendar shows real format variety (not one format repeated 28 times)", () => {
  const businessIntel = deriveBusinessContentIntelligence({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    descriptionText: RESTAURANT_FIXTURE.descriptionText ?? null,
    verifiedFacts: RESTAURANT_VERIFIED_FACTS,
    brandTone: RESTAURANT_FIXTURE.brandTone ?? [],
    brandColors: RESTAURANT_FIXTURE.brandColors ?? [],
  });
  const plan = buildCampaignStrategy({ businessIntel, availablePillars: ["Signature Quality", "Community Trust"], daysCount: 28 });
  assert.equal(plan.days.length, 28);
  const formatsUsed = new Set<CreativeFormat>();
  for (const day of plan.days) {
    assert.ok(isValidCreativeFormat(day.creativeFormat), `day ${day.dayNumber} has an invalid creativeFormat: ${day.creativeFormat}`);
    formatsUsed.add(day.creativeFormat);
  }
  assert.ok(formatsUsed.size >= 5, `expected real format variety across 28 days, only saw ${formatsUsed.size}: ${[...formatsUsed].join(", ")}`);
});

test("the SAME creative treatment prompt call actually changes its text/structure instruction depending on creativeFormat -- this is the real causal fix", () => {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    descriptionText: RESTAURANT_FIXTURE.descriptionText ?? null,
    platform: "instagram",
    mediaType: "image",
    availablePillars: ["Signature Quality"],
    objective: "SALES",
    verifiedFacts: RESTAURANT_VERIFIED_FACTS,
  });
  const brandDNA = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors ?? [], brandTone: RESTAURANT_FIXTURE.brandTone ?? [], industryCategory: brief.industry });
  const visualVocab = getIndustryVisualVocabulary(brief.industry);
  const commonArgs = {
    brief,
    businessName: RESTAURANT_FIXTURE.businessName,
    industry: brief.industry,
    brandDNA,
    visualVocab,
    mediaType: "image" as const,
  };
  const photoLed = buildCreativeTreatmentPrompt({ ...commonArgs, creativeFormat: "PHOTOGRAPHIC_AD" });
  const structured = buildCreativeTreatmentPrompt({ ...commonArgs, creativeFormat: "OFFER_PROMOTION" });
  const noFormat = buildCreativeTreatmentPrompt({ ...commonArgs });

  const photoLedText = photoLed.map((m) => m.content).join("\n");
  const structuredText = structured.map((m) => m.content).join("\n");
  const noFormatText = noFormat.map((m) => m.content).join("\n");

  assert.match(photoLedText, /PHOTOGRAPHIC_AD/);
  assert.match(structuredText, /OFFER_PROMOTION/);
  assert.notEqual(photoLedText, structuredText, "two different creative formats must produce two different prompts");
  // Backward compatibility: a caller that supplies no creativeFormat at all
  // gets the ORIGINAL unconditional sentence, unchanged.
  assert.match(noFormatText, /A creative with no on-image text at all is a valid, often stronger, choice/);
  assert.doesNotMatch(noFormatText, /CREATIVE FORMAT FOR THIS POST/);
});

test("validateCreativeTreatment flags a structure-required format that came back as a plain headline+supportingLine+cta with no real adComposition (the exact real failure found live against a real Gemini call)", () => {
  const plainTextHierarchyTreatment: CreativeTreatment = {
    concept: "A specific, real creative idea about the weekend brunch offer",
    hook: "Real hook",
    audienceTension: "Real tension",
    story: "Real story",
    visualIdea: "Real visual idea",
    subject: "Real subject",
    composition: "Real composition",
    camera: "Real camera",
    lighting: "Real lighting",
    environment: "Real environment",
    colorDirection: "Real color direction",
    typographyDirection: "Real typography direction",
    brandApplication: "Real brand application",
    textHierarchy: [
      { role: "headline", text: "20% Off Kerala Seafood Thali" },
      { role: "supportingLine", text: "Available Saturday & Sunday only." },
      { role: "cta", text: "Reserve Your Table" },
    ],
    cta: { needed: true, text: "Reserve Your Table", rationale: "Sales objective" },
    format: "single image post",
    whyStopScroll: "Real reason this stops the scroll",
    whyThisBusiness: "Real reason this is specific to this business",
    negativeConstraints: ["no fabricated claims"],
    intentionallyTextLed: false,
    layoutArchetype: "SPLIT_BANNER",
    // No adComposition -- this is the REAL shape a live Gemini call
    // returned for OFFER_PROMOTION before this check was tightened.
  };
  const issues = validateCreativeTreatment(plainTextHierarchyTreatment, { concept: "offer", creativeFormat: "OFFER_PROMOTION" });
  assert.ok(issues.some((i) => i.field === "adComposition"), `expected a real headline+supportingLine+cta shape (no adComposition) to be rejected for a structure-required format, got: ${JSON.stringify(issues)}`);

  // The SAME plain shape is fine for a photo-led format.
  const photoLedIssues = validateCreativeTreatment(plainTextHierarchyTreatment, { concept: "offer", creativeFormat: "PHOTOGRAPHIC_AD" });
  assert.ok(!photoLedIssues.some((i) => i.field === "adComposition"));

  // FEATURE_POSTER's own extended textHierarchy vocabulary is a real
  // structural alternative -- it must NOT be rejected just for lacking
  // adComposition when the server genuinely forced FEATURE_POSTER.
  const featurePosterTreatment: CreativeTreatment = {
    ...plainTextHierarchyTreatment,
    layoutArchetype: "FEATURE_POSTER",
    textHierarchy: [
      { role: "painPoint", text: "Weekend seafood cravings with nowhere reliable to go" },
      { role: "solution", text: "Coastal Kitchen's seafood thali, fresh off the Fort Kochi jetty" },
      { role: "offer", text: "20% off, Saturday-Sunday only" },
      { role: "cta", text: "Reserve Your Table" },
    ],
  };
  const featurePosterIssues = validateCreativeTreatment(featurePosterTreatment, {
    concept: "offer",
    creativeFormat: "OFFER_PROMOTION",
    routingContext: { forcedArchetype: "FEATURE_POSTER", allowedArchetypes: [], reason: "test" },
  });
  assert.ok(!featurePosterIssues.some((i) => i.field === "adComposition"), `FEATURE_POSTER's own extended role vocabulary must count as real structure, got: ${JSON.stringify(featurePosterIssues)}`);
});

test("validateCreativeTreatment flags a structure-required format that came back as a bare photo with no real on-image content", () => {
  const bareTreatment: CreativeTreatment = {
    concept: "A specific, real creative idea about the weekend brunch offer",
    hook: "Real hook",
    audienceTension: "Real tension",
    story: "Real story",
    visualIdea: "Real visual idea",
    subject: "Real subject",
    composition: "Real composition",
    camera: "Real camera",
    lighting: "Real lighting",
    environment: "Real environment",
    colorDirection: "Real color direction",
    typographyDirection: "Real typography direction",
    brandApplication: "Real brand application",
    textHierarchy: [],
    cta: { needed: false, text: null, rationale: "The photo alone carries it" },
    format: "single image post",
    whyStopScroll: "Real reason this stops the scroll",
    whyThisBusiness: "Real reason this is specific to this business",
    negativeConstraints: ["no fabricated claims"],
    intentionallyTextLed: false,
    layoutArchetype: "BASIC_ESSENTIAL",
    // No adComposition at all -- this is the exact "defaulted to a bare
    // photo" failure mode for a format that requires real structure.
  };
  const issues = validateCreativeTreatment(bareTreatment, { concept: "offer", creativeFormat: "OFFER_PROMOTION" });
  assert.ok(issues.some((i) => i.field === "adComposition"), `expected an adComposition issue for a structure-required format with no structure, got: ${JSON.stringify(issues)}`);

  // The SAME bare treatment is perfectly fine for a photo-led format.
  const okIssues = validateCreativeTreatment(bareTreatment, { concept: "offer", creativeFormat: "PHOTOGRAPHIC_AD" });
  assert.ok(!okIssues.some((i) => i.field === "adComposition"), `a photo-led format must not require adComposition, got: ${JSON.stringify(okIssues)}`);

  // A rich adComposition satisfies the requirement even with empty textHierarchy.
  const withComposition: CreativeTreatment = {
    ...bareTreatment,
    adComposition: { canvas: "photo_full", panel: "bottom", blocks: [{ kind: "offer", value: "20% off", detail: "This weekend only" }, { kind: "cta", text: "Book now" }] },
  };
  const composedIssues = validateCreativeTreatment(withComposition, { concept: "offer", creativeFormat: "OFFER_PROMOTION" });
  assert.ok(!composedIssues.some((i) => i.field === "adComposition"), `a real adComposition must satisfy the structure requirement, got: ${JSON.stringify(composedIssues)}`);
});

test("validateCreativeTreatment rejects an on-image price/discount claim not present in verified facts, but accepts the same claim when it genuinely is verified", () => {
  const base: CreativeTreatment = {
    concept: "A specific, real creative idea about the weekend brunch offer",
    hook: "Real hook", audienceTension: "Real tension", story: "Real story", visualIdea: "Real visual idea",
    subject: "Real subject", composition: "Real composition", camera: "Real camera", lighting: "Real lighting",
    environment: "Real environment", colorDirection: "Real color direction", typographyDirection: "Real typography direction",
    brandApplication: "Real brand application",
    textHierarchy: [{ role: "headline", text: "20% Off This Weekend" }],
    cta: { needed: true, text: "Book Now", rationale: "Sales objective" },
    format: "single image post", whyStopScroll: "Real reason", whyThisBusiness: "Real reason",
    negativeConstraints: ["no fabricated claims"], intentionallyTextLed: false, layoutArchetype: "SPLIT_BANNER",
  };
  const unsupported = validateCreativeTreatment(base, { concept: "offer", creativeFormat: "PHOTOGRAPHIC_AD", verifiedFacts: ["Business location: Fort Kochi"] });
  assert.ok(unsupported.some((i) => i.field === "textHierarchy" && i.issue.toLowerCase().includes("20% off")), `expected an unverified "20% off" headline claim to be rejected, got: ${JSON.stringify(unsupported)}`);

  const supported = validateCreativeTreatment(base, { concept: "offer", creativeFormat: "PHOTOGRAPHIC_AD", verifiedFacts: ["Weekend offer (as provided by the owner): 20% off the seafood thali"] });
  assert.ok(!supported.some((i) => i.field === "textHierarchy" && i.issue.includes("claim not present")), `a genuinely verified claim must not be rejected, got: ${JSON.stringify(supported)}`);

  // Omitting verifiedFacts entirely preserves the exact prior behavior --
  // never a false positive for a caller/fixture not yet updated.
  const omitted = validateCreativeTreatment(base, { concept: "offer", creativeFormat: "PHOTOGRAPHIC_AD" });
  assert.ok(!omitted.some((i) => i.issue.includes("claim not present")), `omitting verifiedFacts must not activate the check, got: ${JSON.stringify(omitted)}`);
});

console.log("creative-format.test.ts: ALL PASS");
