import type {
  AISearchMeasurementProvider,
  AISearchPlatform,
  AISearchProviderStatus,
  AIVisibilityResult,
} from "./types.ts";

/**
 * Default fallback provider when no AI Search API keys are configured.
 * Guarantees truthfulness: returns NOT_CONFIGURED without failing runs.
 */
export function createUnavailableAISearchProvider(
  platform: AISearchPlatform = "aggregated_ai"
): AISearchMeasurementProvider {
  return {
    platform,
    async status(): Promise<AISearchProviderStatus> {
      return "NOT_CONFIGURED";
    },
    async measureQuery(input: {
      query: string;
      clientDomain: string;
      competitorDomains: string[];
    }): Promise<AIVisibilityResult> {
      return {
        query: input.query,
        platform,
        brandMentioned: false,
        clientCited: false,
        clientUrls: [],
        citedDomains: [],
        competitorCitations: input.competitorDomains.map((d) => ({
          domain: d,
          cited: false,
          mentioned: false,
          citedUrls: [],
        })),
        sourceCategories: [],
        timestamp: new Date().toISOString(),
        confidence: "LOW",
        providerStatus: "unavailable",
        providerNote: "AI Search measurement provider is not configured. Add PERPLEXITY_API_KEY or OPENAI_API_KEY to activate live AI citation scans.",
      };
    },
  };
}

/**
 * Production Perplexity AI Search Provider.
 * Communicates via official Perplexity Sonar search models.
 */
export function createLivePerplexityProvider(
  apiKey = process.env.PERPLEXITY_API_KEY,
  customFetch: typeof fetch = fetch
): AISearchMeasurementProvider {
  return {
    platform: "perplexity",
    async status(): Promise<AISearchProviderStatus> {
      if (!apiKey) return "NOT_CONFIGURED";
      return "AVAILABLE";
    },

    async measureQuery(input: {
      query: string;
      clientDomain: string;
      competitorDomains: string[];
      location?: string;
    }): Promise<AIVisibilityResult> {
      if (!apiKey) {
        return createUnavailableAISearchProvider("perplexity").measureQuery(input);
      }

      try {
        const res = await customFetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "Provide an accurate answer with specific local business and service citations." },
              { role: "user", content: input.query },
            ],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          throw new Error(`Perplexity API returned HTTP ${res.status}`);
        }

        const data = (await res.json()) as any;
        const answerText = data.choices?.[0]?.message?.content || "";
        const citations: string[] = data.citations || [];

        const clientDomainClean = input.clientDomain.toLowerCase().replace(/^www\./, "");
        const citedDomains = citations.map((url) => {
          try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
        }).filter(Boolean);

        const clientCited = citedDomains.some((d) => d.includes(clientDomainClean));
        const brandMentioned = answerText.toLowerCase().includes(clientDomainClean.split(".")[0]);

        const competitorCitations = input.competitorDomains.map((compDomain) => {
          const cleanComp = compDomain.toLowerCase().replace(/^www\./, "");
          const isCited = citedDomains.some((d) => d.includes(cleanComp));
          const isMentioned = answerText.toLowerCase().includes(cleanComp.split(".")[0]);
          return {
            domain: cleanComp,
            cited: isCited,
            mentioned: isMentioned,
            citedUrls: citations.filter((c) => c.includes(cleanComp)),
          };
        });

        return {
          query: input.query,
          platform: "perplexity",
          brandMentioned,
          clientCited,
          clientUrls: citations.filter((c) => c.includes(clientDomainClean)),
          citedDomains,
          competitorCitations,
          sourceCategories: ["official_website", "directory"],
          answerSummary: answerText.slice(0, 300),
          timestamp: new Date().toISOString(),
          confidence: "HIGH",
          providerStatus: "available",
        };
      } catch (err) {
        return {
          query: input.query,
          platform: "perplexity",
          brandMentioned: false,
          clientCited: false,
          clientUrls: [],
          citedDomains: [],
          competitorCitations: [],
          sourceCategories: [],
          timestamp: new Date().toISOString(),
          confidence: "LOW",
          providerStatus: "unavailable",
          providerNote: err instanceof Error ? err.message : "Live AI search probe failed",
        };
      }
    },
  };
}

/**
 * Deterministic fixture provider for automated testing and offline verification.
 */
export function createFixtureAISearchProvider(
  fixtures: Record<string, Partial<AIVisibilityResult>>,
  platform: AISearchPlatform = "chatgpt_search"
): AISearchMeasurementProvider {
  return {
    platform,
    async status(): Promise<AISearchProviderStatus> {
      return "AVAILABLE";
    },
    async measureQuery(input: {
      query: string;
      clientDomain: string;
      competitorDomains: string[];
    }): Promise<AIVisibilityResult> {
      const fixture = fixtures[input.query];
      if (fixture) {
        return {
          query: input.query,
          platform,
          brandMentioned: fixture.brandMentioned ?? false,
          clientCited: fixture.clientCited ?? false,
          clientUrls: fixture.clientUrls ?? [],
          citedDomains: fixture.citedDomains ?? [],
          competitorCitations: fixture.competitorCitations ?? [],
          sourceCategories: fixture.sourceCategories ?? ["official_website"],
          answerSummary: fixture.answerSummary || "Verified fixture response",
          timestamp: new Date().toISOString(),
          confidence: fixture.confidence ?? "HIGH",
          providerStatus: "available",
        };
      }

      return {
        query: input.query,
        platform,
        brandMentioned: false,
        clientCited: false,
        clientUrls: [],
        citedDomains: [],
        competitorCitations: input.competitorDomains.map((d) => ({
          domain: d,
          cited: false,
          mentioned: false,
          citedUrls: [],
        })),
        sourceCategories: [],
        timestamp: new Date().toISOString(),
        confidence: "MEDIUM",
        providerStatus: "available",
      };
    },
  };
}
