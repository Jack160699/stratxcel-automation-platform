import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scorePremiumCreative, recordVisualInspection, PREMIUM_DIMENSION_WEIGHTS, PREMIUM_PASS_THRESHOLD } from "../premium-creative-score.ts";
import { buildCreativeBrief } from "../creative-brief.ts";
import type { CreativeTreatment } from "../creative-treatment.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`premium-creative-score.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`premium-creative-score.test.ts: ${name} — FAIL`);
    throw err;
  }
}

const brief = buildCreativeBrief({
  businessName: "IronCore Fitness",
  industryText: "Gym",
  descriptionText: "A strength and conditioning gym",
  platform: "instagram",
  mediaType: "image",
  availablePillars: ["Training tip"],
  objective: "ENGAGEMENT",
  verifiedFacts: ["Verified location: Koramangala, Bengaluru", "Priority offering: personal training packages"],
  brandTone: ["confident"],
  brandColors: ["#D62828", "#111111"],
  audience: "working professionals in Koramangala",
});

const strongTreatment: CreativeTreatment = {
  concept: "Turn the after-work energy crash into a recognizable 20-minute mobility ritual for Koramangala desk workers",
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
  textHierarchy: [{ role: "headline", text: "The 20-Minute Desk Reset" }],
  cta: { needed: true, text: "Drop a comment: what's your tightest spot?", rationale: "Engagement objective -- invites a reply" },
  format: "single image post",
  whyStopScroll: "Mid-motion coaching moment with real tension in the frame",
  whyThisBusiness: "Depicts IronCore's actual coached-session format in Koramangala, not generic gym stock imagery",
  negativeConstraints: ["no unrelated stock gym imagery"],
  intentionallyTextLed: false,
};

test("a strong, specific, on-brand treatment scores well on all six auto-scorable dimensions", () => {
  const result = scorePremiumCreative({ treatment: strongTreatment, brief });
  assert.ok(result.textDerivableScore >= result.textDerivableMax * 0.85, `expected a high score, got ${result.textDerivableScore}/${result.textDerivableMax}`);
  assert.equal(result.status, "PENDING_VISUAL_INSPECTION");
  assert.equal(result.totalScore, null);
});

test("a generic, filler-laden treatment scores meaningfully lower", () => {
  const weakTreatment: CreativeTreatment = {
    ...strongTreatment,
    concept: "training tip", // same as the category label -- should be penalized
    story: "Experience excellence with our professional team.",
    whyStopScroll: "x",
    whyThisBusiness: "y",
    brandApplication: "",
  };
  const strong = scorePremiumCreative({ treatment: strongTreatment, brief });
  const weak = scorePremiumCreative({ treatment: weakTreatment, brief });
  assert.ok(weak.textDerivableScore < strong.textDerivableScore, `expected weak (${weak.textDerivableScore}) < strong (${strong.textDerivableScore})`);
});

test("originality drops when the concept closely repeats a recent one", () => {
  const fresh = scorePremiumCreative({ treatment: strongTreatment, brief, recentConceptTexts: ["A completely unrelated concept about something else entirely"] });
  const repeat = scorePremiumCreative({ treatment: strongTreatment, brief, recentConceptTexts: [strongTreatment.concept] });
  assert.ok(repeat.breakdown.originality < fresh.breakdown.originality);
});

test("visual dimensions stay null until recordVisualInspection is called", () => {
  const result = scorePremiumCreative({ treatment: strongTreatment, brief });
  assert.equal(result.breakdown.visualArtDirection, null);
  assert.equal(result.breakdown.composition, null);
  assert.equal(result.breakdown.typography, null);
  assert.equal(result.breakdown.imageQuality, null);
});

test("recordVisualInspection completes the total and flips status to COMPLETE", () => {
  const prior = scorePremiumCreative({ treatment: strongTreatment, brief });
  const complete = recordVisualInspection(prior, {
    visualArtDirection: 14, composition: 9, typography: 5, imageQuality: 9,
    notes: ["real photo, on-brand, no artifacts"],
  });
  assert.equal(complete.status, "COMPLETE");
  assert.equal(typeof complete.totalScore, "number");
  assert.equal(complete.totalScore, prior.textDerivableScore + 14 + 9 + 5 + 9);
});

test("recordVisualInspection clamps out-of-range scores to each dimension's weight", () => {
  const prior = scorePremiumCreative({ treatment: strongTreatment, brief });
  const complete = recordVisualInspection(prior, {
    visualArtDirection: 999, composition: -5, typography: 5, imageQuality: 9, notes: [],
  });
  assert.equal(complete.breakdown.visualArtDirection, PREMIUM_DIMENSION_WEIGHTS.visualArtDirection);
  assert.equal(complete.breakdown.composition, 0);
});

test("weights sum to exactly 100", () => {
  const total = Object.values(PREMIUM_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
});

test("pass threshold is 90", () => {
  assert.equal(PREMIUM_PASS_THRESHOLD, 90);
});

test("gating policy (advisory only): the premium score never gates production pass/fail anywhere real generation happens", () => {
  // Real production quality-completion brief Section 16's decision,
  // documented in this file's own header: quality-score.ts's automated
  // text gate stays the sole enforced gate; the premium score (40 of
  // whose 100 points require a real human/vision-model look at the
  // rendered image, architecturally impossible to automate honestly
  // today) stays advisory. This asserts that decision is actually upheld
  // in the two real places generation happens, not just documented.
  const packageAutopilot = fs.readFileSync(path.join(import.meta.dirname, "..", "package-autopilot.ts"), "utf8");
  const imageService = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "image-generation", "service.ts"), "utf8");
  assert.ok(!packageAutopilot.includes("premium-creative-score"), "package-autopilot.ts must not import the advisory premium scorer to gate anything");
  assert.ok(!imageService.includes("premium-creative-score") && !imageService.includes("PREMIUM_PASS_THRESHOLD"), "the image-generation service must not gate on the advisory premium score");
});

console.log("premium-creative-score.test.ts: ALL PASS");
