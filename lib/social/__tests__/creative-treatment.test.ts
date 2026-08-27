import assert from "node:assert/strict";
import { validateCreativeTreatment, buildCreativeTreatmentPrompt, resolveOverlayElements, extractVerifiedContactInfo, type CreativeTreatment } from "../creative-treatment.ts";
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

test("each of the three real layout archetypes is accepted", () => {
  for (const archetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
    const good = { ...GOOD_TREATMENT, layoutArchetype: archetype };
    const issues = validateCreativeTreatment(good, { concept: "training tip" });
    assert.deepEqual(issues, [], `expected ${archetype} to be a valid archetype`);
  }
});

test("buildCreativeTreatmentPrompt explains all three layout archetypes and requires a deliberate choice", () => {
  const brief = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName, industryText: RESTAURANT_FIXTURE.industryText, descriptionText: RESTAURANT_FIXTURE.descriptionText,
    platform: "instagram", mediaType: "image", availablePillars: RESTAURANT_FIXTURE.contentPillars, objective: "AUTHORITY",
    verifiedFacts: [], brandTone: RESTAURANT_FIXTURE.brandTone, brandColors: RESTAURANT_FIXTURE.brandColors, audience: RESTAURANT_FIXTURE.audience,
  });
  const dna = deriveBrandVisualDNA({ brandColors: RESTAURANT_FIXTURE.brandColors, brandTone: RESTAURANT_FIXTURE.brandTone, industryCategory: "restaurant" });
  const vocab = getIndustryVisualVocabulary("restaurant");
  const messages = buildCreativeTreatmentPrompt({ brief, businessName: RESTAURANT_FIXTURE.businessName, industry: "restaurant", brandDNA: dna, visualVocab: vocab, mediaType: "image" });
  const combined = messages.map((m) => m.content).join("\n");
  for (const archetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"]) {
    assert.ok(combined.includes(archetype), `expected the prompt to explain ${archetype}`);
  }
  assert.ok(combined.toLowerCase().includes("layoutarchetype"));
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
