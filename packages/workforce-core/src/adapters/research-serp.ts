/**
 * research.serp — owned-property Search Console evidence only.
 * Not a public SERP scraper. Left NOT_CONFIGURED until tenant GSC path is
 * production-bound through Workforce with real connection checks.
 */
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderReadinessProbeResult,
} from "../providers/types.ts";

export const RESEARCH_SERP_PROVIDER_KEY = "research-serp-search-console";

export function createResearchSerpProvider(): CapabilityProvider {
  return {
    key: RESEARCH_SERP_PROVIDER_KEY,
    capabilityKeys: ["research.serp"],
    status: "NOT_CONFIGURED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: false,
      status: "NOT_CONFIGURED",
      reasonCode: "PROVIDER_NOT_CONFIGURED",
      details:
        "research.serp requires tenant-scoped Google Search Console connection + property authorization; public SERP scraping is not supported. Search Discovery GSC reader exists but Workforce production bind is not complete.",
    }),
    execute: async (): Promise<ProviderExecuteResult> => ({
      ok: false,
      providerKey: RESEARCH_SERP_PROVIDER_KEY,
      errorCategory: "AUTH_CONFIGURATION",
      errorMessage:
        "research.serp is NOT_CONFIGURED — use Search Console owned-property path when wired; never invent SERP rankings",
      usage: unknownCostUsage({ requests: 0 }),
    }),
  };
}
