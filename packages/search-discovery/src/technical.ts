import type { TechnicalIssue, TechnicalPage } from "./types.ts";

/**
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
 * 20: a real, live false-positive found on the real StratXcel tenant --
 * ROBOTS_MISSING and SITEMAP_MISSING were reported as confirmed findings
 * even though https://www.stratxcel.in/robots.txt and /sitemap.xml were
 * both genuinely live and correct (verified directly: HTTP 200, real
 * content, real canonical domain).
 *
 * robotsPresent/sitemapPresent are tri-state (boolean | null), not plain
 * booleans: `null` means "not actually checked" (runtime.ts skips the real
 * crawl -- and therefore never learns the real answer -- whenever a
 * project's website ownership isn't yet verified, a legitimate safety
 * gate against crawling a site the tenant hasn't proven they own). The old
 * plain-boolean signature forced every unchecked case to silently default
 * to `false`, which this function then reported as a confirmed HIGH-
 * severity finding -- "not yet checked" was fabricated into "confirmed
 * missing." Only a real, explicit `false` (an actual crawl ran and
 * genuinely found nothing) is reported now; `null` reports nothing, same
 * honest-silence pattern already used elsewhere in this pipeline for
 * unavailable/unchecked provider state.
 */
export function analyzeTechnicalSeo(pages: TechnicalPage[], site: { https: boolean; robotsPresent: boolean | null; sitemapPresent: boolean | null }): TechnicalIssue[] {
  const issues: TechnicalIssue[] = [];
  const add = (issue: TechnicalIssue) => issues.push(issue);
  if (!site.https) add({ code: "HTTPS_REQUIRED", severity: "Critical", evidence: "The property is not served over HTTPS.", affectedUrl: "site-wide", whyItMatters: "Visitors and search engines need a secure origin.", recommendedAction: "Enable HTTPS and redirect HTTP URLs.", automaticallyFixable: false, approvalRequired: true });
  if (site.robotsPresent === false) add({ code: "ROBOTS_MISSING", severity: "High", evidence: "No robots.txt was observed.", affectedUrl: "/robots.txt", whyItMatters: "Crawler policy is unclear.", recommendedAction: "Prepare a reviewed robots.txt policy.", automaticallyFixable: true, approvalRequired: true });
  if (site.sitemapPresent === false) add({ code: "SITEMAP_MISSING", severity: "High", evidence: "No sitemap was observed.", affectedUrl: "/sitemap.xml", whyItMatters: "Discovery of important pages can be slower.", recommendedAction: "Generate and submit a sitemap.", automaticallyFixable: true, approvalRequired: true });
  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  const linked = new Set(pages.flatMap((p) => p.internalLinks ?? []));
  for (const page of pages) {
    if ((page.status ?? 200) >= 400) add({ code: "BROKEN_URL", severity: "High", evidence: `HTTP ${page.status}`, affectedUrl: page.url, whyItMatters: "Visitors and crawlers cannot reach this page.", recommendedAction: "Repair the link, restore the page, or add an appropriate redirect.", automaticallyFixable: false, approvalRequired: true });
    if (page.indexable === false || /noindex|disallow/i.test(page.robots ?? "")) add({ code: "NOT_INDEXABLE", severity: "High", evidence: page.robots || "Page reported non-indexable.", affectedUrl: page.url, whyItMatters: "This public page may not appear in search.", recommendedAction: "Confirm the privacy choice before changing crawler access.", automaticallyFixable: false, approvalRequired: true });
    if (!page.canonical) add({ code: "CANONICAL_MISSING", severity: "Medium", evidence: "Canonical URL absent.", affectedUrl: page.url, whyItMatters: "Search engines may choose an unintended canonical.", recommendedAction: "Draft a self-referencing canonical.", automaticallyFixable: true, approvalRequired: true });
    if (!page.title?.trim()) add({ code: "TITLE_MISSING", severity: "High", evidence: "Title is empty.", affectedUrl: page.url, whyItMatters: "The page lacks a clear search result title.", recommendedAction: "Draft a specific title matching the page purpose.", automaticallyFixable: true, approvalRequired: false });
    else { const key = page.title.trim().toLowerCase(); titles.set(key, [...(titles.get(key) ?? []), page.url]); if (page.title.length < 15 || page.title.length > 65) add({ code: "TITLE_QUALITY", severity: "Low", evidence: `${page.title.length} characters`, affectedUrl: page.url, whyItMatters: "The title may be unclear or truncated.", recommendedAction: "Draft a concise, descriptive title.", automaticallyFixable: true, approvalRequired: false }); }
    if (!page.metaDescription?.trim()) add({ code: "META_DESCRIPTION_MISSING", severity: "Medium", evidence: "Meta description is empty.", affectedUrl: page.url, whyItMatters: "The result may not explain why a customer should click.", recommendedAction: "Draft a useful description.", automaticallyFixable: true, approvalRequired: false });
    else { const key = page.metaDescription.trim().toLowerCase(); descriptions.set(key, [...(descriptions.get(key) ?? []), page.url]); }
    if ((page.h1Count ?? 0) !== 1) add({ code: "HEADING_STRUCTURE", severity: "Medium", evidence: `${page.h1Count ?? 0} H1 headings`, affectedUrl: page.url, whyItMatters: "The main page topic is unclear.", recommendedAction: "Use one descriptive primary heading.", automaticallyFixable: true, approvalRequired: true });
    if ((page.imageCount ?? 0) > (page.imagesWithAlt ?? 0)) add({ code: "IMAGE_ALT_GAP", severity: "Low", evidence: `${(page.imageCount ?? 0) - (page.imagesWithAlt ?? 0)} images lack alt text`, affectedUrl: page.url, whyItMatters: "Accessibility and image context are incomplete.", recommendedAction: "Draft accurate alt text for meaningful images.", automaticallyFixable: true, approvalRequired: false });
    if (!(page.structuredDataTypes?.length)) add({ code: "STRUCTURED_DATA_ABSENT", severity: "Low", evidence: "No supported structured data detected.", affectedUrl: page.url, whyItMatters: "Machine-readable facts may be incomplete.", recommendedAction: "Prepare schema that matches visible content.", automaticallyFixable: true, approvalRequired: true });
    if (pages.length > 1 && page !== pages[0] && !linked.has(page.url)) add({ code: "ORPHAN_PAGE", severity: "Medium", evidence: "No crawled internal page links here.", affectedUrl: page.url, whyItMatters: "Customers and crawlers may not discover it.", recommendedAction: "Add relevant internal links.", automaticallyFixable: true, approvalRequired: true });
  }
  for (const [title, urls] of titles) if (urls.length > 1) for (const url of urls) add({ code: "TITLE_DUPLICATE", severity: "Medium", evidence: `Shared title: ${title}`, affectedUrl: url, whyItMatters: "Pages compete with indistinct result titles.", recommendedAction: "Draft a unique title for each page.", automaticallyFixable: true, approvalRequired: false });
  for (const [description, urls] of descriptions) if (urls.length > 1) for (const url of urls) add({ code: "META_DESCRIPTION_DUPLICATE", severity: "Low", evidence: `Shared description: ${description}`, affectedUrl: url, whyItMatters: "Search snippets do not distinguish the pages.", recommendedAction: "Draft page-specific descriptions.", automaticallyFixable: true, approvalRequired: false });
  return issues;
}
