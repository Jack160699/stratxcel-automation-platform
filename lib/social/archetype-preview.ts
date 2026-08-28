/**
 * Local deterministic archetype preview generator (Subscription-Gated
 * Visual Archetypes brief Section 12/19): produces a real render for each
 * of the 12 archetypes using the ACTUAL production renderer
 * (buildTextOverlaySvg / renderTextOverlay in text-overlay-render.ts) and
 * fixture sample content -- never a hand-drawn mock or a screenshot that
 * can drift from what the renderer really does. No AI provider is called
 * anywhere in this file: the "photo" backdrop each archetype composites
 * onto is a synthetic, brand-tinted gradient built with sharp/SVG
 * primitives only, exactly the same primitives-only discipline the
 * renderer itself follows. This keeps the Spotify-style onboarding
 * gallery's preview images at zero AI cost (brief Section 19: "No real AI
 * credits for template previews") while still being visually honest about
 * how each archetype actually composes headline/CTA/brand/contact text.
 */
import sharp from "sharp";
import { ARCHETYPE_REGISTRY, type LayoutArchetype } from "./archetype-registry.ts";
import { renderTextOverlay, type TextOverlayLayoutInput } from "./text-overlay-render.ts";

export const PREVIEW_SIZE = 1080;

/** One consistent fixture business used across every preview so the
 * gallery reads as a coherent "what would my content look like" set
 * rather than 12 unrelated demo brands -- same fixture pattern already
 * established in text-overlay-render.test.ts ("Fort Kochi Coastal
 * Kitchen"), reused here for continuity between tests and what users see. */
const FIXTURE_BUSINESS = {
  businessName: "Fort Kochi Coastal Kitchen",
  headline: "Weekend Seafood Special",
  supportingLine: "Six coastal dishes, one banana leaf, every weekend.",
  cta: "Walk in this Saturday",
  primaryColor: "#0B3D91",
  secondaryColor: "#F4A300",
  accentColor: "#D62828",
  contactInfo: { location: "Fort Kochi, Kerala", phone: "+91 98765 43210", website: null as string | null },
};

/** Deterministic, brand-tinted gradient backdrop -- stands in for "a real
 * generated photo" without pretending to be one. Built entirely from SVG
 * primitives (linearGradient + rect), the same primitives-only approach
 * text-overlay-render.ts uses for every icon and effect in this codebase;
 * no filters, no external asset, no network call. */
async function buildSyntheticBackdrop(primaryColor: string, secondaryColor: string): Promise<Buffer> {
  const svg = `<svg width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryColor}" />
        <stop offset="100%" stop-color="${secondaryColor}" />
      </linearGradient>
    </defs>
    <rect width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" fill="url(#bg)" />
  </svg>`;
  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}

/** Builds the exact TextOverlayLayoutInput a real generation job would
 * pass for this archetype, using the fixture business above. Exported
 * separately from the render so tests / other tooling can inspect the
 * fixture without paying the sharp render cost. */
export function buildArchetypePreviewFixture(archetype: LayoutArchetype): TextOverlayLayoutInput {
  const elements: TextOverlayLayoutInput["elements"] = [
    { role: "headline", text: FIXTURE_BUSINESS.headline },
    { role: "supportingLine", text: FIXTURE_BUSINESS.supportingLine },
    { role: "cta", text: FIXTURE_BUSINESS.cta },
  ];
  return {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    elements,
    typographyPersonality: "bold-condensed",
    textColor: "#FFFFFF",
    scrimColor: "#000000",
    accentColor: FIXTURE_BUSINESS.accentColor,
    primaryColor: FIXTURE_BUSINESS.primaryColor,
    secondaryColor: FIXTURE_BUSINESS.secondaryColor,
    businessName: FIXTURE_BUSINESS.businessName,
    layoutArchetype: archetype,
    contactInfo: FIXTURE_BUSINESS.contactInfo,
  };
}

/** Renders one archetype's real 1080x1080 preview PNG using the actual
 * production renderer -- this is what the onboarding gallery, the manual
 * "choose a visual style" picker, and any archetype documentation should
 * all call, so the preview a user picks from can never drift from what
 * production actually draws. */
export async function renderArchetypePreview(archetype: LayoutArchetype): Promise<Buffer> {
  const definition = ARCHETYPE_REGISTRY[archetype];
  if (!definition) throw new Error(`Unknown archetype: ${archetype}`);
  const backdrop = await buildSyntheticBackdrop(FIXTURE_BUSINESS.primaryColor, FIXTURE_BUSINESS.secondaryColor);
  return renderTextOverlay(backdrop, buildArchetypePreviewFixture(archetype));
}
