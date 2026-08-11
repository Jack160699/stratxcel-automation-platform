/**
 * Context-specific KPI selection — no universal dashboard.
 */

import type { BusinessContextKind, CanonicalMetricKey, KpiSelection } from "./types.ts";

const CONTEXT_KPIS: Record<
  BusinessContextKind,
  { primary: readonly CanonicalMetricKey[]; secondary: readonly CanonicalMetricKey[]; rationale: string }
> = {
  audit_only: {
    primary: ["website_sessions", "organic_impressions", "leads"],
    secondary: ["search_clicks", "inquiry_rate"],
    rationale: "Audit mode prioritizes diagnostic visibility over channel vanity metrics",
  },
  new_business: {
    primary: ["leads", "inquiry_rate", "response_time_hours"],
    secondary: ["website_sessions", "qualification_rate"],
    rationale: "New businesses need capture and response foundations before scale metrics",
  },
  existing_business: {
    primary: ["leads", "meetings", "close_rate", "response_time_hours"],
    secondary: ["qualification_rate", "proposals", "website_sessions"],
    rationale: "Existing businesses optimize conversion bottlenecks with measured funnels",
  },
  active_package: {
    primary: ["leads", "content_performance", "social_engagement"],
    secondary: ["website_sessions", "meetings", "inquiry_rate"],
    rationale: "Package customers track purchased-work outcomes tied to entitlements",
  },
  seo_focused: {
    primary: ["organic_impressions", "search_clicks", "qualified_traffic"],
    secondary: ["website_sessions", "key_events", "leads"],
    rationale: "SEO contexts emphasize search visibility and qualified organic demand",
  },
  social_focused: {
    primary: ["social_reach", "social_engagement", "content_performance"],
    secondary: ["leads", "inquiry_rate"],
    rationale: "Social contexts measure reach/engagement without claiming unsupported sales attribution",
  },
  crm_conversion: {
    primary: ["leads", "response_time_hours", "qualification_rate", "meetings"],
    secondary: ["proposals", "close_rate"],
    rationale: "CRM conversion focuses on response speed and pipeline progression",
  },
  paid_acquisition: {
    primary: ["ad_impressions", "ad_clicks", "ad_spend", "leads"],
    secondary: ["qualification_rate", "meetings"],
    rationale: "Paid contexts require spend-linked measured outcomes — cost unknown stays unknown",
  },
  mixed: {
    primary: ["leads", "website_sessions", "response_time_hours"],
    secondary: ["social_engagement", "search_clicks", "meetings"],
    rationale: "Mixed contexts use a small shared outcome set; channel KPIs stay secondary",
  },
};

export function selectKpisForContext(args: {
  tenantId: string;
  context: BusinessContextKind;
}): KpiSelection {
  const cfg = CONTEXT_KPIS[args.context];
  return {
    tenantId: args.tenantId,
    context: args.context,
    primaryKpis: cfg.primary,
    secondaryKpis: cfg.secondary,
    rationale: cfg.rationale,
  };
}

export function isPrimaryKpi(selection: KpiSelection, metric: CanonicalMetricKey): boolean {
  return selection.primaryKpis.includes(metric);
}
