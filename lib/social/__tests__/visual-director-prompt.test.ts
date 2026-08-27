// Run with: node --experimental-strip-types lib/social/__tests__/visual-director-prompt.test.ts
import assert from "node:assert/strict";
import { buildVisualDirectorBrief } from "../visual-director-prompt.ts";
import { deriveBrandVisualDNA } from "../brand-visual-dna.ts";
import type { CreativeTreatment } from "../creative-treatment.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`visual-director-prompt.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`visual-director-prompt.test.ts: ${name} — FAIL`);
    throw err;
  }
}

const BRAND_DNA = deriveBrandVisualDNA({ brandColors: ["#0B3D91", "#F4A300"], brandTone: ["bold", "energetic"], industryCategory: "gym" });

const BASE_TREATMENT: CreativeTreatment = {
  concept: "Turn the after-work energy crash into a recognizable 20-minute mobility ritual",
  hook: "Sitting all day is quietly wrecking your squat.",
  audienceTension: "Desk workers feel too depleted after work to start a real session",
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
  cta: { needed: true, text: "Drop a comment: what's your tightest spot?", rationale: "Engagement objective" },
  format: "single image post",
  whyStopScroll: "Mid-motion coaching moment with real tension in the frame, not a posed portrait",
  whyThisBusiness: "Depicts IronCore's actual coached-session format, not generic gym stock imagery",
  negativeConstraints: ["no unrelated stock gym imagery"],
  intentionallyTextLed: false,
  layoutArchetype: "FLOATING_CARD",
};

test("SPLIT_BANNER: prompt reserves the bottom ~30% of the frame for the opaque brand panel", () => {
  const brief = buildVisualDirectorBrief({ treatment: { ...BASE_TREATMENT, layoutArchetype: "SPLIT_BANNER" }, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  assert.ok(/split_banner/i.test(brief), "prompt must name the archetype it's briefing for");
  assert.ok(/bottom ~?30%/i.test(brief), "prompt must specify the reserved bottom-30% area");
  assert.ok(/top ~?70%/i.test(brief), "prompt must direct the subject into the top 70%");
  console.log("visual-director-prompt.test.ts: SPLIT_BANNER reserves bottom 30% — PASS");
});

test("FLOATING_CARD: prompt weights the subject away from the bottom-left corner the card occupies", () => {
  const brief = buildVisualDirectorBrief({ treatment: { ...BASE_TREATMENT, layoutArchetype: "FLOATING_CARD" }, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  assert.ok(/floating_card/i.test(brief));
  assert.ok(/bottom-left/i.test(brief), "prompt must call out the specific corner the card occupies");
  assert.ok(/right two-thirds|weighted toward the right/i.test(brief), "prompt must direct the subject away from that corner");
});

test("EDITORIAL_FRAME: prompt calls for a thin outer frame and centered composition", () => {
  const brief = buildVisualDirectorBrief({ treatment: { ...BASE_TREATMENT, layoutArchetype: "EDITORIAL_FRAME" }, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  assert.ok(/editorial_frame/i.test(brief));
  assert.ok(/thin outer border/i.test(brief));
  assert.ok(/lower-middle third/i.test(brief));
});

test("the three archetypes produce materially different negative-space instructions for the identical treatment", () => {
  const split = buildVisualDirectorBrief({ treatment: { ...BASE_TREATMENT, layoutArchetype: "SPLIT_BANNER" }, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  const card = buildVisualDirectorBrief({ treatment: { ...BASE_TREATMENT, layoutArchetype: "FLOATING_CARD" }, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  const frame = buildVisualDirectorBrief({ treatment: { ...BASE_TREATMENT, layoutArchetype: "EDITORIAL_FRAME" }, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  assert.notEqual(split, card);
  assert.notEqual(card, frame);
  assert.notEqual(split, frame);
});

test("intentionallyTextLed=false with zero-length textHierarchy and no CTA still uses the generic no-text note, not an archetype note", () => {
  const treatment: CreativeTreatment = { ...BASE_TREATMENT, layoutArchetype: "SPLIT_BANNER", textHierarchy: [], cta: { needed: false, text: null, rationale: "photo carries the idea" } };
  const brief = buildVisualDirectorBrief({ treatment, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  assert.ok(/No on-image text is planned/.test(brief));
  assert.ok(!/split_banner/i.test(brief), "must not reserve archetype-specific space when there is no on-image text to place at all");
});

test("negative constraints and brand colors from the treatment still pass through unmodified alongside the new archetype note", () => {
  const brief = buildVisualDirectorBrief({ treatment: BASE_TREATMENT, businessName: "IronCore Fitness", brandDNA: BRAND_DNA });
  assert.ok(brief.includes("no unrelated stock gym imagery"));
  assert.ok(brief.includes(BRAND_DNA.primaryColor!));
});

console.log("visual-director-prompt.test.ts: ALL PASS");
