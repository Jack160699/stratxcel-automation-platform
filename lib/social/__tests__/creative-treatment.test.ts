import assert from "node:assert/strict";
import { validateCreativeTreatment, buildCreativeTreatmentPrompt, resolveOverlayElements, extractVerifiedContactInfo, forceArchetypeOntoTreatment, LAYOUT_ARCHETYPE_IDS, type CreativeTreatment } from "../creative-treatment.ts";
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
  const bad = {
    ...GOOD_TREATMENT,
    textHierarchy: [
      { role: "headline", text: "a" },
      { role: "supportingLine", text: "b" },
      { role: "cta", text: "c" },
      { role: "brandLabel", text: "d" },
      { role: "other", text: "e" },
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

test("each of the 12 registered layout archetypes is accepted", () => {
  for (const archetype of LAYOUT_ARCHETYPE_IDS) {
    const good = { ...GOOD_TREATMENT, layoutArchetype: archetype };
    const issues = validateCreativeTreatment(good, { concept: "training tip" });
    assert.deepEqual(issues, [], `expected ${archetype} to be a valid archetype`);
  }
  assert.equal(LAYOUT_ARCHETYPE_IDS.length, 12, "registry must expose exactly 12 archetypes");
});

function buildRestaurantPromptMessages(routingContext?: Parameters<typeof buildCreativeTreatmentPrompt>[0]["routingContext"]) {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName, industryText: RESTAURANT_FIXTURE.industryText, descriptionText: RESTAURANT_FIXTURE.descriptionText,
    platform: "instagram", mediaType: "image", availablePillars: RESTAURANT_FIXTURE.contentPillars, objective: "AUTHORITY",
    verifiedFacts: [], brandTone: RESTAURANT_FIXTURE.brandTone, brandColors: RESTAURANT_FIXTURE.brandColors, audience: RESTAURANT_FIXTURE.audience,
  });
  const dna = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors, brandTone: RESTAURANT_FIXTURE.brandTone, industryCategory: "restaurant" });
  const vocab = getIndustryVisualVocabulary("restaurant");
  return buildCreativeTreatmentPrompt({ brief, businessName: RESTAURANT_FIXTURE.businessName, industry: "restaurant", brandDNA: dna, visualVocab: vocab, mediaType: "image", routingContext });
}

test("buildCreativeTreatmentPrompt explains all 12 layout archetypes and requires a deliberate choice when unrestricted", () => {
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
