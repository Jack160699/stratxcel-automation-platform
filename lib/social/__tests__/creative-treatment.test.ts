import assert from "node:assert/strict";
import { validateCreativeTreatment, buildCreativeTreatmentPrompt, type CreativeTreatment } from "../creative-treatment.ts";
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

console.log("creative-treatment.test.ts: ALL PASS");
