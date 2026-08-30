/**
 * Unify Creative Studio With The Premium Autopilot Pipeline -- Module 2.
 *
 * Creative Studio (app/app/content/studio) previously handed the image
 * provider nothing but the user's raw brief string plus a flat brand-context
 * snapshot (buildProviderReadyImagePrompt) -- no real creative-intelligence
 * step, exactly the "business -> caption/image directly" pattern
 * creative-treatment.ts's own header calls out as the thing Premium
 * Creative Intelligence exists to replace. package-autopilot.ts already
 * runs this step for the fully-automated pipeline (business facts -> brand
 * visual DNA -> industry visual vocabulary -> a real structured
 * CreativeTreatment via Gemini); this module runs the same step for a
 * human-authored Studio brief.
 *
 * The one deliberate difference from package-autopilot.ts: an automated
 * post invents its own topic (buildCreativeBrief's deterministic
 * least-recently-used concept rotation, drawn from a fixed per-industry
 * label pool) because nothing else has decided what to post about yet. A
 * Studio user has already decided -- their brief IS the concept angle to
 * develop, not a category label to replace. buildCreativeBrief is still
 * used for everything else it computes well (objective-aware CTA style,
 * audience, brand direction, content-pillar bookkeeping), but its rotated
 * `concept` is overwritten with the user's real brief before the treatment
 * prompt is built.
 *
 * Strictly non-blocking (Premium Creative Intelligence brief Section 28: "a
 * failed intelligence-layer call must never break the pipeline"): any
 * failure here -- no configured provider, a malformed/generic AI response,
 * a Brand Brain lookup error -- returns null, and the caller falls back to
 * exactly today's brief-only generation. Never throws.
 *
 * Also restricts the treatment's layoutArchetype to the two archetypes
 * (BASIC_ESSENTIAL, FLOATING_CARD) whose compositor implementation places
 * the tenant's real raster logo image -- see STUDIO_ARCHETYPE_ROUTING
 * below. Without this, a Creative Studio job could legitimately resolve a
 * valid treatment, run the real compositor, and still end up with no real
 * logo graphic on the finished creative (only the business name as text),
 * because 10 of the 12 registered archetypes don't place one yet.
 */
import { getCurrentBrandBrain, getCanonicalBrandContext } from "@stratxcel/brand-brain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveConfiguredProvider } from "./agent/provider.ts";
import { buildCreativeBrief, type CreativeBrief } from "./creative-brief.ts";
import {
  buildCreativeTreatmentPrompt,
  validateCreativeTreatment,
  safeParseJson,
  type ArchetypeRoutingContext,
  type CreativeTreatment,
} from "./creative-treatment.ts";
import { deriveBrandVisualDNA } from "./brand-visual-dna.ts";
import { getIndustryVisualVocabulary } from "./industry-visual-vocabulary.ts";
import { researchInsightsForIndustry } from "./visual-research-library.ts";
import type { ContentObjective } from "./content-options.ts";

/** Creative Studio has no objective picker of its own -- `intendedUse` is
 * the closest real signal for what the treatment's CTA style/hook should
 * lean toward. Deliberately NOT a rotation (selectObjective) -- there is no
 * "recent objectives" history to rotate against for a one-off manual
 * generation, so a stable, honest mapping is used instead. */
const INTENDED_USE_OBJECTIVE: Record<string, ContentObjective> = {
  social_post: "ENGAGEMENT",
  campaign: "TRAFFIC",
  ad_creative: "SALES",
  website: "TRAFFIC",
  general: "AUTHORITY",
};

/** Real, current, honest scope limit of the deterministic compositor
 * (text-overlay-render.ts's own header comment on `logoImage`/
 * `logoVariants`): of the 12 registered layout archetypes, only
 * BASIC_ESSENTIAL and FLOATING_CARD actually place the tenant's real
 * raster logo image today -- every other archetype falls back to a
 * text-glyph rendering of the business NAME instead of the actual logo
 * graphic. Creative Studio's whole point (per this mission) is that the
 * real BrandBrain logo appears on the finished creative, so its treatment
 * is restricted to only these two archetypes until the rest are wired --
 * NOT left free to pick one where the real logo silently can't appear.
 * This is a routingContext exactly like archetype-routing.ts builds for
 * Social Autopilot, just for a different reason (compositor capability,
 * not subscription tier) -- validateCreativeTreatment enforces it the same
 * way regardless of why it was built. */
const STUDIO_ARCHETYPE_ROUTING: ArchetypeRoutingContext = {
  forcedArchetype: null,
  allowedArchetypes: ["BASIC_ESSENTIAL", "FLOATING_CARD"],
  reason: "Creative Studio restricts to the two layout archetypes whose compositor implementation places the tenant's real logo image today -- see text-overlay-render.ts.",
};

/** Brand rules ("things missions must never do or say") are real grounding
 * context for the AI, but they are constraints, not facts -- Section 10
 * requires keeping them out of the canonical verifiedFacts list itself
 * (buildVerifiedFacts), so they're appended separately here into the same
 * businessInformation bucket the provider call already sends. */
function buildRuleConstraints(content: Record<string, unknown>): string[] {
  const rules = Array.isArray(content.rules) ? content.rules : [];
  return rules.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => `Brand rule (must follow): ${r.trim()}`);
}

export async function generateStudioCreativeTreatment(args: {
  writeClient: SupabaseClient;
  tenantId: string;
  brief: string;
  intendedUse: string;
  styleDirection?: string | null;
}): Promise<CreativeTreatment | null> {
  try {
    const provider = resolveConfiguredProvider();
    if (!provider) return null;

    const brandBrain = await getCurrentBrandBrain(args.writeClient as never, args.tenantId);
    const content = (brandBrain?.content ?? {}) as Record<string, unknown>;
    // Single source of truth (Brand Brain Final UX + Data + Save System
    // Section 7): business identity, services (canonical `services`, with
    // the legacy `products` fallback), and verified facts all come from
    // the one shared canonical snapshot instead of this file hand-picking
    // raw content fields -- the exact same helper every other real
    // consumer (image-generation, the workforce brand-context compiler,
    // Social Autopilot) now uses.
    const canonical = getCanonicalBrandContext(brandBrain?.content);
    const businessName = canonical.businessName;
    const industryText = canonical.industry;
    const brandTone = canonical.toneOfVoice ? canonical.toneOfVoice.split(/,\s*/).filter(Boolean) : [];
    const brandColors = canonical.colors;
    const audience = canonical.targetAudience;
    const pillars = Array.isArray(content.pillars)
      ? content.pillars.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : [];
    const verifiedFacts = [...canonical.verifiedFacts, ...buildRuleConstraints(content)];
    const objective = INTENDED_USE_OBJECTIVE[args.intendedUse] ?? "ENGAGEMENT";

    const brief: CreativeBrief = buildCreativeBrief({
      businessName,
      industryText,
      descriptionText: null,
      platform: "social",
      mediaType: "image",
      // buildCreativeBrief throws with zero pillars -- a tenant with no
      // saved content pillars yet still gets a real treatment, just without
      // pillar-specific rotation bookkeeping.
      availablePillars: pillars.length ? pillars : ["General"],
      objective,
      verifiedFacts,
      brandTone,
      brandColors,
      audience,
    });
    // The user's own request IS the concept for Creative Studio -- see this
    // file's header. Folds in the optional creative-direction field too, so
    // the treatment model sees the full manual intent in one angle.
    const concept = args.styleDirection?.trim()
      ? `${args.brief.trim()} (creative direction: ${args.styleDirection.trim()})`
      : args.brief.trim();
    const studioBrief: CreativeBrief = { ...brief, concept };

    const brandDNA = deriveBrandVisualDNA({ brandColors, brandTone, industryCategory: studioBrief.industry });
    const visualVocab = getIndustryVisualVocabulary(studioBrief.industry);
    const researchInsights = researchInsightsForIndustry(studioBrief.industry === "generic" ? "all" : studioBrief.industry);

    const messages = buildCreativeTreatmentPrompt({
      brief: studioBrief,
      businessName,
      industry: studioBrief.industry,
      brandDNA,
      visualVocab,
      mediaType: "image",
      researchInsights,
      routingContext: STUDIO_ARCHETYPE_ROUTING,
    });
    // Same provider-call convention as package-autopilot.ts's own treatment
    // step: AIMessage's role union is broader than AgentTurnMessage's, but
    // buildCreativeTreatmentPrompt only ever emits "system"/"user".
    const result = await provider.complete(
      messages.map((m) => ({ role: m.role, content: m.content })) as unknown as Parameters<typeof provider.complete>[0],
      [],
      { brandInstructions: [], tenantId: args.tenantId, businessInformation: verifiedFacts },
    );
    const parsed = safeParseJson(result.text);
    const issues = validateCreativeTreatment(parsed, { concept: studioBrief.concept, routingContext: STUDIO_ARCHETYPE_ROUTING, industry: studioBrief.industry });
    if (issues.length) return null;
    return parsed as CreativeTreatment;
  } catch {
    // Never blocks a manual Studio generation -- see file header.
    return null;
  }
}
