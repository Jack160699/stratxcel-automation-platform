/**
 * Canonical visual-archetype registry (Subscription-Gated Visual Archetypes
 * brief Section 5): THE single source of truth for every one of the 12
 * layout archetypes. Every other system -- DB validation
 * (social_autopilot_visual_preferences' CHECK constraint mirrors this list
 * by hand since Postgres can't import TS; keep them in lockstep), treatment
 * validation (creative-treatment.ts), the router (archetype-routing.ts),
 * the renderer (text-overlay-render.ts's dispatch switch), the onboarding
 * gallery UI, manual-generation archetype selection, prompts, and tests --
 * consumes THIS list. Never redefine the archetype id list anywhere else.
 */

/** All 12 canonical archetype ids, in the brief's own numbered order. */
export const ARCHETYPE_IDS = [
  "BASIC_ESSENTIAL",
  "SPLIT_BANNER",
  "FLOATING_CARD",
  "EDITORIAL_FRAME",
  "MINIMAL_FOOTER_STRIP",
  "ELEVATED_BADGE",
  "DUAL_TONE_SIDEBAR",
  "FROSTED_GLASS_CENTER",
  "TYPOGRAPHIC_HERO",
  "POLAROID_LIFESTYLE",
  "CLINICAL_TRUST",
  "NEON_NIGHTLIFE",
] as const;

export type LayoutArchetype = (typeof ARCHETYPE_IDS)[number];

/** Which subscription tiers may ever use this archetype at all --
 * BASIC_ESSENTIAL is available everywhere (it's Starter's forced default,
 * but nothing stops a Growth/Business tenant from also picking the
 * reliable/safe option as one of their 1-3 preferences); the other 11 are
 * Growth+/Business+ only. This is a DIFFERENT question from "is this
 * archetype one of THIS tenant's saved preferences" -- that's
 * archetype-routing.ts's job, scoped per-tenant, not per-archetype. */
export type ArchetypeTier = "starter" | "growth" | "business";

export interface ArchetypeDefinition {
  id: LayoutArchetype;
  name: string;
  /** One or two sentences, real design intent -- shown in the onboarding
   * gallery and used to brief the AI treatment model. */
  description: string;
  /** Short "best for" hint shown in the gallery card. */
  bestUseHint: string;
  /** Free-text industry hints (not an enforced allowlist -- any archetype
   * can suit any business if the concept calls for it; these are
   * suggestions surfaced in the UI/prompt, not a hard restriction). */
  suggestedIndustries: string[];
  /** Short style label shown as a chip in the gallery ("Bold & Editorial"). */
  styleLabel: string;
  visualCharacteristics: string[];
  allowedTiers: ArchetypeTier[];
  /** Which on-image roles this archetype's renderer actually places, and
   * whether each is required for the layout to look intentional (vs.
   * merely supported if present). Mirrors OnImageTextElement roles. */
  defaultTextHierarchy: Array<{ role: "headline" | "supportingLine" | "cta" | "brandLabel"; required: boolean }>;
  /** Real constraints the renderer enforces -- surfaced to the AI prompt
   * and to design QA, not just internal documentation. */
  constraints: string[];
}

export const ARCHETYPE_REGISTRY: Record<LayoutArchetype, ArchetypeDefinition> = {
  BASIC_ESSENTIAL: {
    id: "BASIC_ESSENTIAL",
    name: "Basic Essential",
    description: "The safe, reliable default: a clean bottom band carrying headline, CTA, and brand -- restrained, image-first, and built to never fail to render correctly regardless of content length.",
    bestUseHint: "The automated baseline for every business -- always legible, never risky.",
    suggestedIndustries: ["restaurant", "salon", "gym", "clinic", "retail", "real_estate", "local_service", "generic"],
    styleLabel: "Clean & Reliable",
    visualCharacteristics: ["solid brand-color band", "single clear hierarchy", "generous safe margins", "no experimental effects"],
    allowedTiers: ["starter", "growth", "business"],
    defaultTextHierarchy: [
      { role: "brandLabel", required: true },
      { role: "headline", required: true },
      { role: "cta", required: false },
    ],
    constraints: ["never omit the brand label", "headline must fit in at most 3 wrapped lines", "no more than one supporting line"],
  },
  SPLIT_BANNER: {
    id: "SPLIT_BANNER",
    name: "Split Banner",
    description: "Roughly 70% photo, 30% solid brand-colored block carrying text and contact info -- the strong, unmissable branded block for offers and promos.",
    bestUseHint: "Promos, offers, and anything the business wants impossible to miss.",
    suggestedIndustries: ["restaurant", "retail", "gym", "local_service"],
    styleLabel: "Bold & Branded",
    visualCharacteristics: ["full-width bottom band", "brand-primary fill", "accent strip", "CTA pill"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "brandLabel", required: true },
      { role: "headline", required: true },
      { role: "supportingLine", required: false },
      { role: "cta", required: false },
    ],
    constraints: ["band targets 30% of canvas height, grows if content needs more, capped at 50%"],
  },
  FLOATING_CARD: {
    id: "FLOATING_CARD",
    name: "Floating Card",
    description: "A padded card offset into the bottom-left corner, leaving the photograph's subject completely unobstructed -- best when the photo itself IS the story.",
    bestUseHint: "A genuinely great photo (a face, a dish, a product) that deserves to breathe.",
    suggestedIndustries: ["restaurant", "salon", "clinic", "retail"],
    styleLabel: "Subject-First",
    visualCharacteristics: ["corner-anchored card", "neutral frosted/solid surface", "brand accent tick", "top-right brand chip"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "headline", required: true },
      { role: "supportingLine", required: false },
      { role: "cta", required: false },
      { role: "brandLabel", required: true },
    ],
    constraints: ["card never exceeds 56% of canvas width", "subject area above/right of the card must stay clear"],
  },
  EDITORIAL_FRAME: {
    id: "EDITORIAL_FRAME",
    name: "Editorial Frame",
    description: "A thin outer frame, a top-center brand lockup, and a compact rule-bracketed text stack -- the most restrained, magazine-like option.",
    bestUseHint: "Premium, understated brands that want restraint over a hard sell.",
    suggestedIndustries: ["salon", "clinic", "real_estate", "retail"],
    styleLabel: "Restrained & Editorial",
    visualCharacteristics: ["thin outer border", "centered brand lockup", "rule lines", "no scrim, no pill"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "brandLabel", required: true },
      { role: "headline", required: true },
      { role: "supportingLine", required: false },
      { role: "cta", required: false },
    ],
    constraints: ["no filled scrim rectangle", "CTA (if present) renders as underlined text, never a pill"],
  },
  MINIMAL_FOOTER_STRIP: {
    id: "MINIMAL_FOOTER_STRIP",
    name: "Minimal Footer Strip",
    description: "A full-bleed hero image with a very restrained bottom utility strip (~15% of the canvas) for brand identity and contact/CTA -- premium, luxury-adjacent.",
    bestUseHint: "A striking photo that needs almost no help, plus a discreet brand/contact line.",
    suggestedIndustries: ["real_estate", "retail", "salon", "restaurant"],
    styleLabel: "Full-Bleed Luxury",
    visualCharacteristics: ["full-bleed photo", "thin hairline top border on the strip", "single-line brand + contact"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "brandLabel", required: true },
      { role: "cta", required: false },
    ],
    constraints: ["strip never exceeds 18% of canvas height", "at most brand label + one short line -- no headline stack"],
  },
  ELEVATED_BADGE: {
    id: "ELEVATED_BADGE",
    name: "Elevated Badge",
    description: "Photo-dominant with an elevated promotional badge anchored to a safe corner -- supports the concept rather than overpowering it, avoiding a cheap flyer look.",
    bestUseHint: "A specific offer or highlight that deserves a badge, not a banner.",
    suggestedIndustries: ["retail", "restaurant", "gym"],
    styleLabel: "Photo-First Promo",
    visualCharacteristics: ["circular badge with soft drop shadow", "corner-anchored", "small brand chip elsewhere"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "headline", required: true },
      { role: "brandLabel", required: true },
      { role: "cta", required: false },
    ],
    constraints: ["badge diameter never exceeds 34% of canvas width", "badge text limited to a short headline, no supporting line inside it"],
  },
  DUAL_TONE_SIDEBAR: {
    id: "DUAL_TONE_SIDEBAR",
    name: "Dual Tone Sidebar",
    description: "A ~30% brand-color vertical sidebar against ~70% image -- strong asymmetrical composition with a deliberate, concise hierarchy.",
    bestUseHint: "Businesses with a strong brand color that want a confident, structured look.",
    suggestedIndustries: ["gym", "clinic", "real_estate", "local_service"],
    styleLabel: "Bold Asymmetry",
    visualCharacteristics: ["full-height sidebar", "vertical text stack", "accent divider"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "brandLabel", required: true },
      { role: "headline", required: true },
      { role: "supportingLine", required: false },
      { role: "cta", required: false },
    ],
    constraints: ["sidebar width targets 30% of canvas, grows if content needs more, capped at 42%"],
  },
  FROSTED_GLASS_CENTER: {
    id: "FROSTED_GLASS_CENTER",
    name: "Frosted Glass Center",
    description: "An atmospheric image with a centered translucent card -- controlled frost via layered opacity (not a real blur filter, which isn't reliably supported), strong contrast, minimal copy.",
    bestUseHint: "Atmospheric, moody photography where the message should feel embedded in the scene.",
    suggestedIndustries: ["restaurant", "salon", "gym", "real_estate"],
    styleLabel: "Contemporary Atmosphere",
    visualCharacteristics: ["centered card", "layered-opacity frost effect", "high text contrast"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "headline", required: true },
      { role: "cta", required: false },
      { role: "brandLabel", required: true },
    ],
    constraints: ["card stays vertically and horizontally centered", "no more than headline + CTA inside the card -- minimal copy by design"],
  },
  TYPOGRAPHIC_HERO: {
    id: "TYPOGRAPHIC_HERO",
    name: "Typographic Hero",
    description: "Typography is intentionally dominant, with the background photograph subdued behind a wash -- strong editorial type, very little supporting text, still a finished branded creative, not a text poster.",
    bestUseHint: "A single powerful line that deserves to be the whole creative.",
    suggestedIndustries: ["gym", "salon", "retail", "local_service"],
    styleLabel: "Bold Typography",
    visualCharacteristics: ["large dominant headline", "subdued photo wash", "minimal brand mark"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "headline", required: true },
      { role: "brandLabel", required: true },
      { role: "cta", required: false },
    ],
    constraints: ["headline font size is always the largest of any archetype", "at most one short supporting line, often none"],
  },
  POLAROID_LIFESTYLE: {
    id: "POLAROID_LIFESTYLE",
    name: "Polaroid Lifestyle",
    description: "A lifestyle/UGC-inspired photographic card treatment with a bottom polaroid margin carrying a caption-style line -- social-proof, editorial feeling, deterministic vector rendering only (no emoji, no host fonts).",
    bestUseHint: "Casual, authentic, lifestyle-forward brands -- cafes, studios, boutiques.",
    suggestedIndustries: ["restaurant", "salon", "retail", "gym"],
    styleLabel: "Lifestyle & Authentic",
    visualCharacteristics: ["white polaroid border", "bottom caption margin", "slight caption slant"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "supportingLine", required: true },
      { role: "brandLabel", required: true },
      { role: "cta", required: false },
    ],
    constraints: ["photo area is inset by a real white border on all sides", "caption line lives only in the bottom margin, never over the photo"],
  },
  CLINICAL_TRUST: {
    id: "CLINICAL_TRUST",
    name: "Clinical Trust",
    description: "Healthcare-safe visual language: white/clean borders, restrained blue/green accents, calm hierarchy, high readability -- never an exaggerated claim.",
    bestUseHint: "Clinics, healthcare, and any business where trust and calm matter more than energy.",
    suggestedIndustries: ["clinic"],
    styleLabel: "Calm & Trustworthy",
    visualCharacteristics: ["white/light band", "restrained blue or green accent line", "generous whitespace"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "brandLabel", required: true },
      { role: "headline", required: true },
      { role: "supportingLine", required: false },
      { role: "cta", required: false },
    ],
    constraints: ["band fill is always light (white/near-white), never the photo's own dark tones", "no more than one accent color used at once"],
  },
  NEON_NIGHTLIFE: {
    id: "NEON_NIGHTLIFE",
    name: "Neon Nightlife",
    description: "A dark environment with controlled glow in the brand's accent color -- energetic, suited to nightlife/gym/restobar contexts, glow simulated via layered shapes (never a filter effect, which isn't reliably supported in this rasterizer).",
    bestUseHint: "Nightlife, gyms, restobars -- anything that wants energy without losing legibility.",
    suggestedIndustries: ["gym", "restaurant", "local_service"],
    styleLabel: "Energetic & Dark",
    visualCharacteristics: ["dark scrim", "glow-simulated accent text/lines", "high-contrast CTA"],
    allowedTiers: ["growth", "business"],
    defaultTextHierarchy: [
      { role: "headline", required: true },
      { role: "cta", required: false },
      { role: "brandLabel", required: true },
    ],
    constraints: ["base text color stays white/near-white for legibility even with the glow effect", "glow is simulated with layered opacity, never assumes filter support"],
  },
};

export function isValidArchetype(value: unknown): value is LayoutArchetype {
  return typeof value === "string" && (ARCHETYPE_IDS as readonly string[]).includes(value);
}

export function getArchetypeDefinition(id: LayoutArchetype): ArchetypeDefinition {
  return ARCHETYPE_REGISTRY[id];
}

/** Archetypes a given tier may ever use -- NOT the same as a specific
 * tenant's saved preferences (archetype-routing.ts's job). */
export function archetypesForTier(tier: ArchetypeTier): LayoutArchetype[] {
  return ARCHETYPE_IDS.filter((id) => ARCHETYPE_REGISTRY[id].allowedTiers.includes(tier));
}
