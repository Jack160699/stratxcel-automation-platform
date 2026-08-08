import type { AssetType, QueryMetric, SearchIntent, SearchOpportunity } from "./types.ts";

export function inferIntent(query: string): SearchIntent { const q = query.toLowerCase(); if (/near me| in [a-z]/.test(q)) return "local"; if (/vs|compare|alternative/.test(q)) return "comparison"; if (/buy|book|hire|price|cost/.test(q)) return "transactional"; if (/best|review|top/.test(q)) return "commercial"; if (/how|what|why|guide/.test(q)) return "informational"; return "branded"; }
export function mapAsset(intent: SearchIntent, hasExistingPage: boolean): AssetType { if (hasExistingPage) return "existing_service_page"; if (intent === "local") return "location_page"; if (intent === "comparison") return "comparison_page"; if (intent === "informational") return "faq"; return "new_service_page"; }
export function scoreOpportunity(input: { impressions?: number; position?: number; ctrGap?: number; conversions?: number; relevance: number; businessPriority: number; competitionOpportunity: number; assetQuality: number; intent: SearchIntent }): number {
  const visibility = Math.min(20, Math.log10((input.impressions ?? 0) + 1) * 5);
  const ranking = input.position && input.position >= 4 && input.position <= 15 ? 18 : input.position && input.position <= 3 ? 8 : 4;
  const intent = ["transactional", "commercial", "local"].includes(input.intent) ? 12 : 6;
  const score = visibility + ranking + Math.min(12, Math.max(0, input.ctrGap ?? 0) * 120) + Math.min(10, (input.conversions ?? 0) * 2) + input.relevance * 8 + input.businessPriority * 8 + input.competitionOpportunity * 6 + (1 - input.assetQuality) * 6 + intent;
  return Math.round(Math.max(0, Math.min(100, score)));
}
export function detectSearchConsoleOpportunities(metrics: QueryMetric[]): SearchOpportunity[] {
  const results: SearchOpportunity[] = [];
  const pagesByQuery = new Map<string, Set<string>>();
  for (const m of metrics) {
    if (m.page) { const pages = pagesByQuery.get(m.query) ?? new Set<string>(); pages.add(m.page); pagesByQuery.set(m.query, pages); }
    const intent = inferIntent(m.query); const base = { intent, assetType: mapAsset(intent, Boolean(m.page)), url: m.page };
    if (m.impressions >= 100 && m.ctr < 0.02) results.push({ id: `ctr:${m.query}`, surface: "google_search", title: "High visibility, low click-through", evidence: `${m.impressions} impressions at ${(m.ctr * 100).toFixed(1)}% CTR`, recommendation: "Improve the result title and description without changing the page promise.", score: scoreOpportunity({ impressions: m.impressions, position: m.position, ctrGap: .04 - m.ctr, conversions: m.conversions, relevance: 1, businessPriority: .8, competitionOpportunity: .7, assetQuality: .5, intent }), ...base });
    if (m.position >= 4 && m.position <= 15) results.push({ id: `rank:${m.query}`, surface: "google_search", title: "Ranking improvement opportunity", evidence: `Average position ${m.position.toFixed(1)}`, recommendation: "Strengthen the matching page, evidence, and internal links.", score: scoreOpportunity({ impressions: m.impressions, position: m.position, conversions: m.conversions, relevance: 1, businessPriority: .8, competitionOpportunity: .7, assetQuality: .5, intent }), ...base });
    if ((m.previousClicks ?? m.clicks) > 0 && m.clicks < (m.previousClicks ?? 0) * .7) results.push({ id: `loss:${m.query}`, surface: "google_search", title: "Clicks are falling", evidence: `${m.previousClicks} to ${m.clicks} clicks`, recommendation: "Check ranking, result appearance, intent, and page changes.", score: 80, ...base });
    if ((m.previousImpressions ?? m.impressions) > 0 && m.impressions > (m.previousImpressions ?? 0) * 1.5) results.push({ id: `rise:${m.query}`, surface: "google_search", title: "Query is rising", evidence: `${m.previousImpressions} to ${m.impressions} impressions`, recommendation: "Prioritize the relevant asset while demand is growing.", score: 75, ...base });
  }
  for (const [query, pages] of pagesByQuery) if (pages.size > 1) results.push({ id: `cannibal:${query}`, surface: "google_search", title: "Multiple pages compete for one query", evidence: `${pages.size} pages receive impressions`, recommendation: "Choose the primary page and clarify internal linking and page purpose.", score: 72, intent: inferIntent(query), assetType: "existing_service_page" });
  return results.sort((a, b) => b.score - a.score);
}

export function buildBusinessOpportunities(input: { services: string[]; locations: string[]; goals: string[]; competitors: string[]; existingPageTopics: string[] }): SearchOpportunity[] {
  const existing = new Set(input.existingPageTopics.map((topic) => topic.toLowerCase()));
  const opportunities: SearchOpportunity[] = [];
  for (const service of input.services) {
    const present = existing.has(service.toLowerCase());
    opportunities.push({ id: `service:${service}`, surface: "google_search", title: `${service} discovery`, evidence: present ? "A matching page exists and can be measured or improved." : "The business offers this service but no matching page topic was supplied.", recommendation: present ? "Measure the existing service page against real queries and outcomes." : "Prepare a focused service page; do not default to a blog article.", score: present ? 58 : 78, intent: "transactional", assetType: present ? "existing_service_page" : "new_service_page" });
    for (const location of input.locations) opportunities.push({ id: `local:${service}:${location}`, surface: "local", title: `${service} in ${location}`, evidence: "The service and service area are both business-supplied facts.", recommendation: "Validate local demand and prepare a useful location/service asset only if the business genuinely serves this area.", score: 72, intent: "local", assetType: "location_page" });
  }
  for (const competitor of input.competitors) opportunities.push({ id: `compare:${competitor}`, surface: "google_search", title: `Customer comparison with ${competitor}`, evidence: "The business identified this organization as a known competitor.", recommendation: "Research verifiable differences and prepare a fair comparison; never invent competitor claims.", score: 60, intent: "comparison", assetType: "comparison_page" });
  for (const goal of input.goals) opportunities.push({ id: `goal:${goal}`, surface: "outcomes", title: goal, evidence: "This is a customer-supplied business goal.", recommendation: "Use this goal as a priority weight once real visibility and conversion evidence is available.", score: 65 });
  return opportunities;
}
