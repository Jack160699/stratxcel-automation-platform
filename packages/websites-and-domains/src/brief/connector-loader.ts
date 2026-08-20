/**
 * Connector Context Loader & Evidence Synthesis
 *
 * Integrates authorized Brand Brain, Analytics, Search Console, CRM, and catalog data
 * into grounded website generation insights.
 */

import type { AuthorizedConnectorContext } from "./types.ts";

export interface ConnectorInsightsSummary {
  hasBrandData: boolean;
  hasAnalytics: boolean;
  hasGsc: boolean;
  hasCrm: boolean;
  hasCatalog: boolean;
  derivedRecommendations: string[];
}

export function synthesizeConnectorContext(
  context?: AuthorizedConnectorContext
): ConnectorInsightsSummary {
  if (!context) {
    return {
      hasBrandData: false,
      hasAnalytics: false,
      hasGsc: false,
      hasCrm: false,
      hasCatalog: false,
      derivedRecommendations: [],
    };
  }

  const recommendations: string[] = [];

  // 1. Brand Brain Insights
  const hasBrandData = Boolean(context.brandBrain?.businessName);
  if (context.brandBrain?.story) {
    recommendations.push("Include dedicated Brand Heritage section based on authentic brand story.");
  }
  if (context.brandBrain?.primaryColors?.length) {
    recommendations.push(`Use authorized brand color palette (${context.brandBrain.primaryColors.join(", ")}).`);
  }

  // 2. Google Analytics Signals
  const hasAnalytics = Boolean(context.analytics?.connected);
  if (context.analytics?.mobileTrafficPercentage && context.analytics.mobileTrafficPercentage > 60) {
    recommendations.push(
      `Optimize for mobile-first user experience (${context.analytics.mobileTrafficPercentage}% verified mobile traffic).`
    );
  }
  if (context.analytics?.topPages?.length) {
    recommendations.push(
      `Feature top-performing content paths in main navigation: ${context.analytics.topPages.slice(0, 3).map((p) => p.path).join(", ")}.`
    );
  }

  // 3. Search Console Signals
  const hasGsc = Boolean(context.searchConsole?.connected);
  if (context.searchConsole?.topQueries?.length) {
    recommendations.push(
      `Structure SEO headings targeting proven organic queries: ${context.searchConsole.topQueries.slice(0, 3).join(", ")}.`
    );
  }

  // 4. CRM & Leads
  const hasCrm = Boolean(context.crm?.connected);
  if (context.crm?.preferredContactChannel === "whatsapp") {
    recommendations.push("Prominently integrate direct WhatsApp instant enquiry action in header & sticky mobile CTA.");
  }

  // 5. Catalog
  const hasCatalog = Boolean(
    context.catalog?.existingProducts?.length || context.catalog?.existingServices?.length
  );
  if (context.catalog?.existingProducts?.length) {
    recommendations.push(`Pre-populate active store catalog with ${context.catalog.existingProducts.length} verified products.`);
  }

  return {
    hasBrandData,
    hasAnalytics,
    hasGsc,
    hasCrm,
    hasCatalog,
    derivedRecommendations: recommendations,
  };
}
