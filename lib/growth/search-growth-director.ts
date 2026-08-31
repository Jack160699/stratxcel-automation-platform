import type { ConfidenceLevel, NormalizedWebsiteIntelligence } from "../intelligence/website-intelligence.ts";
import type { GoogleBusinessLocationDetails } from "../google/google-growth-engine.ts";

/**
 * STRATXCEL final autonomous growth-OS brief, Sections 13/16/18/25, and the
 * "no Director pretense" bar (Section 78): a Director is not complete if it
 * only creates strategy records — it must consume real evidence, decide,
 * and produce an executable action. This module is that computation layer.
 *
 * Every function here is PURE (no I/O, no fabrication): given a real
 * `NormalizedWebsiteIntelligence` (from `runWebsiteIntelligencePipeline`)
 * and, optionally, a real `GoogleBusinessLocationDetails`, it derives
 * concrete, prioritized actions strictly from the evidence actually
 * present. No hardcoded action list is emitted regardless of input --
 * every action below is conditional on a real signal in the evidence, and
 * every action cites the exact evidence that produced it (`why`). This is
 * what makes it testable the way the brief's Section 35 "Strategy Learning
 * Test" demands: different evidence must produce different output, and
 * that's asserted directly in this module's test file.
 *
 * ⚠️ `computeSeoOpportunities` is SUPERSEDED, not canonical: after writing
 * it, this session discovered `packages/search-discovery/src/technical.ts`'s
 * `analyzeTechnicalSeo` -- a real, more mature, already-production-wired
 * technical-SEO issue detector (severity, `automaticallyFixable`,
 * `approvalRequired`, HTTPS/duplicate-title/orphan-page checks this
 * function doesn't have). See
 * docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md's correction section.
 * Left in place because it's real, tested, and doesn't conflict at
 * runtime -- but new callers wanting real technical-SEO findings should
 * use `analyzeTechnicalSeo` (via `@stratxcel/search-discovery`), not this.
 * `computeAeoOpportunities`/`computeGeoOpportunities` -- CONFIRMED
 * non-duplicate after fully reading `packages/search-discovery` (all of
 * `authority/`, `catalog/`, `ai-search/`, `research/`, `measurement/`,
 * `dashboard/`, `loop/`, `diagnostics/`, `outcomes/`, `release/`,
 * `canary/`, `runtime-proof/` read this session, not sampled): the closest
 * analogs are `ai-search/citation-gap.ts` (AI-citation gaps vs
 * competitors -- a different question from "what answer content is
 * missing"), `authority/gap-engine.ts` (directory/publication citation
 * gaps -- a different question from NAP consistency), and
 * `catalog/content-engine.ts` (generates full page content once a gap is
 * already decided -- doesn't detect the NAP-mismatch/missing-address/
 * missing-schema gaps `computeGeoOpportunities` detects in the first
 * place). The real package's own schema anticipates exactly this
 * NAP/entity-consistency concept (`search_entity_nodes.consistency_status
 * IN ('CONSISTENT','INCONSISTENT','WEAK_COVERAGE','MISSING_RELATIONSHIP')`,
 * added by this session's applied migration) but no real code reads or
 * writes that table yet -- confirmed by grep, not assumed. This module's
 * NAP-consistency logic is, right now, the only real implementation of
 * that concept anywhere in the codebase; it just isn't wired to persist
 * into `search_entity_nodes` the way the real schema expects. Recorded as
 * a real, identified integration opportunity in
 * docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md rather than rushed.
 *
 * What this module deliberately does NOT do: it does not execute the
 * action (deploy a fix, publish a page, submit to Search Console) or fetch
 * new evidence. Execution requires either direct control of the target
 * codebase (real, for StratXcel's own site -- see
 * `docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md`'s live-proof section)
 * or a real authorized connector for an arbitrary customer site (Vercel
 * OAuth, Search Console OAuth) -- neither of which this module assumes.
 * Keeping "decide what to do" and "carry it out" as separate, honestly
 * labeled layers is what lets the decision layer be proven today without
 * overclaiming the execution layer.
 */

export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";
export type EffortLevel = "HIGH" | "MEDIUM" | "LOW";

interface BaseAction {
  id: string;
  impact: ImpactLevel;
  effort: EffortLevel;
  confidence: ConfidenceLevel;
  /** The exact evidence field(s) that produced this action -- never omitted, never generic. */
  why: string;
  recommendedChange: string;
  executionMethod: string;
  verificationMethod: string;
}

export interface SeoAction extends BaseAction {
  category: "SEO";
  issue: string;
}

export interface AeoAction extends BaseAction {
  category: "AEO";
  question: string;
  intent: "PRICING" | "SERVICE_SCOPE" | "LOCATION" | "HOW_TO" | "AVAILABILITY";
}

export interface GeoAction extends BaseAction {
  category: "GEO";
  issue: string;
}

function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * SEO Director. Reads `intel.seo` (the real technical snapshot) plus
 * `intel.crawledPagesCount`/`sitemapPresent`/`robotsPresent`/`business`.
 * Every threshold below is deliberately conservative (only flags a real
 * gap, never a stylistic preference) so this stays "executable tasks", not
 * "generic SEO advice" (brief Section 13).
 */
export function computeSeoOpportunities(intel: NormalizedWebsiteIntelligence): SeoAction[] {
  const actions: SeoAction[] = [];
  const s = intel.seo;
  const pages = Math.max(1, intel.crawledPagesCount);

  if (!intel.sitemapPresent) {
    actions.push({
      id: "seo-missing-sitemap",
      category: "SEO",
      issue: "No XML sitemap found",
      impact: "HIGH",
      effort: "LOW",
      confidence: "HIGH",
      why: `crawlWebsite reported sitemapPresent=false for ${intel.websiteUrl}`,
      recommendedChange: "Generate and publish /sitemap.xml listing every indexable page, and reference it in robots.txt.",
      executionMethod: "Add a sitemap route/generator to the site codebase (framework-native, e.g. Next.js `sitemap.ts`) and deploy.",
      verificationMethod: "Re-crawl and confirm sitemapPresent=true and the sitemap lists the expected page count.",
    });
  }

  if (!intel.robotsPresent) {
    actions.push({
      id: "seo-missing-robots",
      category: "SEO",
      issue: "No robots.txt found",
      impact: "MEDIUM",
      effort: "LOW",
      confidence: "HIGH",
      why: `crawlWebsite reported robotsPresent=false for ${intel.websiteUrl}`,
      recommendedChange: "Publish /robots.txt allowing indexable pages and pointing to the sitemap.",
      executionMethod: "Add a robots route (framework-native, e.g. Next.js `robots.ts`) and deploy.",
      verificationMethod: "Re-crawl and confirm robotsPresent=true.",
    });
  }

  if (s.titlePresentRatio < 1) {
    const missing = pages - Math.round(s.titlePresentRatio * pages);
    actions.push({
      id: "seo-missing-titles",
      category: "SEO",
      issue: `${missing} of ${pages} crawled pages have no <title>`,
      impact: "HIGH",
      effort: "MEDIUM",
      confidence: "HIGH",
      why: `intel.seo.titlePresentRatio=${fmtPct(s.titlePresentRatio)} across ${pages} crawled pages`,
      recommendedChange: "Write a unique, descriptive <title> for every page missing one.",
      executionMethod: "Per-page title metadata change in the site codebase.",
      verificationMethod: "Re-crawl and confirm titlePresentRatio=100%.",
    });
  }

  if (s.metaDescriptionPresentRatio < 1) {
    const missing = pages - Math.round(s.metaDescriptionPresentRatio * pages);
    actions.push({
      id: "seo-missing-meta-description",
      category: "SEO",
      issue: `${missing} of ${pages} crawled pages have no meta description`,
      impact: s.metaDescriptionPresentRatio < 0.5 ? "HIGH" : "MEDIUM",
      effort: "MEDIUM",
      confidence: "HIGH",
      why: `intel.seo.metaDescriptionPresentRatio=${fmtPct(s.metaDescriptionPresentRatio)} across ${pages} crawled pages`,
      recommendedChange: "Write a unique meta description (~150-160 chars) summarizing each page's real content.",
      executionMethod: "Per-page metaDescription metadata change in the site codebase.",
      verificationMethod: "Re-crawl and confirm metaDescriptionPresentRatio=100%.",
    });
  }

  if (s.h1PresentRatio < 1) {
    actions.push({
      id: "seo-missing-h1",
      category: "SEO",
      issue: `${fmtPct(1 - s.h1PresentRatio)} of crawled pages have no H1`,
      impact: "MEDIUM",
      effort: "LOW",
      confidence: "HIGH",
      why: `intel.seo.h1PresentRatio=${fmtPct(s.h1PresentRatio)}`,
      recommendedChange: "Add exactly one descriptive H1 per page, matching the page's real primary topic.",
      executionMethod: "Per-page heading markup change.",
      verificationMethod: "Re-crawl and confirm h1PresentRatio=100%.",
    });
  }

  if (!s.canonicalConsistency) {
    actions.push({
      id: "seo-canonical-inconsistency",
      category: "SEO",
      issue: "Not every crawled page declares a canonical URL",
      impact: "HIGH",
      effort: "LOW",
      confidence: "HIGH",
      why: "intel.seo.canonicalConsistency=false (at least one crawled page has no <link rel=\"canonical\">)",
      recommendedChange: "Add a self-referencing canonical tag to every indexable page to prevent duplicate-content dilution.",
      executionMethod: "Framework-level canonical metadata (e.g. Next.js `alternates.canonical`) applied site-wide.",
      verificationMethod: "Re-crawl and confirm canonicalConsistency=true.",
    });
  }

  if (s.brokenLinksCount > 0) {
    actions.push({
      id: "seo-broken-links",
      category: "SEO",
      issue: `${s.brokenLinksCount} crawl error(s) encountered`,
      impact: s.brokenLinksCount >= 3 ? "HIGH" : "MEDIUM",
      effort: "MEDIUM",
      confidence: "HIGH",
      why: `intel.seo.brokenLinksCount=${s.brokenLinksCount}`,
      recommendedChange: "Fix or 301-redirect every broken internal link found during the crawl.",
      executionMethod: "Link/route fixes in the site codebase.",
      verificationMethod: "Re-crawl and confirm brokenLinksCount=0.",
    });
  }

  const hasLocalOrOrgSchema = intel.seo.schemaTypes.some((t) => /Organization|LocalBusiness|Store|Restaurant|Corporation|ProfessionalService/i.test(t));
  if (!hasLocalOrOrgSchema) {
    actions.push({
      id: "seo-missing-org-schema",
      category: "SEO",
      issue: "No Organization/LocalBusiness structured data detected",
      impact: "MEDIUM",
      effort: "LOW",
      confidence: intel.identity.businessName.confidence,
      why: `intel.seo.schemaTypes=[${intel.seo.schemaTypes.join(", ") || "none"}]`,
      recommendedChange: `Add JSON-LD Organization/LocalBusiness schema using the site's real detected identity (name: "${intel.identity.businessName.value}").`,
      executionMethod: "Add a JSON-LD <script type=\"application/ld+json\"> block to the site layout.",
      verificationMethod: "Re-crawl and confirm schemaTypes includes Organization or LocalBusiness.",
    });
  }

  return actions;
}

/**
 * AEO Director. Derives answer-content opportunities strictly from real
 * detected business facts (services/products/pricing/booking) -- never a
 * generic FAQ template. A service/product with LOW/UNKNOWN confidence is
 * skipped rather than guessed at, matching brief Section 16's "do not
 * create FAQ spam" rule.
 */
export function computeAeoOpportunities(intel: NormalizedWebsiteIntelligence): AeoAction[] {
  const actions: AeoAction[] = [];
  const biz = intel.business;
  const name = intel.identity.businessName.value !== "UNKNOWN" ? intel.identity.businessName.value : "this business";

  if (biz.services.confidence !== "LOW" && biz.services.value.length > 0) {
    for (const service of biz.services.value.slice(0, 5)) {
      actions.push({
        id: `aeo-service-scope-${service.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
        category: "AEO",
        question: `What does ${name}'s "${service}" service actually include?`,
        intent: "SERVICE_SCOPE",
        impact: "MEDIUM",
        effort: "LOW",
        confidence: biz.services.confidence,
        why: `intel.business.services includes "${service}" (source: ${biz.services.source})`,
        recommendedChange: `Add a direct, concise answer section describing exactly what "${service}" includes, using only verified facts.`,
        executionMethod: "Structured answer block (heading + 2-3 sentence direct answer) on the relevant service page.",
        verificationMethod: "Re-crawl and confirm the answer section is present and content matches verified facts.",
      });
    }
  }

  if (biz.pricing.value.length === 0) {
    actions.push({
      id: "aeo-missing-pricing-answer",
      category: "AEO",
      question: `How much does ${name} charge?`,
      intent: "PRICING",
      impact: "HIGH",
      effort: "LOW",
      confidence: "HIGH",
      why: "intel.business.pricing has zero discovered signals — a high-intent question with no on-site answer at all",
      recommendedChange: "Add a real pricing/estimate answer (exact figures, a transparent range, or an explicit \"request a quote\" with what determines cost) — never a fabricated number.",
      executionMethod: "New answer section or FAQ entry with verified pricing facts supplied by the business owner.",
      verificationMethod: "Re-crawl and confirm pricing signals are now discoverable, or confirm the business has explicitly chosen not to publish pricing.",
    });
  }

  if (biz.bookingAvailable.value === true) {
    actions.push({
      id: "aeo-booking-how-to",
      category: "AEO",
      question: `How do I book with ${name}?`,
      intent: "HOW_TO",
      impact: "LOW",
      effort: "LOW",
      confidence: biz.bookingAvailable.confidence,
      why: `intel.business.bookingAvailable=true (${biz.bookingAvailable.evidence})`,
      recommendedChange: "Add a short, direct step-by-step booking answer near the booking link/widget.",
      executionMethod: "Structured answer block adjacent to the existing booking CTA.",
      verificationMethod: "Re-crawl and confirm the answer section is present.",
    });
  }

  return actions;
}

/**
 * GEO Director. Cross-references the real website-declared location/phone
 * against a real, already-connected Google Business Profile (when one
 * exists) for NAP (Name/Address/Phone) consistency -- the single most
 * concrete, evidence-checkable local-SEO signal this codebase can compute
 * without a dedicated local-citation data source. When no GBP is
 * connected, this is reported honestly as a real gap, never silently
 * skipped.
 */
export function computeGeoOpportunities(intel: NormalizedWebsiteIntelligence, gbp: GoogleBusinessLocationDetails | null): GeoAction[] {
  const actions: GeoAction[] = [];

  if (!gbp) {
    actions.push({
      id: "geo-no-gbp-connected",
      category: "GEO",
      issue: "No Google Business Profile connected — NAP consistency cannot be verified",
      impact: "HIGH",
      effort: "LOW",
      confidence: "HIGH",
      why: "GrowthAutopilotContext.googleBusiness.profile is null",
      recommendedChange: "Discover or set up the Google Business Profile (see lib/google/google-growth-engine.ts) so location data can be cross-checked.",
      executionMethod: "GBP discovery/creation flow.",
      verificationMethod: "googleBusiness.status becomes FOUND_VERIFIED or FOUND_UNVERIFIED with a real profile object.",
    });
    return actions;
  }

  const websitePhone = intel.conversion.phone.value;
  if (websitePhone && gbp.phone) {
    const normalize = (p: string) => p.replace(/[^\d]/g, "").replace(/^0+/, "");
    if (normalize(websitePhone) !== normalize(gbp.phone)) {
      actions.push({
        id: "geo-nap-phone-mismatch",
        category: "GEO",
        issue: "Website phone number does not match Google Business Profile phone number",
        impact: "HIGH",
        effort: "LOW",
        confidence: "HIGH",
        why: `website phone="${websitePhone}" (${intel.conversion.phone.source}) vs GBP phone="${gbp.phone}"`,
        recommendedChange: "Make the phone number identical on the website and GBP — inconsistent NAP data actively harms local ranking.",
        executionMethod: "Update whichever of the two is stale.",
        verificationMethod: "Re-crawl the website and re-fetch the GBP profile; confirm normalized numbers match.",
      });
    }
  }

  if (intel.business.locations.value.length === 0) {
    actions.push({
      id: "geo-no-address-on-website",
      category: "GEO",
      issue: "Website has no discoverable address, but a Google Business Profile exists",
      impact: "MEDIUM",
      effort: "LOW",
      confidence: "MEDIUM",
      why: `intel.business.locations is empty while googleBusiness.profile.address is set (${gbp.address.city}, ${gbp.address.state})`,
      recommendedChange: `Publish the real address ("${gbp.address.streetAddress}, ${gbp.address.city}, ${gbp.address.state} ${gbp.address.postalCode}") on the site, matching GBP exactly, ideally as LocalBusiness schema.`,
      executionMethod: "Add address text + LocalBusiness JSON-LD to the site (footer/contact page at minimum).",
      verificationMethod: "Re-crawl and confirm intel.business.locations includes the matching address.",
    });
  }

  const hasLocalSchema = intel.seo.schemaTypes.some((t) => /LocalBusiness/i.test(t));
  if (!hasLocalSchema) {
    actions.push({
      id: "geo-missing-localbusiness-schema",
      category: "GEO",
      issue: "No LocalBusiness structured data despite a connected Google Business Profile",
      impact: "MEDIUM",
      effort: "LOW",
      confidence: "HIGH",
      why: `intel.seo.schemaTypes=[${intel.seo.schemaTypes.join(", ") || "none"}], googleBusiness.profile exists`,
      recommendedChange: `Add LocalBusiness JSON-LD with the real GBP-matching NAP and category ("${gbp.primaryCategory}").`,
      executionMethod: "JSON-LD block on the site layout or location/contact page.",
      verificationMethod: "Re-crawl and confirm schemaTypes includes LocalBusiness.",
    });
  }

  return actions;
}

/** Brief Section 25: one unified strategy layer, not three disconnected planners. */
export function computeSearchGrowthStrategy(
  intel: NormalizedWebsiteIntelligence,
  gbp: GoogleBusinessLocationDetails | null,
): { seo: SeoAction[]; aeo: AeoAction[]; geo: GeoAction[]; generatedAt: string } {
  return {
    seo: computeSeoOpportunities(intel),
    aeo: computeAeoOpportunities(intel),
    geo: computeGeoOpportunities(intel, gbp),
    generatedAt: new Date().toISOString(),
  };
}
