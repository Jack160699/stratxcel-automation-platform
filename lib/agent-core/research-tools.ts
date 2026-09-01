/**
 * Public web research + StratXcel's own commercial knowledge, exposed as
 * agent-core tools -- app-side (not packages/agent-core) because they import
 * lib/intelligence + lib/commercial directly, same reasoning as
 * social-delegation-tools.ts. Thin adapters only: analyze_website wraps the
 * EXISTING, already-production canonical website intelligence pipeline
 * (lib/intelligence/website-intelligence.ts's runWebsiteIntelligencePipeline,
 * itself built on packages/search-discovery's crawlWebsite -- real SSRF
 * protection via assertPublicHttpTarget, real robots.txt/sitemap parsing).
 * Neither tool needs a tenantId or ownership check: this is public-web
 * analysis of a THIRD PARTY's site (a prospect/partner), the exact same
 * "public analysis, no ownership required" capability this codebase already
 * fixed for its own customers' analysis (see docs/discovery/
 * SEARCH_GROWTH_ENGINE_GAP_AUDIT.md Update 21) -- reused verbatim, not
 * duplicated.
 *
 * Deliberately does NOT persist a crm_leads/website record itself -- that's
 * the Boss's call (via send_whatsapp_message_to_contact once they decide to
 * act), not an automatic side effect of merely looking a site up.
 */
import { runWebsiteIntelligencePipeline } from "../intelligence/website-intelligence";
import { COMMERCIAL_PILLARS, PRICING_TIERS, TRUST_CLAIMS } from "../commercial/catalog";
import type { AgentTool } from "@stratxcel/agent-core";

/** Real crawl over a real network is genuinely slow (multi-page fetch,
 *  robots/sitemap, per-request timeouts) -- capped well under the internal
 *  agent route's own maxDuration so a slow/hostile target degrades to a
 *  partial real result instead of timing out the whole WhatsApp turn. */
const ANALYZE_MAX_PAGES = 6;

export const RESEARCH_DELEGATION_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "analyze_website",
      description:
        "Fetch and analyze a real public website (any business, not just Stratxcel's own customers) -- business identity, services, target audience, positioning, SEO/technical signals, social presence, trust signals, and conversion/CTA strengths and weaknesses. Use this whenever asked to analyze, research, or look into a URL or company website -- never answer from memory when a URL is given.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The website URL to analyze, e.g. https://example.com" } },
        required: ["url"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:research",
    async execute(_ctx, args) {
      const url = String(args.url ?? "").trim();
      if (!url) throw new Error("url is required");
      try {
        const intelligence = await runWebsiteIntelligencePipeline(url, { maxPages: ANALYZE_MAX_PAGES });
        return { fetched: true, url, intelligence };
      } catch (err) {
        // Real, honest failure (unreachable host, blocked by robots.txt,
        // private/internal target rejected by SSRF protection, timeout) --
        // never silently fall back to "I can't browse websites" text; the
        // model gets the real reason and can say so truthfully.
        return { fetched: false, url, reason: err instanceof Error ? err.message : "unknown_error" };
      }
    },
  },
  {
    schema: {
      name: "stratxcel_service_catalog",
      description: "The real, current Stratxcel commercial catalog -- pillars, pricing tiers, and trust claims. Use this to ground any sales/partnership recommendation in Stratxcel's ACTUAL services, never invented ones.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:research",
    async execute() {
      return {
        pillars: COMMERCIAL_PILLARS,
        pricingTiers: PRICING_TIERS.map((t) => ({ id: t.id, pillar: t.pillar, name: t.name, price: t.price, period: t.period, pitch: t.pitch, whoItsFor: t.whoItsFor, scope: t.scope })),
        trustClaims: TRUST_CLAIMS,
      };
    },
  },
];
