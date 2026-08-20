/**
 * Master Website Intelligence Analyzer
 *
 * Exposes analyzeWebsite(input: WebsiteAnalysisInput): Promise<WebsiteUnderstanding>
 * Handles public URLs, raw HTML, and codebases safely.
 */

import type { WebsiteAnalysisInput, WebsiteUnderstanding } from "./schema.ts";
import { safeFetchHtml, checkRobotsTxt } from "./fetcher.ts";
import { parseHtml } from "./parser.ts";
import { analyzeDesignSystem } from "./design.ts";
import { analyzeEcommerce } from "./ecommerce.ts";
import { analyzeRepository } from "./repo-reader.ts";

export async function analyzeWebsite(input: WebsiteAnalysisInput): Promise<WebsiteUnderstanding> {
  // Branch 1: Repository Input
  if (input.repository) {
    return analyzeRepository(input.repository);
  }

  // Branch 2: Raw HTML Input
  if (input.rawHtml) {
    const parsed = parseHtml(input.rawHtml, input.url || "https://example.com");
    const design = analyzeDesignSystem(input.rawHtml);
    const ecommerce = analyzeEcommerce(input.rawHtml);

    return {
      source: input.url || "Raw HTML",
      sourceType: "raw_html",
      canonicalUrl: parsed.canonicalUrl || input.url || "https://example.com",
      title: parsed.title || "Website",
      businessName: parsed.title.split(/[-|]/)[0]?.trim() || "Business",
      businessCategory: ecommerce.isEcommerce ? "E-Commerce" : "Business Services",
      pages: [parsed.page],
      navigation: parsed.navigation,
      sections: parsed.sections,
      typography: design.typography,
      colorSystem: design.colorSystem,
      spacingSystem: design.spacingSystem,
      layoutPatterns: design.layoutPatterns,
      components: [
        { type: "hero", name: "HeroSection", description: "Main entry hero" },
        { type: "nav", name: "NavigationMenu", description: "Header navigation" },
      ],
      images: parsed.images,
      assets: parsed.assets,
      forms: parsed.forms,
      ctas: parsed.ctas,
      seo: parsed.seo,
      ecommerce,
      integrations: parsed.integrations,
      responsiveObservations: design.responsiveObservations,
      contentSummary: `Page with ${parsed.wordCount} words and ${parsed.sections.length} semantic sections.`,
      designSummary: `Design with ${design.colorSystem.primary} primary brand color and ${design.typography.primaryFont} font.`,
      technicalSummary: "HTML document analyzed via Stratxcel Intelligence Engine.",
      analyzedAt: new Date().toISOString(),
    };
  }

  // Branch 3: Public Website URL Input
  if (input.url) {
    const fetchResult = await safeFetchHtml(input.url, { timeoutMs: input.options?.timeoutMs });
    const robots = await checkRobotsTxt(input.url);

    const parsed = parseHtml(fetchResult.html, fetchResult.finalUrl);
    const design = analyzeDesignSystem(fetchResult.html);
    const ecommerce = analyzeEcommerce(fetchResult.html);

    const seo = {
      ...parsed.seo,
      hasRobotsTxt: robots.sitemaps.length > 0 || robots.disallowedPaths.length > 0,
      hasSitemap: robots.sitemaps.length > 0,
    };

    return {
      source: input.url,
      sourceType: "url",
      canonicalUrl: parsed.canonicalUrl || fetchResult.finalUrl,
      title: parsed.title || "Website",
      businessName: parsed.title.split(/[-|]/)[0]?.trim() || "Business",
      businessCategory: ecommerce.isEcommerce ? "E-Commerce Storefront" : "Business Website",
      pages: [parsed.page],
      navigation: parsed.navigation,
      sections: parsed.sections,
      typography: design.typography,
      colorSystem: design.colorSystem,
      spacingSystem: design.spacingSystem,
      layoutPatterns: design.layoutPatterns,
      components: [
        { type: "hero", name: "HeroSection", description: "Main hero banner" },
        { type: "nav", name: "HeaderNav", description: "Primary navigation bar" },
      ],
      images: parsed.images,
      assets: parsed.assets,
      forms: parsed.forms,
      ctas: parsed.ctas,
      seo,
      ecommerce,
      integrations: parsed.integrations,
      responsiveObservations: design.responsiveObservations,
      contentSummary: `Site with ${parsed.wordCount} words and ${parsed.sections.length} major sections.`,
      designSummary: `Design with ${design.colorSystem.primary} primary brand color and ${design.typography.primaryFont} font.`,
      technicalSummary: `HTTP 200 fetched in ${fetchResult.durationMs}ms.`,
      analyzedAt: new Date().toISOString(),
    };
  }

  throw new Error("Invalid analysis input: must provide url, rawHtml, or repository");
}
