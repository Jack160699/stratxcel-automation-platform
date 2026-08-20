/**
 * Research & Web Search Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface SearchQueryInput {
  query: string;
  maxResults?: number;
  country?: string;
}

export interface SearchCitation {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
}

export interface SearchResult {
  query: string;
  citations: SearchCitation[];
  extractedSummary: string;
  provider: string;
}

export interface ResearchProvider {
  name: string;
  search: (input: SearchQueryInput) => Promise<SearchResult>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockResearchProvider implements ResearchProvider {
  public name = "mock_research";

  public async search(input: SearchQueryInput): Promise<SearchResult> {
    return {
      query: input.query,
      citations: [
        {
          title: `Market Trends for ${input.query}`,
          url: "https://example.com/insights",
          snippet: `Comprehensive overview and competitive intelligence for ${input.query}.`,
          confidence: 0.95,
        },
      ],
      extractedSummary: `Market research indicates strong consumer interest and premium demand in ${input.query}.`,
      provider: this.name,
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "research",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockResearchProvider = new MockResearchProvider();
