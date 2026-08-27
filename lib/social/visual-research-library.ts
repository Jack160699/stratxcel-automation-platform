/**
 * Visual research library (Premium Creative Intelligence brief Sections 3,
 * 16): real, sourced findings from live web research conducted for this
 * campaign (August 2026), distilled into qualitative creative principles
 * -- never performance numbers presented as verified fact. Several source
 * pages cited specific multipliers (e.g. "carousels get 9x more saves",
 * "video ads get 10-15x higher engagement"); those come from marketing
 * blogs and ad agencies, not platform-official data, so they are recorded
 * here as REPORTED CLAIMS (see `reportedClaims` on the relevant entries)
 * and are never injected into a generation prompt as if verified -- only
 * the qualitative, cross-source-corroborated directional patterns below
 * feed into Creative Treatment generation (creative-treatment.ts).
 *
 * Each entry: source, date, industry (or "all"), pattern, why it works,
 * what must NOT be copied. Never copy another brand's actual creative --
 * extract the principle, then create original work per the business's own
 * facts and brand DNA.
 */

export interface ResearchLibraryEntry {
  source: string;
  url: string;
  dateAccessed: string;
  industry: "all" | "restaurant" | "salon" | "gym" | "clinic" | "retail" | "real_estate" | "local_service";
  pattern: string;
  whyItWorks: string;
  whatNotToCopy: string;
  reportedClaims?: string;
}

export const VISUAL_RESEARCH_LIBRARY: ResearchLibraryEntry[] = [
  {
    source: "Sprout Social — Instagram Trends 2026",
    url: "https://sproutsocial.com/insights/instagram-trends/",
    dateAccessed: "2026-08-27",
    industry: "all",
    pattern: "Feeds are moving away from heavy text-based content toward visual storytelling; local, specific, human-led content (real employees/customers, real neighborhood context) outperforms generic marketing posts.",
    whyItWorks: "Text-heavy graphics read as an ad/announcement, not a moment worth stopping for; a real, specific, local moment reads as something worth the viewer's attention.",
    whatNotToCopy: "Do not literally copy a specific brand's post format -- apply the underlying principle (specific > generic, visual > text-block) to THIS business's own real context.",
  },
  {
    source: "Multiple Meta-ads-focused agency guides (adlibrary.com, favoured.co.uk, verdemedia.com) — 2026",
    url: "https://favoured.co.uk/ugly-ad-creative-2026/",
    dateAccessed: "2026-08-27",
    industry: "all",
    pattern: "Over-polished, obviously \"ad-like\" production (studio lighting, motion-graphic lower-thirds, actor-delivered testimonials) increasingly triggers learned banner-blindness; content that visually matches organic, slightly-less-polished posts earns more genuine attention.",
    whyItWorks: "The feed has trained viewers to pattern-match \"looks like an ad\" and scroll past it reflexively; a real, specific, slightly-imperfect moment doesn't trip that pattern.",
    whatNotToCopy: "This is not license to produce sloppy or low-quality work -- it means composed-but-real photography, not deliberately degraded quality. \"Carefully unpolished,\" not careless.",
  },
  {
    source: "Fontfabric / ManyPixels / Hemisphere — 2026 design & typography trend roundups",
    url: "https://www.fontfabric.com/blog/10-design-trends-shaping-the-visual-typographic-landscape-in-2026/",
    dateAccessed: "2026-08-27",
    industry: "all",
    pattern: "Typography is increasingly treated as the hero visual element itself -- oversized, confident headline type paired with deliberately minimal supporting text (\"minimaximalism\": a clean simple base layout carrying one bold, intentional detail, not many competing ones).",
    whyItWorks: "One strong, legible, well-composed headline reads as premium and intentional; five smaller competing text blocks read as cluttered and template-like.",
    whatNotToCopy: "Do not force oversized type onto every creative regardless of concept -- a photography-led creative with zero on-image text is equally valid and often stronger; typography-as-hero is one tool, not a mandatory default.",
  },
  {
    source: "Later.com / Socialync / Admove — 2026 scroll-stop & hook guides",
    url: "https://later.com/blog/scroll-stopping-content/",
    dateAccessed: "2026-08-27",
    industry: "all",
    pattern: "The scroll/stop decision happens almost instantly on a single, strong visual focal point and a pattern interrupt -- not on reading multiple lines of copy. A creative needs exactly one thing the eye lands on first.",
    whyItWorks: "A viewer has already decided to keep scrolling or not before they've read anything; the image's own composition has to do that work alone.",
    whatNotToCopy: "\"Pattern interrupt\" does not mean shock value or irrelevant novelty -- the interrupt still has to be genuinely about this business's real context, not an unrelated attention-grab.",
  },
  {
    source: "Industry local-service marketing guides (reservio.com, canatosmedia.com, digispheremarketing.com) — 2026",
    url: "https://canatosmedia.com/how-local-service-businesses-can-improve-ad-creative-performance-in-2026/",
    dateAccessed: "2026-08-27",
    industry: "local_service",
    pattern: "Before/after visual comparisons remain a strong, credible trust format specifically for transformation-adjacent local businesses (repair/service, salon, some clinic contexts) -- showing the actual problem and the actual resolution, not a staged handshake photo.",
    whyItWorks: "It's concrete, verifiable-looking proof of competence rather than a claim -- viewers trust what they can visually confirm over an adjective (\"reliable\", \"professional\").",
    whatNotToCopy: "Only use a before/after format when the business's real work genuinely produces a visible before/after -- never stage or fabricate one for a service that doesn't have a visual transformation to show.",
    reportedClaims: "Several of these sources cited specific engagement multipliers for carousels/video (e.g. \"9x more saves\", \"10-15x higher engagement\") -- these are agency-reported, not platform-verified, numbers and are NOT used as fact anywhere in this campaign's generation or scoring; only the qualitative pattern above (before/after as a credible trust format) is used.",
  },
];

/** Returns the qualitative pattern+why strings relevant to an industry
 * (its own entries plus the "all" entries), formatted for direct injection
 * into the Creative Treatment prompt. Never returns `reportedClaims` --
 * those exist for this file's own transparency record only, never as
 * generation grounding. */
export function researchInsightsForIndustry(industry: ResearchLibraryEntry["industry"]): string[] {
  return VISUAL_RESEARCH_LIBRARY
    .filter((entry) => entry.industry === "all" || entry.industry === industry)
    .map((entry) => `${entry.pattern} (Why: ${entry.whyItWorks})`);
}
