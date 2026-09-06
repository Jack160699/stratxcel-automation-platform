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
 * Also restricts the treatment's layoutArchetype to the three archetypes
 * (BASIC_ESSENTIAL, FLOATING_CARD, FEATURE_POSTER) whose compositor
 * implementation places the tenant's real raster logo image -- see
 * STUDIO_ARCHETYPE_ROUTING below. Without this, a Creative Studio job
 * could legitimately resolve a valid treatment, run the real compositor,
 * and still end up with no real logo graphic on the finished creative
 * (only the business name as text), because 10 of the 13 registered
 * archetypes don't place one yet.
 */
import { getCurrentBrandBrain, getCanonicalBrandContext } from "@stratxcel/brand-brain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveConfiguredProvider } from "./agent/provider.ts";
import { buildCreativeBrief, type CreativeBrief } from "./creative-brief.ts";
import {
  buildCreativeTreatmentPrompt,
  validateCreativeTreatment,
  safeParseJson,
  forceArchetypeOntoTreatment,
  describeCompositionShape,
  describeTextStructureShape,
  type ArchetypeRoutingContext,
  type CreativeTreatment,
} from "./creative-treatment.ts";
import { deriveBrandVisualDNA } from "./brand-visual-dna.ts";
import { getIndustryVisualVocabulary } from "./industry-visual-vocabulary.ts";
import { researchInsightsForIndustry } from "./visual-research-library.ts";
import { buildCustomerPsychologyProfile } from "../hermes/social-autopilot-campaign.ts";
import type { OnImageTextElement } from "./text-density.ts";
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
 * `logoVariants`): of the 13 registered layout archetypes, only
 * BASIC_ESSENTIAL, FLOATING_CARD, and FEATURE_POSTER (added by the Image
 * Quality + Marketing Creative Certification mission, 2026-09-06) actually
 * place the tenant's real raster logo image today -- every other archetype
 * falls back to a text-glyph rendering of the business NAME instead of the
 * actual logo graphic. Creative Studio's whole point (per this mission) is
 * that the real BrandBrain logo appears on the finished creative, so its
 * treatment is restricted to only these three archetypes until the rest
 * are wired -- NOT left free to pick one where the real logo silently
 * can't appear. This is a routingContext exactly like archetype-routing.ts
 * builds for Social Autopilot, just for a different reason (compositor
 * capability, not subscription tier) -- validateCreativeTreatment enforces
 * it the same way regardless of why it was built. */
const STUDIO_ARCHETYPE_ROUTING: ArchetypeRoutingContext = {
  forcedArchetype: null,
  allowedArchetypes: ["BASIC_ESSENTIAL", "FLOATING_CARD", "FEATURE_POSTER"],
  reason: "Creative Studio restricts to the layout archetypes whose compositor implementation places the tenant's real logo image today -- see text-overlay-render.ts.",
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

/**
 * Shared implementation behind both generateStudioCreativeTreatment and
 * generateManualArchetypeCreativeTreatment below -- the only real
 * difference between "a Creative Studio brief" and "a Social Autopilot
 * manual-generation brief" is which routingContext constrains the
 * archetype choice (compositor logo capability vs. a specific tier/
 * preference-authorized archetype the tenant already picked); everything
 * else (brand facts, brief construction, the provider call, validation)
 * is identical, so it lives in exactly one place.
 */
async function generateCreativeTreatmentWithRouting(
  args: { writeClient: SupabaseClient; tenantId: string; brief: string; intendedUse: string; styleDirection?: string | null },
  routingContext: ArchetypeRoutingContext,
): Promise<CreativeTreatment | null> {
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

    // FINAL HERMES ROOT-CAUSE + STRATEGY RESTORATION mission (2026-09-06):
    // real orchestration-divergence bug found live -- package-autopilot.ts's
    // automated pipeline reads structured per-audience pain-point data from
    // social_brand_profiles.audiences (via getBoundBrandProfile), but this
    // manual/Studio path only ever read the canonical brand_brains schema,
    // which has no structured audience array at all (only a flat
    // target_audience string) -- so a manual generation never had access to
    // this real signal even when it existed. Real, best-effort read of the
    // SAME table the automated path uses; a tenant with no
    // social_brand_profiles row (the common case for a brand_brains-only
    // tenant -- see brandBrainFallbackProfile's own documented gap in
    // repositories/brand.ts) degrades to a single unnamed audience wrapping
    // the flat target_audience string, with no fabricated pain points --
    // never a crash, never invented psychology.
    const { data: brandProfileRow } = await args.writeClient
      .from("social_brand_profiles")
      .select("audiences")
      .eq("tenant_id", args.tenantId)
      .maybeSingle();
    const rawAudiences = Array.isArray(brandProfileRow?.audiences) && brandProfileRow.audiences.length
      ? (brandProfileRow.audiences as Array<{ name: string; description?: string; pain_points?: unknown }>)
      : audience ? [{ name: "Primary audience", description: audience }] : [];
    const customerPsychology = buildCustomerPsychologyProfile(rawAudiences);

    // FINAL HERMES ROOT-CAUSE mission, round 2 (2026-09-06): real bug
    // found live -- two back-to-back real generations for two DIFFERENT
    // businesses both independently converged on the model's own default
    // "question+answer" shape, since nothing tracked which shape this
    // tenant's own recent creatives already used (concept/pillar/
    // archetype diversity already exist for the automated pipeline; this
    // path had none at all). Real, best-effort read of this tenant's own
    // last few FEATURE_POSTER treatments -- never blocks generation if it
    // fails or finds nothing.
    let recentTextStructures: string[] = [];
    // FINAL HERMES -- RESTORE TRUE MARKETING CREATIVE GENERATION
    // (2026-09-06): the same read now also collects the recent AD DESIGNS
    // (canvas + block sequence), which is what actually repeated when two
    // different objectives for the same business came back as the same
    // creative -- see describeCompositionShape.
    let recentCompositions: string[] = [];
    try {
      const { data: recentJobs } = await args.writeClient
        .from("image_generation_jobs")
        .select("creative_treatment")
        .eq("tenant_id", args.tenantId)
        .not("creative_treatment", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);
      const treatments = (recentJobs ?? [])
        .map((row) => (row as { creative_treatment?: unknown }).creative_treatment as { layoutArchetype?: unknown; textHierarchy?: unknown; adComposition?: unknown } | null)
        .filter((t): t is { layoutArchetype?: unknown; textHierarchy?: unknown; adComposition?: unknown } => Boolean(t));
      recentTextStructures = treatments
        .filter((t) => t.layoutArchetype === "FEATURE_POSTER" && Array.isArray(t.textHierarchy))
        .map((t) => describeTextStructureShape(t.textHierarchy as OnImageTextElement[]));
      recentCompositions = [...new Set(treatments.map((t) => describeCompositionShape(t.adComposition)).filter((s): s is string => Boolean(s)))];
    } catch {
      // Diversity is a real-quality signal, never a hard dependency --
      // generation must still proceed without it.
    }

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
      customerPsychology,
    });
    // The user's own request IS the concept -- see this file's header.
    // Folds in the optional creative-direction field too, so the treatment
    // model sees the full manual intent in one angle.
    const concept = args.styleDirection?.trim()
      ? `${args.brief.trim()} (creative direction: ${args.styleDirection.trim()})`
      : args.brief.trim();
    const manualBrief: CreativeBrief = { ...brief, concept };

    const brandDNA = deriveBrandVisualDNA({ brandColors, brandTone, industryCategory: manualBrief.industry });
    const visualVocab = getIndustryVisualVocabulary(manualBrief.industry);
    const researchInsights = researchInsightsForIndustry(manualBrief.industry === "generic" ? "all" : manualBrief.industry);

    const messages = buildCreativeTreatmentPrompt({
      brief: manualBrief,
      businessName,
      industry: manualBrief.industry,
      brandDNA,
      visualVocab,
      mediaType: "image",
      researchInsights,
      routingContext,
      recentTextStructures,
      recentCompositions,
      creativeFormat: manualBrief.creativeFormat,
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
    const issues = validateCreativeTreatment(parsed, { concept: manualBrief.concept, routingContext, industry: manualBrief.industry, creativeFormat: manualBrief.creativeFormat });
    if (issues.length) return null;
    // Belt-and-suspenders: forces the routingContext's own decision onto
    // the parsed treatment before returning it, exactly like
    // package-autopilot.ts's real treatment step does -- validation above
    // already rejects a mismatched archetype outright, but forcing it here
    // too means a future validation relaxation could never silently let an
    // AI-chosen substitute slip past the caller's actual authorization.
    return forceArchetypeOntoTreatment(parsed as CreativeTreatment, routingContext);
  } catch {
    // Never blocks a manual generation -- see file header.
    return null;
  }
}

export async function generateStudioCreativeTreatment(args: {
  writeClient: SupabaseClient;
  tenantId: string;
  brief: string;
  intendedUse: string;
  styleDirection?: string | null;
}): Promise<CreativeTreatment | null> {
  return generateCreativeTreatmentWithRouting(args, STUDIO_ARCHETYPE_ROUTING);
}

/**
 * StratXcel Marketing Creative Engine mission (2026-09-06): the Social
 * Autopilot "Generate post" panel (app/api/platform/social/autopilot/
 * manual-generate/route.ts) called createImageGenerationJob with
 * requestedArchetype but no `treatment` -- the exact bug this codebase
 * already found and fixed once for Creative Studio (see this file's
 * header and app/api/platform/image-generations/route.ts's own comment on
 * the same defect). With no treatment, processImageGenerationJob never
 * builds an overlayContext, so the deterministic text-overlay-render.ts
 * compositor never runs: every "manual generation" post -- regardless of
 * which archetype the tenant picked -- persisted as a bare AI photo with
 * no headline, no CTA, no logo, and (for FEATURE_POSTER specifically) no
 * differentiator list at all. Confirmed live on a real Metro Wheels Car
 * Rentals FEATURE_POSTER request before this fix. `forcedArchetype` here
 * is always the archetype resolveManualRouting has ALREADY authorized for
 * this exact tenant (tier + saved preferences) -- this function only
 * decides what the AI is told to build toward; createImageGenerationJob's
 * own resolveManualRouting call remains the real, independent
 * authorization check regardless of what this returns.
 */
export async function generateManualArchetypeCreativeTreatment(args: {
  writeClient: SupabaseClient;
  tenantId: string;
  brief: string;
  forcedArchetype: CreativeTreatment["layoutArchetype"];
}): Promise<CreativeTreatment | null> {
  const routingContext: ArchetypeRoutingContext = {
    forcedArchetype: args.forcedArchetype,
    allowedArchetypes: [],
    reason: "Social Autopilot manual generation: the tenant explicitly chose this visual style, already authorized by resolveManualRouting.",
  };
  return generateCreativeTreatmentWithRouting({ writeClient: args.writeClient, tenantId: args.tenantId, brief: args.brief, intendedUse: "social_post" }, routingContext);
}
