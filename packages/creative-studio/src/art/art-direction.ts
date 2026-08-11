import type { ArtDirectionArtifact, CreativeBrief, CreativeConcept } from "../types.ts";

const ASPECT_BY_FORMAT: Record<string, string> = {
  image: "1:1",
  carousel: "4:5",
  reel: "9:16",
  video: "16:9",
  story: "9:16",
  longform: "16:9",
};

export function createArtDirection(args: {
  brief: CreativeBrief;
  concept: CreativeConcept;
  referenceAssetIds?: readonly string[];
}): ArtDirectionArtifact {
  return {
    id: `art_${args.brief.id}_${args.concept.id}`,
    visualConcept: args.concept.visualAngle,
    composition: "subject-centered with intentional negative space for overlays",
    subject: args.brief.productFacts[0] ?? args.concept.title,
    environment: "brand-consistent setting, uncluttered",
    lighting: "soft directional key light, controlled highlights",
    lensFeel: "35–50mm documentary / product feel",
    colorDirection: ["brand primary", "neutral support", "one accent"],
    typographyPlan: {
      headlineFont: "Display Sans",
      bodyFont: "Readable Sans",
      hierarchy: ["headline", "subhead", "caption", "cta"],
    },
    logoTreatment: "safe-corner lockup, never over face/product critical detail",
    negativeConstraints: [
      ...args.brief.mustAvoid,
      "no fake photography claims",
      "no unreadable microtext",
      "no unrelated stock faces as customer proof",
    ],
    productFidelityRequirements: [
      "preserve product silhouette",
      "preserve label/logo legibility when product is hero",
      "no invented product features",
      ...args.brief.productFacts.slice(0, 3),
    ],
    humanRealismRequirements: [
      "natural proportions",
      "no extra limbs / distorted hands",
      "consistent lighting on skin",
    ],
    referenceAssetIds: [...(args.referenceAssetIds ?? args.brief.references)],
    aspectRatio: ASPECT_BY_FORMAT[args.brief.format] ?? "1:1",
    safeArea: "keep critical content inside 90% center safe zone",
    textOverlayPlan: [args.concept.hook.slice(0, 80), args.brief.cta],
  };
}
