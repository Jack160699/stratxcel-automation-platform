/**
 * Creative-Direction Engine (build brief Section 9): the system must not go
 * directly from business -> caption. This module builds the structured
 * brief that sits between them, consumed by BOTH the copy-generation
 * prompt and (Phase J) the visual rendering contract -- so a restaurant and
 * a clinic get materially different concepts, visual direction, and hook
 * style, not the same template with the business name swapped in.
 *
 * Pure and deterministic: given the same inputs, always the same brief.
 * No AI call, no I/O -- callers gather brand/business/history data and
 * pass it in (package-autopilot.ts does this via getBoundBrandProfile,
 * buildVerifiedBusinessInformation, and recent-queue-item lookups).
 */

import type { ContentObjective } from "./content-options.ts";
import { classifyIndustry, getIndustryProfile, type IndustryCategory } from "./industry-taxonomy.ts";
import { selectLeastRecentlyUsed, selectLeastRecentlyUsedExcluding } from "./content-diversity.ts";
import type { PlannedDayStrategy } from "./campaign-strategy-planner.ts";

const OBJECTIVE_CTA_STYLE: Record<ContentObjective, string> = {
  REACH: "an invitation to see or discover more, not a hard sell",
  ENGAGEMENT: "an invitation to comment, react, or share an opinion",
  FOLLOWERS: "an invitation to follow for more like this",
  TRAFFIC: "an invitation to visit the website or linked page",
  LEADS: "an invitation to enquire, get in touch, or request more information",
  SALES: "an invitation to buy, book, or order now",
  AUTHORITY: "an invitation to learn more or read further, establishing expertise",
  COMMUNITY: "an invitation to be part of the community or event",
  RETENTION: "an invitation for existing customers to come back or re-engage",
};

export interface CreativeBriefInput {
  businessName: string;
  industryText: string | null;
  descriptionText?: string | null;
  platform: string;
  mediaType: "text" | "image" | "carousel" | "reel" | "video";
  /** Content pillars saved in Brand Brain -- the ONLY valid values for contentPillar. */
  availablePillars: string[];
  recentPillars?: string[];
  recentConcepts?: string[];
  /** Mission D+ Sections 10/11/26-28: real, empirically-confirmed gap --
   * recentConcepts alone kept the categorical topic varied (customer story
   * vs. product spotlight vs. behind-the-scenes), but the ACTUAL SENTENCES
   * describing the business's own flagship product still converged on
   * near-identical phrasing across posts with completely different
   * concepts (checkRepetition's post-hoc whole-caption Jaccard check
   * doesn't reliably catch a single repeated sentence buried in an
   * otherwise-different caption). Feeding the model actual recent phrasing
   * to explicitly avoid, not just a topic label, fixes the repetition at
   * its source instead of only rejecting it after generation. */
  recentCaptionExcerpts?: string[];
  /** Mission F Section 3/4/7 (recovery policy): concepts/pillars already
   * REJECTED for this exact queue item on an earlier attempt -- unlike
   * recentPillars/recentConcepts (soft, campaign-wide recency weighting),
   * these are hard-excluded from selection. A cross-pass retry must
   * genuinely change the angle, not just be nudged away from it. */
  excludeConcepts?: string[];
  excludePillars?: string[];
  /** Mission F Section 4/6: the actual reason(s) a previous attempt on this
   * exact item failed (e.g. "DUPLICATE_CONCEPT", "WEAK_CTA") -- surfaced as
   * an explicit, diagnosable instruction rather than left for the model to
   * rediscover the same mistake. */
  recentFailureContext?: string[];
  objective: ContentObjective;
  verifiedFacts: string[];
  brandTone?: string[];
  brandColors?: string[];
  /** From brandProfile.audiences / verified target_audience fact, in that preference order. */
  audience?: string | null;
  /** Hermes-Orchestrated Content Engine Hardening mission Section 2: a
   * real, deterministic upcoming-festival/season line (festival-
   * calendar.ts's seasonalContextLine, keyed to this specific post's
   * scheduled date) -- optional flavor context the model may use IF
   * genuinely relevant, never a fact to force into every post. Never
   * fabricated: the calendar module itself only ever returns a verified
   * date or nothing. */
  seasonalContext?: string | null;
  /** 28-day campaign strategy blueprint for this specific day (Mission G §8-§9). */
  plannedStrategy?: PlannedDayStrategy | null;
}

export interface CreativeBrief {
  objective: ContentObjective;
  audience: string;
  industry: IndustryCategory;
  contentPillar: string;
  concept: string;
  format: string;
  hook: string;
  headlineDirection: string;
  supportingCopyDirection: string;
  verifiedFacts: string[];
  cta: string;
  visualDirection: string;
  imageryDirection: string;
  layoutDirection: string;
  brandDirection: string;
  avoid: string[];
  seasonalContext: string | null;
  plannedStrategy?: PlannedDayStrategy | null;
}

const FORMAT_LABEL: Record<CreativeBriefInput["mediaType"], string> = {
  text: "text-only update",
  image: "single image post",
  carousel: "multi-image carousel post",
  reel: "short-form vertical video (reel)",
  video: "video post",
};

const HOOK_STYLE_BY_OBJECTIVE: Record<ContentObjective, string> = {
  REACH: "open with a broadly relatable observation or question that earns attention in the first line",
  ENGAGEMENT: "open with a question or opinion that invites a reply",
  FOLLOWERS: "open with a reason this account is worth following, shown not claimed",
  TRAFFIC: "open with a specific reason to click through, not a vague teaser",
  LEADS: "open with the specific problem this business solves for the reader",
  SALES: "open with the specific outcome or benefit, not a generic discount tease",
  AUTHORITY: "open with a genuinely useful fact or tip that demonstrates expertise",
  COMMUNITY: "open with something that signals belonging or shared identity",
  RETENTION: "open with a reason for an existing customer to think of this business again",
};

const OFFER_AWARE_OBJECTIVES: ContentObjective[] = ["SALES", "TRAFFIC", "ENGAGEMENT", "LEADS", "AUTHORITY", "COMMUNITY"];
const STANDARD_OBJECTIVES: ContentObjective[] = ["ENGAGEMENT", "AUTHORITY", "TRAFFIC", "COMMUNITY", "LEADS"];

/** Deterministic objective selection, diversity-aware like pillar/concept
 * selection: SALES only enters rotation when a real offer/priority-selling
 * point exists in verified facts (never assumed) -- otherwise the rotation
 * favors engagement/authority/community, which are always safe defaults. */
export function selectObjective(input: { hasOffer: boolean; recentObjectives?: ContentObjective[]; excludeObjectives?: ContentObjective[] }): ContentObjective {
  const candidates = input.hasOffer ? OFFER_AWARE_OBJECTIVES : STANDARD_OBJECTIVES;
  // Mission F Section 4 (WEAK_CTA recovery): "re-evaluate the intended
  // customer action... the CTA must match the content objective" -- a hard
  // exclusion, not just recency weighting, so a retry specifically staged
  // to fix a weak CTA is guaranteed a genuinely different objective (and
  // therefore a genuinely different CTA style -- see OBJECTIVE_CTA_STYLE).
  return input.excludeObjectives?.length
    ? selectLeastRecentlyUsedExcluding(candidates, input.recentObjectives ?? [], input.excludeObjectives)
    : selectLeastRecentlyUsed(candidates, input.recentObjectives ?? []);
}

export function buildCreativeBrief(input: CreativeBriefInput): CreativeBrief {
  if (!input.availablePillars.length) throw new Error("buildCreativeBrief: no saved content pillars available");

  const industry = classifyIndustry(input.industryText, input.descriptionText);
  const profile = getIndustryProfile(industry);

  const planned = input.plannedStrategy;
  const contentPillar = planned?.contentPillar || (input.excludePillars?.length
    ? selectLeastRecentlyUsedExcluding(input.availablePillars, input.recentPillars ?? [], input.excludePillars)
    : selectLeastRecentlyUsed(input.availablePillars, input.recentPillars ?? []));

  const recentConcepts = input.recentConcepts ?? [];
  const concept = planned?.creativeConcept || (input.excludeConcepts?.length
    ? selectLeastRecentlyUsedExcluding(profile.concepts, recentConcepts, input.excludeConcepts)
    : selectLeastRecentlyUsed(profile.concepts, recentConcepts));

  const audience = input.audience?.trim() || "the business's real customers -- not a generic demographic";
  const cta = planned?.ctaStrategy || `${OBJECTIVE_CTA_STYLE[input.objective]}, in the style of ${profile.ctaStyle}`;
  const hook = planned?.hookStrategy || HOOK_STYLE_BY_OBJECTIVE[input.objective];

  const recentCaptionExcerpts = input.recentCaptionExcerpts ?? [];

  const avoid = [
    "generic marketing filler (\"AI-powered\", \"automated\", \"data-driven\", \"end-to-end\", \"we grow your business\", \"experience excellence\", \"quality you can trust\", \"contact us today\", \"don't miss out\")",
    "any specific address, phone number, discount, price, rating, review count, opening hours, or guarantee not present in verifiedFacts",
    "placeholder or template scaffolding of any kind",
    ...recentConcepts.slice(0, 3).map((used) => `the "${used}" concept (used recently -- pick a genuinely different angle)`),
    // Section 10/11/26-28: phrase-level repetition, not just topic
    // repetition -- a genuinely different concept can still restate the
    // business in the same sentence. Truncated so a handful of recent posts
    // don't dominate the prompt; enough to recognize and avoid the pattern,
    // not a full transcript.
    ...recentCaptionExcerpts.slice(0, 3).map(
      (text) => `reusing this exact phrasing/sentence structure from a recent post -- describe things in a genuinely different way: "${text.slice(0, 160).trim()}${text.length > 160 ? "…" : ""}"`
    ),
    // Mission F Section 4/7: a hard recovery-retry exclusion, named
    // explicitly and diagnosably -- not folded silently into the generic
    // "used recently" framing above, so the model (and any human reading
    // the prompt later) can tell a genuine past REJECTION apart from
    // ordinary rotation.
    ...(input.excludeConcepts?.length ? [`the following concept(s), already rejected for this exact post on a previous attempt -- do not return to them, even reworded: ${input.excludeConcepts.join("; ")}`] : []),
    ...(input.excludePillars?.length ? [`the following content pillar(s), already rejected for this exact post on a previous attempt: ${input.excludePillars.join("; ")}`] : []),
    ...(input.recentFailureContext?.length ? [`repeating the same mistake that got a previous attempt at this exact post rejected: ${input.recentFailureContext.join("; ")}`] : []),
  ];

  return {
    objective: input.objective,
    audience,
    industry,
    contentPillar,
    concept,
    format: FORMAT_LABEL[input.mediaType],
    hook,
    headlineDirection: planned
      ? `A short, punchy headline specifically about: "${planned.topic}" — ${planned.uniqueAngle}. Never a generic label.`
      : `A short, specific headline for the "${concept}" angle -- name the actual thing (dish, service, product, offer, tip), never a generic label.`,
    supportingCopyDirection: planned
      ? `1-3 sentences resolving customer problem: "${planned.customerProblem}". Make the "${contentPillar}" pillar concrete for ${input.businessName}, drawing on verifiedFacts where naturally relevant.`
      : `1-3 sentences that make the "${contentPillar}" pillar concrete for ${input.businessName} specifically, using verifiedFacts where naturally relevant. No invented specifics.`,
    verifiedFacts: input.verifiedFacts,
    cta,
    visualDirection: profile.visualStyle,
    imageryDirection: `Imagery must depict ${input.businessName}'s actual ${industry === "generic" ? "product, service, or team" : industry.replace("_", " ")} context -- never unrelated stock photography.`,
    layoutDirection: input.mediaType === "text"
      ? "No visual layout required for a text-only update."
      : "Clear single focal point, headline legible at thumbnail size, minimal on-image text (photograph carries the story).",
    brandDirection: [
      input.brandTone?.length ? `Tone: ${input.brandTone.join(", ")}.` : "",
      input.brandColors?.length ? `Brand colors: ${input.brandColors.join(", ")}.` : "",
    ].filter(Boolean).join(" ") || "No explicit brand voice/colors saved yet -- default to a clean, professional, business-appropriate presentation.",
    seasonalContext: input.seasonalContext?.trim() || null,
    plannedStrategy: input.plannedStrategy,
    avoid,
  };
}

/** Serializes a CreativeBrief into the exact block handed to the AI
 * provider as part of the copy-generation prompt. Kept separate from
 * buildCreativeBrief so the brief object itself stays testable independent
 * of prompt string formatting. */
export function formatCreativeBriefForPrompt(brief: CreativeBrief): string {
  const p = brief.plannedStrategy;
  return [
    `CREATIVE BRIEF (already decided -- follow it, do not re-derive strategy):`,
    `- Objective: ${brief.objective}`,
    `- Audience: ${brief.audience}`,
    `- Content pillar: ${brief.contentPillar}`,
    `- Creative concept: ${brief.concept}`,
    p ? `- Unique strategic angle: ${p.uniqueAngle}` : "",
    p ? `- Customer problem addressed: ${p.customerProblem}` : "",
    p ? `- Research insight: ${p.researchInsight}` : "",
    `- Format: ${brief.format}`,
    `- Hook direction: ${brief.hook}`,
    `- Headline direction: ${brief.headlineDirection}`,
    `- Supporting copy direction: ${brief.supportingCopyDirection}`,
    `- CTA direction: ${brief.cta}`,
    brief.verifiedFacts.length ? `- Verified business facts available to use: ${brief.verifiedFacts.join("; ")}` : "- No additional verified business facts available for this post.",
    `- Avoid: ${brief.avoid.join("; ")}`,
    brief.verifiedFacts.length
      ? `- MUST: naturally mention the business's actual name at least once (caption or hashtags), and concretely reference at least one of the verified facts above by its specific detail -- not just in spirit.`
      : `- MUST: naturally mention the business's actual name at least once (caption or hashtags).`,
    `- MUST: naturally reflect the brand tone described in the brand direction below -- ideally using one of its actual descriptive words where it fits, not just a generic approximation of that mood.`,
    `- Brand direction: ${brief.brandDirection}`,
    brief.seasonalContext
      ? `- ${brief.seasonalContext} Reference this ONLY if it genuinely fits this business and concept -- never force a festival/season tie-in onto unrelated content.`
      : "",
    `- OMISSION PRINCIPLE: premium copy comes from knowing what NOT to include. Write the shortest version that is still specific and complete -- if a sentence, clause, or adjective doesn't add a real, concrete detail, cut it rather than pad the caption with it.`,
    `- HARD ANTI-TEMPLATE RULE: Strictly forbid AI/marketing filler ("AI-powered", "data-driven", "automated", "end-to-end", "we grow your business", "running while you rest", "elevate your experience", "discover the magic", "unleash your potential"). Every claim must be a specific, concrete detail about THIS business.`,
  ].filter(Boolean).join("\n");
}
