import assert from "node:assert/strict";
import {
  assessMarketingCompletenessAutomated,
  assessMarketingCompleteness,
  recordVisualCompletenessInspection,
  pendingVisualCompletenessChecks,
} from "../marketing-completeness-score.ts";
import type { CreativeTreatment } from "../creative-treatment.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`marketing-completeness-score.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`marketing-completeness-score.test.ts: ${name} — FAIL`);
    throw err;
  }
}

const BASE_TREATMENT: CreativeTreatment = {
  concept: "Turn the after-work energy crash into a recognizable 20-minute mobility ritual",
  hook: "Sitting all day is quietly wrecking your squat.",
  audienceTension: "Desk workers feel too depleted after work to start a real session",
  story: "A short structured mobility ritual bridges the gap between a desk day and real training",
  visualIdea: "Coach guiding a client through a targeted hip-opener stretch mid-session",
  subject: "Coach and client mid mobility stretch, hands guiding form",
  composition: "Subject-centered, negative space upper-left for headline",
  camera: "35mm documentary feel, slightly low angle",
  lighting: "Hard gym overheads with a warm rim light",
  environment: "Dark industrial gym floor, IronCore equipment in soft focus",
  colorDirection: "High-contrast red/black brand accents against a mostly dark frame",
  typographyDirection: "Bold condensed display headline, tight tracking",
  brandApplication: "IronCore Fitness wordmark small, bottom-right, red on black",
  textHierarchy: [{ role: "headline", text: "The 20-Minute Desk Reset" }, { role: "cta", text: "Book a session at our Koramangala studio" }],
  cta: { needed: true, text: "Book a session at our Koramangala studio", rationale: "Booking objective" },
  format: "single image post",
  whyStopScroll: "Mid-motion coaching moment with real tension in the frame",
  whyThisBusiness: "Depicts IronCore's actual coached-session format in Koramangala, not generic gym stock imagery",
  negativeConstraints: ["no unrelated stock gym imagery"],
  intentionallyTextLed: false,
};

test("a complete, well-formed treatment passes every automated check", () => {
  const checks = assessMarketingCompletenessAutomated({
    treatment: BASE_TREATMENT, businessName: "IronCore Fitness",
    verifiedFacts: ["Business location: Koramangala, Bengaluru"], caption: "Real caption here.",
  });
  for (const c of checks) assert.equal(c.pass, true, `expected ${c.id} to pass: ${c.detail}`);
});

test("real bug regression: cta.needed=true but no CTA element actually renders -> cta_present_when_required fails", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, textHierarchy: [{ role: "headline", text: "H" }], cta: { needed: true, text: "", rationale: "x" } };
  const checks = assessMarketingCompletenessAutomated({ treatment, businessName: "IronCore Fitness", verifiedFacts: [], caption: "C" });
  const check = checks.find((c) => c.id === "cta_present_when_required")!;
  assert.equal(check.pass, false);
});

test("a treatment that legitimately needs no CTA is not penalized", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, textHierarchy: [{ role: "headline", text: "H" }], cta: { needed: false, text: null, rationale: "photo carries the idea" } };
  const checks = assessMarketingCompletenessAutomated({ treatment, businessName: "IronCore Fitness", verifiedFacts: [], caption: "C" });
  const check = checks.find((c) => c.id === "cta_present_when_required")!;
  assert.equal(check.pass, true);
});

test("a booking CTA with no location/contact signal anywhere fails the destination check", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, cta: { needed: true, text: "Book now", rationale: "x" }, textHierarchy: [{ role: "cta", text: "Book now" }] };
  const checks = assessMarketingCompletenessAutomated({ treatment, businessName: "IronCore Fitness", verifiedFacts: [], caption: "Book now" });
  const check = checks.find((c) => c.id === "destination_present_when_needed")!;
  assert.equal(check.pass, false);
});

test("an engagement CTA (comment/save) needs no destination and is never penalized", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, cta: { needed: true, text: "Drop a comment below", rationale: "engagement" }, textHierarchy: [{ role: "cta", text: "Drop a comment below" }] };
  const checks = assessMarketingCompletenessAutomated({ treatment, businessName: "IronCore Fitness", verifiedFacts: [], caption: "Drop a comment below" });
  const check = checks.find((c) => c.id === "destination_present_when_needed")!;
  assert.equal(check.pass, true);
});

test("instruction-leakage anywhere in the rendered fields fails no_textual_placeholder", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, textHierarchy: [{ role: "headline", text: "Add text here" }] };
  const checks = assessMarketingCompletenessAutomated({ treatment, businessName: "IronCore Fitness", verifiedFacts: [], caption: "C" });
  const check = checks.find((c) => c.id === "no_textual_placeholder")!;
  assert.equal(check.pass, false);
});

test("more than one brand-label element is flagged as overbranded", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, textHierarchy: [{ role: "headline", text: "H" }, { role: "brandLabel", text: "IronCore Fitness" }] };
  const checks = assessMarketingCompletenessAutomated({ treatment, businessName: "IronCore Fitness", verifiedFacts: [], caption: "C" });
  const check = checks.find((c) => c.id === "brand_present_not_overused")!;
  assert.equal(check.pass, false);
});

test("assessMarketingCompleteness combines automated + 5 pending visual checks, honestly PENDING", () => {
  const result = assessMarketingCompleteness({ treatment: BASE_TREATMENT, businessName: "IronCore Fitness", verifiedFacts: ["Location: Koramangala"], caption: "C" });
  assert.equal(result.status, "PENDING_VISUAL_INSPECTION");
  assert.equal(result.visuallyComplete, null);
  const visualChecks = result.checks.filter((c) => c.pass === null);
  assert.equal(visualChecks.length, 5);
});

test("recordVisualCompletenessInspection completes the result with real answers, never fabricated", () => {
  const prior = assessMarketingCompleteness({ treatment: BASE_TREATMENT, businessName: "IronCore Fitness", verifiedFacts: ["Location: Koramangala"], caption: "C" });
  const complete = recordVisualCompletenessInspection(prior, {
    product_visually_identifiable: { pass: true, detail: "real coaching moment visible" },
    feels_finished: { pass: true, detail: "clean composition, no unfinished areas" },
    no_visual_placeholder: { pass: true, detail: "no watermark/artifact" },
    visual_message_alignment: { pass: true, detail: "photo matches the coaching concept" },
    publish_immediately: { pass: true, detail: "yes" },
  });
  assert.equal(complete.status, "COMPLETE");
  assert.equal(complete.visuallyComplete, true);
  assert.equal(complete.checks.filter((c) => c.pass === null).length, 0);
});

test("pendingVisualCompletenessChecks always returns exactly 5 checks, all null", () => {
  const checks = pendingVisualCompletenessChecks();
  assert.equal(checks.length, 5);
  assert.ok(checks.every((c) => c.pass === null));
});

console.log("marketing-completeness-score.test.ts: ALL PASS");
