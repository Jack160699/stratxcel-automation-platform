import assert from "node:assert/strict";
import { validateCreativeTreatment, buildCreativeTreatmentPrompt, resolveOverlayElements, extractVerifiedContactInfo, forceArchetypeOntoTreatment, describeTextStructureShape, describeCompositionShape, LAYOUT_ARCHETYPE_IDS, type CreativeTreatment } from "../creative-treatment.ts";
import { RESTAURANT_FIXTURE } from "./fixtures/business-fixtures.ts";
import { buildCreativeBrief } from "../creative-brief.ts";
import { deriveBrandVisualDNA } from "../brand-visual-dna.ts";
import { getIndustryVisualVocabulary } from "../industry-visual-vocabulary.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`creative-treatment.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`creative-treatment.test.ts: ${name} — FAIL`);
    throw err;
  }
}

const GOOD_TREATMENT: CreativeTreatment = {
  concept: "Turn the after-work energy crash into a recognizable 20-minute mobility ritual",
  hook: "Sitting all day is quietly wrecking your squat.",
  audienceTension: "Desk workers know they should move more but feel too depleted after work to start a real session",
  story: "A short, structured mobility ritual bridges the gap between a desk day and real training",
  visualIdea: "Coach guiding a client through a targeted hip-opener stretch mid-session",
  subject: "Coach and client mid mobility stretch, hands guiding form",
  composition: "Subject-centered, low negative space upper-left for headline",
  camera: "35mm documentary feel, slightly low angle",
  lighting: "Hard gym overheads with a warm rim light",
  environment: "Dark industrial gym floor, exposed equipment in soft focus background",
  colorDirection: "High-contrast red/black brand accents against a mostly dark frame",
  typographyDirection: "Bold condensed display for the headline, tight tracking",
  brandApplication: "IronCore Fitness wordmark small, bottom-right, red on black",
  textHierarchy: [{ role: "headline", text: "The 20-Minute Desk Reset" }],
  cta: { needed: true, text: "Drop a comment: what's your tightest spot?", rationale: "Engagement objective -- invites a reply, not a hard sell" },
  format: "single image post",
  whyStopScroll: "Mid-motion coaching moment with real tension in the frame, not a posed portrait",
  whyThisBusiness: "Depicts IronCore's actual coached-session format, not generic gym stock imagery",
  negativeConstraints: ["no unrelated stock gym imagery", "no fabricated results or stats"],
  intentionallyTextLed: false,
  layoutArchetype: "FLOATING_CARD",
};

test("a well-formed, specific treatment has zero validation issues", () => {
  const issues = validateCreativeTreatment(GOOD_TREATMENT, { concept: "training tip" });
  assert.deepEqual(issues, []);
});

// Real defect found live on StratXcel's own PUBLISHED output: an on-image
// headline read "Local SEO that runs while you run your clinic." --
// checkTargetIndustryContamination already guarded the caption text
// (commit 3780ef2) but textHierarchy/cta.text is a separate generation
// path rendered as literal pixels on the final creative, and was never
// checked at all.
test("on-image textHierarchy text addressing the reader as a different industry ('your clinic') is rejected when the real industry is known", () => {
  const contaminated: CreativeTreatment = { ...GOOD_TREATMENT, textHierarchy: [{ role: "headline", text: "Local SEO that runs while you run your clinic." }] };
  const issues = validateCreativeTreatment(contaminated, { concept: "training tip", industry: "generic" });
  assert.ok(issues.some((i) => i.field === "textHierarchy" && i.issue.includes("clinic")), `expected the real live-observed 'your clinic' headline to be rejected, got: ${JSON.stringify(issues)}`);
});

test("cta.text addressing the reader as a different industry is rejected when the real industry is known", () => {
  const contaminated: CreativeTreatment = { ...GOOD_TREATMENT, cta: { needed: true, text: "Book your patients' next visit today", rationale: "test" } };
  const issues = validateCreativeTreatment(contaminated, { concept: "training tip", industry: "generic" });
  assert.ok(issues.some((i) => i.field === "cta"), `expected a contaminated cta.text to be rejected, got: ${JSON.stringify(issues)}`);
});

test("on-image text is never flagged when no industry is supplied (backward compatible with call sites that don't have it in scope, e.g. validateTreatmentForJob)", () => {
  const contaminated: CreativeTreatment = { ...GOOD_TREATMENT, textHierarchy: [{ role: "headline", text: "Local SEO that runs while you run your clinic." }] };
  const issues = validateCreativeTreatment(contaminated, { concept: "training tip" });
  assert.ok(!issues.some((i) => i.field === "textHierarchy" && i.issue.includes("clinic")), "must not attempt the check at all when industry is unknown, rather than false-flagging or crashing");
});

test("on-image text about the business's OWN industry is never flagged as contamination", () => {
  const ownIndustry: CreativeTreatment = { ...GOOD_TREATMENT, textHierarchy: [{ role: "headline", text: "Built for your gym floor." }] };
  const issues = validateCreativeTreatment(ownIndustry, { concept: "training tip", industry: "gym" });
  assert.deepEqual(issues, []);
});

test("a treatment whose concept is just the category label restated is rejected", () => {
  const bad = { ...GOOD_TREATMENT, concept: "training tip" };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "concept" && i.issue.includes("category label restated")));
});

test("malformed/non-object structured output is rejected with a root issue", () => {
  const issues = validateCreativeTreatment(undefined, { concept: "training tip" });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.field, "root");
});

test("missing required fields are each flagged individually", () => {
  const bad = { ...GOOD_TREATMENT, subject: "", camera: "  " };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "subject"));
  assert.ok(issues.some((i) => i.field === "camera"));
});

test("too many on-image text elements is flagged", () => {
  // Cap raised from 4 to 6 (FINAL HERMES MISSION, 2026-09-06) to allow a
  // real content-strategy-driven structure (brandLabel + a display line +
  // two supporting/proof-style blocks + cta), so this needs 7 elements to
  // still exceed it, not 5.
  const bad = {
    ...GOOD_TREATMENT,
    textHierarchy: [
      { role: "headline", text: "a" },
      { role: "supportingLine", text: "b" },
      { role: "cta", text: "c" },
      { role: "brandLabel", text: "d" },
      { role: "other", text: "e" },
      { role: "insight", text: "f" },
      { role: "proof", text: "g" },
    ],
  };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "textHierarchy"));
});

test("cta.needed=true with empty cta.text is flagged", () => {
  const bad = { ...GOOD_TREATMENT, cta: { needed: true, text: "", rationale: "x" } };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "cta"));
});

test("a treatment that legitimately has no CTA (cta.needed=false) is not penalized", () => {
  const ok = { ...GOOD_TREATMENT, cta: { needed: false, text: null, rationale: "The photograph alone carries the idea -- forcing a CTA would dilute it" } };
  const issues = validateCreativeTreatment(ok, { concept: "training tip" });
  assert.deepEqual(issues, []);
});

test("buildCreativeTreatmentPrompt grounds the prompt in real verified facts and forbids fabrication", () => {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    descriptionText: RESTAURANT_FIXTURE.descriptionText,
    platform: "instagram",
    mediaType: "image",
    availablePillars: RESTAURANT_FIXTURE.contentPillars,
    objective: "AUTHORITY",
    verifiedFacts: ["Verified business address: 14 Princess Street, Fort Kochi"],
    brandTone: RESTAURANT_FIXTURE.brandTone,
    brandColors: RESTAURANT_FIXTURE.brandColors,
    audience: RESTAURANT_FIXTURE.audience,
  });
  const dna = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors, brandTone: RESTAURANT_FIXTURE.brandTone, industryCategory: "restaurant" });
  const vocab = getIndustryVisualVocabulary("restaurant");
  const messages = buildCreativeTreatmentPrompt({
    brief, businessName: RESTAURANT_FIXTURE.businessName, industry: "restaurant", brandDNA: dna, visualVocab: vocab, mediaType: "image",
  });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(combined.includes("14 Princess Street"));
  assert.ok(combined.toLowerCase().includes("never invent a business fact"));
  assert.ok(combined.includes("JSON"));
});

// FINAL HERMES ROOT-CAUSE + STRATEGY RESTORATION mission (2026-09-06): real
// bug found live -- buildCreativeBrief already computes a real 28-Day
// Campaign Strategy Planner blueprint (plannedStrategy: opportunityType,
// uniqueAngle, customerProblem, audienceIntent, researchInsight) and a real
// Customer Psychology profile (buildCustomerPsychologyProfile, the tenant's
// own audience pain-point data) for every automated post, but
// buildCreativeTreatmentPrompt only ever read 5 shallow fields off the
// brief (objective/audience/contentPillar/concept/cta) -- the richer
// strategic reasoning was computed, attached to the brief, and then simply
// never read by the ONE function that actually decides the on-image
// message. This is the regression test for that fix: both signals must
// reach the real prompt text verbatim, not just exist on the brief object.
test("buildCreativeTreatmentPrompt surfaces the real 28-Day Campaign Strategy Planner blueprint and Customer Psychology profile, not just the shallow concept/audience/objective fields", () => {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    descriptionText: RESTAURANT_FIXTURE.descriptionText,
    platform: "instagram",
    mediaType: "image",
    availablePillars: RESTAURANT_FIXTURE.contentPillars,
    objective: "AUTHORITY",
    verifiedFacts: [],
    brandTone: RESTAURANT_FIXTURE.brandTone,
    brandColors: RESTAURANT_FIXTURE.brandColors,
    audience: RESTAURANT_FIXTURE.audience,
    plannedStrategy: {
      dayNumber: 3,
      objective: "AUTHORITY",
      opportunityType: "CUSTOMER_PAIN_POINT",
      audienceIntent: "Looking for immediate relief and confidence in quality",
      customerProblem: "Fear of an inconsistent seafood catch ruining a special weekend booking",
      contentPillar: RESTAURANT_FIXTURE.contentPillars[0]!,
      topic: "Overcoming Inconsistent Weekend Seafood Availability",
      uniqueAngle: "Why our direct-from-the-jetty sourcing removes the weekend seafood gamble entirely",
      format: "single_image",
      hookStrategy: "open with the specific problem this business solves for the reader",
      ctaStrategy: "an invitation to learn more or read further, establishing expertise",
      creativeConcept: "Customer Pain Point: Overcoming Inconsistent Weekend Seafood Availability — Why our direct-from-the-jetty sourcing removes the weekend seafood gamble entirely",
      visualCategory: "close_up_detail",
      researchInsight: "Research shows customers experience severe hesitation around unreliable weekend seafood quality. Addressing it directly builds immediate rapport.",
    },
    customerPsychology: [
      { audienceLabel: "Weekend Diners", painPoints: ["worried the catch won't be fresh", "afraid of overpaying for a mediocre meal"], description: null },
    ],
  });
  const dna = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors, brandTone: RESTAURANT_FIXTURE.brandTone, industryCategory: "restaurant" });
  const vocab = getIndustryVisualVocabulary("restaurant");
  const messages = buildCreativeTreatmentPrompt({
    brief, businessName: RESTAURANT_FIXTURE.businessName, industry: "restaurant", brandDNA: dna, visualVocab: vocab, mediaType: "image",
  });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(combined.includes("direct-from-the-jetty sourcing removes the weekend seafood gamble"), "the planner's own uniqueAngle -- the actual WHY behind the angle -- must reach the prompt verbatim");
  assert.ok(combined.includes("Fear of an inconsistent seafood catch ruining a special weekend booking"), "the planner's specific customerProblem must reach the prompt");
  assert.ok(combined.includes("Research shows customers experience severe hesitation"), "the planner's own researchInsight must reach the prompt, not just the generic industry research library");
  assert.ok(combined.includes("worried the catch won't be fresh") && combined.includes("afraid of overpaying for a mediocre meal"), "the real customer-psychology pain points must reach the prompt verbatim");
  assert.ok(combined.includes("Weekend Diners"), "the psychology profile's real audience label must reach the prompt");
});

test("buildCreativeTreatmentPrompt degrades gracefully with no plannedStrategy or customerPsychology -- no fabricated placeholder text", () => {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    descriptionText: RESTAURANT_FIXTURE.descriptionText,
    platform: "instagram",
    mediaType: "image",
    availablePillars: RESTAURANT_FIXTURE.contentPillars,
    objective: "AUTHORITY",
    verifiedFacts: [],
    brandTone: RESTAURANT_FIXTURE.brandTone,
    brandColors: RESTAURANT_FIXTURE.brandColors,
    audience: RESTAURANT_FIXTURE.audience,
  });
  const dna = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors, brandTone: RESTAURANT_FIXTURE.brandTone, industryCategory: "restaurant" });
  const vocab = getIndustryVisualVocabulary("restaurant");
  const messages = buildCreativeTreatmentPrompt({
    brief, businessName: RESTAURANT_FIXTURE.businessName, industry: "restaurant", brandDNA: dna, visualVocab: vocab, mediaType: "image",
  });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(!combined.includes("Content opportunity type"), "must not fabricate a planner section when no real plannedStrategy exists");
  assert.ok(!combined.includes("REAL CUSTOMER PSYCHOLOGY"), "must not fabricate a psychology section when no real customerPsychology exists");
  // The always-present brief fields (computed for every brief regardless of
  // plannedStrategy) must still reach the prompt.
  assert.ok(combined.includes("Hook direction:"));
  assert.ok(combined.includes("Headline direction:"));
});

test("STRATXCEL ONE-SHOT REBUILD Section 2/16/45: a 'generic'-industry business gets an explicit identity-clarity instruction against depicting a customer's industry as its own", () => {
  // Real bug found live in production: a real published creative for a
  // 'generic'-classified B2B SaaS business (StratXcel itself) depicted a
  // medical clinic reception desk (stethoscope, anatomy poster) as if it
  // were the business's own premises, and the caption said "while you
  // focus on your patients". "(generic)" alone told the model nothing
  // about what the business actually looks like.
  const brief = buildCreativeBrief({
    businessName: "Stratxcel",
    industryText: "AI Automation, Digital Transformation & Business Technology",
    descriptionText: "Stratxcel is a technology and digital solutions company focused on AI automation, websites, and business systems for businesses.",
    platform: "instagram",
    mediaType: "image",
    availablePillars: ["AI Automation in Real Business"],
    objective: "AUTHORITY",
    verifiedFacts: [],
  });
  const dna = deriveBrandVisualDNA({ brandColors: [], brandTone: [], industryCategory: "generic" });
  const vocab = getIndustryVisualVocabulary("generic");
  const messages = buildCreativeTreatmentPrompt({ brief, businessName: "Stratxcel", industry: "generic", brandDNA: dna, visualVocab: vocab, mediaType: "image" });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(combined.includes("IDENTITY CLARITY"), "a 'generic' business must get an explicit identity-clarity instruction");
  assert.ok(combined.includes("NOT a local storefront business"));
  assert.ok(/clinic|salon|restaurant/i.test(combined), "must explicitly name at least one wrong-industry example to guard against");

  // A business already classified into a real vertical has no such
  // ambiguity (it already knows what it is) -- must not get the line.
  const restaurantMessages = buildRestaurantPromptMessages();
  const restaurantCombined = restaurantMessages.map((m) => m.content).join("\n");
  assert.ok(!restaurantCombined.includes("IDENTITY CLARITY"), "a business already classified into a real vertical must not get the generic-only identity-clarity line");
});

test("a treatment whose textHierarchy contains AI-instruction leakage is rejected (Finished Premium Marketing Creative brief Section 2/21)", () => {
  const bad = { ...GOOD_TREATMENT, textHierarchy: [{ role: "headline", text: "Add text here" }] };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "textHierarchy" && i.issue.includes("Add text here")));
});

test("a treatment whose CTA text contains AI-instruction leakage is rejected", () => {
  const bad = { ...GOOD_TREATMENT, cta: { needed: true, text: "CTA here", rationale: "x" } };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "cta" && i.issue.includes("CTA here")));
});

test("a treatment whose concept field itself leaks instruction language is rejected", () => {
  const bad = { ...GOOD_TREATMENT, concept: "Create for Instagram: a gym promo post" };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "concept" && i.issue.includes("leakage")));
});

test("a treatment missing layoutArchetype is rejected", () => {
  const bad = { ...GOOD_TREATMENT, layoutArchetype: undefined };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "layoutArchetype"));
});

test("a treatment with an invalid layoutArchetype value is rejected", () => {
  const bad = { ...GOOD_TREATMENT, layoutArchetype: "FULL_BLEED_TEXT" };
  const issues = validateCreativeTreatment(bad, { concept: "training tip" });
  assert.ok(issues.some((i) => i.field === "layoutArchetype"));
});

test("each of the 13 registered layout archetypes is accepted", () => {
  for (const archetype of LAYOUT_ARCHETYPE_IDS) {
    const good = { ...GOOD_TREATMENT, layoutArchetype: archetype };
    const issues = validateCreativeTreatment(good, { concept: "training tip" });
    assert.deepEqual(issues, [], `expected ${archetype} to be a valid archetype`);
  }
  // Image Quality + Marketing Creative Certification mission (2026-09-06):
  // FEATURE_POSTER is the 13th (archetype-registry.ts) -- this count is a
  // deliberate tripwire so a future 14th archetype gets the same "did you
  // remember to update this test" nudge this one just got.
  assert.equal(LAYOUT_ARCHETYPE_IDS.length, 13, "registry must expose exactly 13 archetypes");
});

function buildRestaurantPromptMessages(
  routingContext?: Parameters<typeof buildCreativeTreatmentPrompt>[0]["routingContext"],
  recentTextStructures?: string[],
  recentCompositions?: string[],
) {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName, industryText: RESTAURANT_FIXTURE.industryText, descriptionText: RESTAURANT_FIXTURE.descriptionText,
    platform: "instagram", mediaType: "image", availablePillars: RESTAURANT_FIXTURE.contentPillars, objective: "AUTHORITY",
    verifiedFacts: [], brandTone: RESTAURANT_FIXTURE.brandTone, brandColors: RESTAURANT_FIXTURE.brandColors, audience: RESTAURANT_FIXTURE.audience,
  });
  const dna = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors, brandTone: RESTAURANT_FIXTURE.brandTone, industryCategory: "restaurant" });
  const vocab = getIndustryVisualVocabulary("restaurant");
  return buildCreativeTreatmentPrompt({ brief, businessName: RESTAURANT_FIXTURE.businessName, industry: "restaurant", brandDNA: dna, visualVocab: vocab, mediaType: "image", routingContext, recentTextStructures, recentCompositions });
}

test("the ad-composition brief makes the OBJECTIVE decide the design, and names headline+body+cta as the weak default rather than the starting point", () => {
  const combined = buildRestaurantPromptMessages().map((m) => m.content).join("\n");
  // The real failure: "service/trust" and "savings/benefit/offer" for the
  // same business both came back as photo_full:headline+body+cta.
  assert.ok(/OBJECTIVE AND CONCEPT ANGLE ABOVE DECIDE THIS DESIGN/.test(combined), "the objective must be stated as the thing that decides the design");
  assert.ok(/WEAKEST ANSWER/.test(combined), "the default shape must be explicitly called out as the weak choice");
  for (const kind of ["stat", "offer", "badges", "benefits", "steps", "comparison", "quote"]) {
    assert.ok(combined.includes(`"kind": "${kind}"`), `the advertising vocabulary must offer the ${kind} block`);
  }
  assert.ok(/never invent a statistic, price, discount, award or testimonial/.test(combined), "fabrication must be forbidden at the point the number-led blocks are offered");
});

test("recent ad designs for the same tenant are surfaced with an explicit instruction to produce a different one", () => {
  const withHistory = buildRestaurantPromptMessages(undefined, undefined, ["photo_full:headline+body+cta", "photo_full:eyebrow+headline+body+cta"]).map((m) => m.content).join("\n");
  assert.ok(withHistory.includes("photo_full:headline+body+cta"), "the real prior design must be quoted back verbatim");
  assert.ok(/genuinely different design/.test(withHistory), "must ask for a different design, not merely different words");

  const noHistory = buildRestaurantPromptMessages().map((m) => m.content).join("\n");
  assert.ok(!/already used these exact designs/.test(noHistory), "no fabricated history when the tenant genuinely has none");
});

test("describeCompositionShape fingerprints canvas + block sequence, and refuses anything that isn't a real composition", () => {
  assert.equal(
    describeCompositionShape({ canvas: "photo_side", blocks: [{ kind: "headline", text: "x" }, { kind: "steps", items: ["a", "b"] }, { kind: "cta", text: "go" }] }),
    "photo_side:headline+steps+cta",
  );
  // Two ads that differ only in wording share a fingerprint -- that is the
  // repetition this signal exists to catch.
  assert.equal(
    describeCompositionShape({ canvas: "photo_full", blocks: [{ kind: "headline", text: "A" }, { kind: "cta", text: "B" }] }),
    describeCompositionShape({ canvas: "photo_full", blocks: [{ kind: "headline", text: "totally different words" }, { kind: "cta", text: "also different" }] }),
  );
  // Real gap found live: these two rendered as visually the same ad but
  // fingerprinted differently, so the anti-repetition check passed.
  assert.equal(
    describeCompositionShape({ canvas: "photo_full", blocks: [{ kind: "headline" }, { kind: "subhead" }, { kind: "cta" }] }),
    describeCompositionShape({ canvas: "photo_full", blocks: [{ kind: "eyebrow" }, { kind: "headline" }, { kind: "body" }, { kind: "cta" }] }),
    "subhead/body are the same tier of running copy and an eyebrow does not change the design -- these must collide",
  );
  assert.notEqual(
    describeCompositionShape({ canvas: "photo_full", blocks: [{ kind: "headline" }, { kind: "body" }, { kind: "cta" }] }),
    describeCompositionShape({ canvas: "photo_full", blocks: [{ kind: "headline" }, { kind: "steps", items: ["a", "b"] }, { kind: "cta" }] }),
    "a steps ad and a body-copy ad are genuinely different designs and must not collide",
  );
  assert.equal(describeCompositionShape(null), null);
  assert.equal(describeCompositionShape({ canvas: "photo_full" }), null, "no blocks is not a design");
  assert.equal(describeCompositionShape({ blocks: [{ kind: "headline" }] }), null, "no canvas is not a design");
});

test("buildCreativeTreatmentPrompt explains all 13 layout archetypes and requires a deliberate choice when unrestricted", () => {
  const messages = buildRestaurantPromptMessages();
  const combined = messages.map((m) => m.content).join("\n");
  for (const archetype of LAYOUT_ARCHETYPE_IDS) {
    assert.ok(combined.includes(archetype), `expected the prompt to explain ${archetype}`);
  }
  assert.ok(combined.toLowerCase().includes("layoutarchetype"));
});

test("routingContext.forcedArchetype: prompt tells the AI the decision is already made and JSON shape only allows that one value", () => {
  const messages = buildRestaurantPromptMessages({ forcedArchetype: "BASIC_ESSENTIAL", allowedArchetypes: [], reason: "Starter automated path" });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(/ALREADY DECIDED/.test(combined));
  assert.ok(combined.includes("BASIC_ESSENTIAL"));
  assert.ok(combined.includes(`"layoutArchetype": "BASIC_ESSENTIAL"`), "JSON shape block must only offer the forced value");
  assert.ok(!combined.includes("SPLIT_BANNER"), "must not describe other archetypes as options when one is forced");
});

test("routingContext.allowedArchetypes (no forced value): prompt restricts the AI to only that preference set", () => {
  const messages = buildRestaurantPromptMessages({ forcedArchetype: null, allowedArchetypes: ["SPLIT_BANNER", "POLAROID_LIFESTYLE", "CLINICAL_TRUST"], reason: "Growth tenant's saved preferences" });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(combined.includes("SPLIT_BANNER") && combined.includes("POLAROID_LIFESTYLE") && combined.includes("CLINICAL_TRUST"));
  assert.ok(/ONLY from this list/.test(combined));
  assert.ok(!combined.includes("NEON_NIGHTLIFE"), "must not describe an archetype outside the allowed set as an option");
  assert.ok(combined.includes(`"layoutArchetype": "SPLIT_BANNER"|"POLAROID_LIFESTYLE"|"CLINICAL_TRUST"`), "JSON shape block must match the restricted set");
});

// FINAL HERMES MISSION (2026-09-06): FEATURE_POSTER's compositor was found
// flattening every business into the same headline+3-static-differentiators
// +CTA shape regardless of the actual content strategy for that post. The
// fix is prompt-side (this test) plus render-side (text-overlay-render.ts):
// only a FEATURE_POSTER-forced prompt gets the expanded role vocabulary and
// explicit "don't default to the same shape every time" instruction -- every
// other archetype's prompt is unchanged, since only FEATURE_POSTER's
// compositor actually renders the extra roles distinctly.
test("routingContext.forcedArchetype FEATURE_POSTER: prompt explains the extra content-structure roles and tells the model not to default to the same shape every time", () => {
  const messages = buildRestaurantPromptMessages({ forcedArchetype: "FEATURE_POSTER", allowedArchetypes: [], reason: "Starter automated path" });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(combined.includes("does NOT require a fixed"), "must explicitly tell the model FEATURE_POSTER has no fixed headline+bullets+CTA requirement");
  for (const role of ["insight", "proof", "painPoint", "solution", "value", "question", "answer", "benefit", "differentiators"]) {
    assert.ok(combined.includes(role), `expected the FEATURE_POSTER guidance to mention the "${role}" role`);
  }
  assert.ok(/two different shapes/i.test(combined), "must explicitly warn against defaulting to the same structure every time");
  assert.ok(combined.includes(`"layoutArchetype": "FEATURE_POSTER"`), "JSON shape block must still only offer the forced value");
});

test("routingContext.forcedArchetype BASIC_ESSENTIAL: prompt does NOT get the FEATURE_POSTER-only expanded role vocabulary", () => {
  const messages = buildRestaurantPromptMessages({ forcedArchetype: "BASIC_ESSENTIAL", allowedArchetypes: [], reason: "Starter automated path" });
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(!combined.includes("does NOT require a fixed"), "the FEATURE_POSTER-specific content-structure guidance must not leak into other archetypes' prompts");
  assert.ok(!combined.includes('"painPoint"') && !combined.includes('"differentiators"'), "other archetypes' compositors only ever read headline/supportingLine/cta/brandLabel -- offering them the extra roles would just mean silently-dropped content");
});

// FINAL HERMES ROOT-CAUSE mission, round 2 (2026-09-06): real bug found
// live -- two back-to-back real generations for two DIFFERENT businesses
// both independently converged on the model's own default "question+answer"
// shape, because concept/pillar/archetype all had real recency tracking but
// the actual on-image MESSAGE SHAPE had none at all.
test("describeTextStructureShape: real shape fingerprint excludes structural chrome (brandLabel/cta), keyed only on real message-carrying roles", () => {
  assert.equal(describeTextStructureShape([{ role: "brandLabel", text: "X" }, { role: "question", text: "Y" }, { role: "answer", text: "Z" }, { role: "cta", text: "Go" }]), "question+answer");
  assert.equal(describeTextStructureShape([{ role: "headline", text: "X" }]), "headline");
  assert.equal(describeTextStructureShape([{ role: "brandLabel", text: "X" }, { role: "cta", text: "Go" }]), "photo_only");
  assert.equal(describeTextStructureShape([]), "photo_only");
});

test("routingContext.forcedArchetype FEATURE_POSTER: recent shapes for this tenant are surfaced with an explicit instruction to prefer a different one", () => {
  const messages = buildRestaurantPromptMessages({ forcedArchetype: "FEATURE_POSTER", allowedArchetypes: [], reason: "test" }, ["question+answer", "question+answer"]);
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(combined.includes("question+answer"), "the real recent shape fingerprints must reach the prompt verbatim");
  assert.ok(/prefer a genuinely different shape/i.test(combined), "must explicitly instruct the model to prefer a different shape than its recent real ones");
});

test("routingContext.forcedArchetype FEATURE_POSTER: no recent-shapes instruction is added when there is no real history yet", () => {
  const messages = buildRestaurantPromptMessages({ forcedArchetype: "FEATURE_POSTER", allowedArchetypes: [], reason: "test" }, []);
  const combined = messages.map((m) => m.content).join("\n");
  assert.ok(!/prefer a genuinely different shape/i.test(combined), "must not fabricate a diversity instruction when there is no real recent-shape data at all");
});

test("validateCreativeTreatment rejects a forced-archetype mismatch (AI ignored the server's decision)", () => {
  const bad = { ...GOOD_TREATMENT, layoutArchetype: "SPLIT_BANNER" };
  const issues = validateCreativeTreatment(bad, { concept: "training tip", routingContext: { forcedArchetype: "BASIC_ESSENTIAL", allowedArchetypes: [], reason: "test" } });
  assert.ok(issues.some((i) => i.field === "layoutArchetype" && /server forced/.test(i.issue)));
});

test("validateCreativeTreatment rejects an archetype outside the allowed preference set (tier/preference bypass attempt)", () => {
  const bad = { ...GOOD_TREATMENT, layoutArchetype: "NEON_NIGHTLIFE" };
  const issues = validateCreativeTreatment(bad, { concept: "training tip", routingContext: { forcedArchetype: null, allowedArchetypes: ["SPLIT_BANNER", "CLINICAL_TRUST"], reason: "test" } });
  assert.ok(issues.some((i) => i.field === "layoutArchetype" && /not in this tenant's allowed set/.test(i.issue)));
});

test("validateCreativeTreatment accepts an archetype that IS in the allowed preference set", () => {
  const good = { ...GOOD_TREATMENT, layoutArchetype: "CLINICAL_TRUST" };
  const issues = validateCreativeTreatment(good, { concept: "training tip", routingContext: { forcedArchetype: null, allowedArchetypes: ["SPLIT_BANNER", "CLINICAL_TRUST"], reason: "test" } });
  assert.deepEqual(issues, []);
});

test("forceArchetypeOntoTreatment unconditionally corrects a mismatched forced archetype -- the AI never actually gets the final say", () => {
  const treatment = { ...GOOD_TREATMENT, layoutArchetype: "SPLIT_BANNER" } as const;
  const corrected = forceArchetypeOntoTreatment(treatment, { forcedArchetype: "BASIC_ESSENTIAL", allowedArchetypes: [], reason: "test" });
  assert.equal(corrected.layoutArchetype, "BASIC_ESSENTIAL");
  // Everything else about the treatment is untouched -- only the archetype field is overwritten.
  assert.equal(corrected.concept, treatment.concept);
});

test("forceArchetypeOntoTreatment is a no-op when there's no routing context or nothing was forced", () => {
  const treatment = { ...GOOD_TREATMENT, layoutArchetype: "SPLIT_BANNER" } as const;
  assert.equal(forceArchetypeOntoTreatment(treatment, undefined).layoutArchetype, "SPLIT_BANNER");
  assert.equal(forceArchetypeOntoTreatment(treatment, { forcedArchetype: null, allowedArchetypes: ["SPLIT_BANNER"], reason: "test" }).layoutArchetype, "SPLIT_BANNER");
});

test("extractVerifiedContactInfo pulls location/website from real verified facts, never fabricates a missing phone", () => {
  const info = extractVerifiedContactInfo([
    "Verified business address (Google Business Profile): 14 Princess Street, Fort Kochi, Kerala 682001",
    "Verified website: https://coastalkitchen.example.in",
    "Target audience: local food lovers",
  ]);
  assert.equal(info.location, "14 Princess Street, Fort Kochi, Kerala 682001");
  assert.equal(info.website, "https://coastalkitchen.example.in");
  assert.equal(info.phone, null, "no phone fact was supplied -- must never be guessed or fabricated");
});

test("extractVerifiedContactInfo returns all-null for an empty facts list", () => {
  const info = extractVerifiedContactInfo([]);
  assert.deepEqual(info, { location: null, phone: null, website: null });
});

test("extractVerifiedContactInfo extracts a phone/WhatsApp fact when one genuinely exists", () => {
  const info = extractVerifiedContactInfo(["Verified WhatsApp number: +91 98765 43210"]);
  assert.equal(info.phone, "+91 98765 43210");
});

test("resolveOverlayElements folds a needed CTA into the on-image elements when the model didn't duplicate it into textHierarchy (real bug: 8/14 real passing creatives silently rendered with no CTA at all)", () => {
  const treatment: CreativeTreatment = {
    ...GOOD_TREATMENT,
    textHierarchy: [{ role: "headline", text: "Ready for your transformation?" }, { role: "supportingLine", text: "Bridal styling packages." }],
    cta: { needed: true, text: "Tap to book your bridal consultation.", rationale: "Booking objective" },
  };
  const resolved = resolveOverlayElements(treatment);
  assert.equal(resolved.length, 3);
  const ctaElement = resolved.find((e) => e.role === "cta");
  assert.ok(ctaElement, "expected a cta element to be present after resolution");
  assert.equal(ctaElement!.text, "Tap to book your bridal consultation.");
});

test("resolveOverlayElements does not duplicate the CTA when the model already included one in textHierarchy", () => {
  const treatment: CreativeTreatment = {
    ...GOOD_TREATMENT,
    textHierarchy: [{ role: "headline", text: "H" }, { role: "cta", text: "Already here" }],
    cta: { needed: true, text: "Already here", rationale: "x" },
  };
  const resolved = resolveOverlayElements(treatment);
  assert.equal(resolved.filter((e) => e.role === "cta").length, 1);
});

test("resolveOverlayElements adds nothing when cta.needed is false", () => {
  const treatment: CreativeTreatment = {
    ...GOOD_TREATMENT,
    textHierarchy: [{ role: "headline", text: "H" }],
    cta: { needed: false, text: null, rationale: "photo carries the idea" },
  };
  const resolved = resolveOverlayElements(treatment);
  assert.equal(resolved.length, 1);
  assert.equal(resolved.some((e) => e.role === "cta"), false);
});

test("resolveOverlayElements adds nothing when cta.needed is true but cta.text is empty (nothing real to render)", () => {
  const treatment: CreativeTreatment = {
    ...GOOD_TREATMENT,
    textHierarchy: [{ role: "headline", text: "H" }],
    cta: { needed: true, text: "", rationale: "x" },
  };
  const resolved = resolveOverlayElements(treatment);
  assert.equal(resolved.length, 1);
});

console.log("creative-treatment.test.ts: ALL PASS");
