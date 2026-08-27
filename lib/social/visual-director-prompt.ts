/**
 * Visual-director image prompt (Premium Creative Intelligence brief
 * Section 23): the existing image-generation path
 * (buildProviderReadyImagePrompt in @stratxcel/ai-runtime) takes one
 * free-text `brief` string. Previously that string was just
 * `"${title}. ${caption}"` -- literally the social caption, with no
 * subject/composition/camera/lighting/color/mood direction at all. This
 * module builds that brief string FROM the structured CreativeTreatment
 * instead, the way an actual art director would brief a photographer:
 * subject, environment, action, composition, focal point, camera
 * position, depth, lighting, texture, color direction, mood, realism,
 * negative constraints, and text-safe areas -- not a caption repeated back
 * as an image prompt.
 *
 * Pure and deterministic: given the same treatment, always the same
 * prompt text. No AI call -- this formats what generateCreativeTreatment
 * already produced.
 */

import { resolveOverlayElements, type CreativeTreatment } from "./creative-treatment.ts";
import type { BrandVisualDNA } from "./brand-visual-dna.ts";

export function buildVisualDirectorBrief(input: {
  treatment: CreativeTreatment;
  businessName: string;
  brandDNA: BrandVisualDNA;
}): string {
  const { treatment: t, businessName, brandDNA } = input;
  // resolveOverlayElements, not t.textHierarchy directly -- a CTA the
  // treatment intends (cta.needed=true) but didn't duplicate into
  // textHierarchy still needs its own reserved negative space in the base
  // photo, or it will visually collide with whatever the model composed
  // there once the overlay actually renders it.
  const overlayElements = resolveOverlayElements(t);

  // Final Production Loop brief Step 3: WHERE that negative space needs to
  // sit is a direct function of the layout archetype the treatment already
  // committed to (Step 1) -- the deterministic compositor
  // (text-overlay-render.ts) renders a genuinely different container per
  // archetype, so the base photo needs a genuinely different reserved area
  // per archetype, not one generic "leave some space at the bottom" note.
  const archetypeSpaceNote: Record<CreativeTreatment["layoutArchetype"], string> = {
    SPLIT_BANNER: `This creative uses a SPLIT_BANNER layout: a solid, opaque, brand-colored panel will be composited across the full width of the bottom ~30% of the frame after generation, carrying all text and contact info. Compose the photograph so its subject and any critical visual detail live entirely in the TOP ~70% of the frame -- keep the bottom 30% clean, simple, and uncluttered (open floor, wall, sky, or soft out-of-focus background) since it will be fully covered by an opaque panel, not just dimmed.`,
    FLOATING_CARD: `This creative uses a FLOATING_CARD layout: a padded card will be composited into the BOTTOM-LEFT corner after generation, and a small brand-name label into the top-right corner. Compose the subject weighted toward the right two-thirds and upper portion of the frame, leaving the bottom-left corner as soft, simple, out-of-focus negative space (not the subject's face, hands, or any critical detail) so the card can sit there without covering anything essential.`,
    EDITORIAL_FRAME: `This creative uses an EDITORIAL_FRAME layout: a thin outer border and a compact, centered text block (in the lower-middle third) will be composited after generation, with a small brand lockup centered at the very top. Compose the subject centered or rule-of-thirds within the frame with generally even, uncluttered negative space around the extreme top-center and lower-middle regions -- avoid placing critical detail there -- while the rest of the frame can be as rich and detailed as the concept calls for.`,
  };

  const textSafeNote = overlayElements.length
    ? `Leave clean, uncluttered negative space for ${overlayElements.length} overlay text element(s) (${overlayElements.map((e) => e.role).join(", ")}) -- do not compose critical visual detail where on-image text would need to sit. ${archetypeSpaceNote[t.layoutArchetype]}`
    : `No on-image text is planned for this creative -- the photograph itself must carry the entire idea. Compose for maximum visual impact with zero reliance on overlay text.`;

  const lines = [
    `VISUAL CONCEPT: ${t.concept}`,
    `WHY THIS SHOULD STOP THE SCROLL: ${t.whyStopScroll}`,
    `WHY THIS FEELS LIKE ${businessName.toUpperCase()} SPECIFICALLY: ${t.whyThisBusiness}`,
    ``,
    `SUBJECT: ${t.subject}`,
    `VISUAL IDEA / SCENE: ${t.visualIdea}`,
    `ENVIRONMENT: ${t.environment}`,
    `COMPOSITION: ${t.composition}`,
    `CAMERA / VIEW: ${t.camera}`,
    `LIGHTING: ${t.lighting}`,
    `COLOR DIRECTION: ${t.colorDirection} (brand palette: ${[brandDNA.primaryColor, brandDNA.secondaryColor, brandDNA.accentColor].filter(Boolean).join(", ") || "no fixed palette -- use natural, on-brand color grading"}; ${brandDNA.colorTemperature} temperature, ${brandDNA.saturationLevel} saturation, ${brandDNA.lightDarkPreference} overall tonality)`,
    `MOOD: ${t.audienceTension ? `resolves the tension of "${t.audienceTension}"` : "premium, intentional, editorial"}`,
    ``,
    textSafeNote,
    t.negativeConstraints.length ? `NEGATIVE CONSTRAINTS: ${t.negativeConstraints.join("; ")}.` : null,
    `Realism: shot like a real professional photograph, not an illustration, render, or stock-template composite. Editorial quality. This is one single production-quality photograph, not a text-heavy graphic design layout.`,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}
