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

  const textSafeNote = overlayElements.length
    ? `Leave clean, uncluttered negative space for ${overlayElements.length} overlay text element(s) (${overlayElements.map((e) => e.role).join(", ")}) -- do not compose critical visual detail where on-image text would need to sit.`
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
