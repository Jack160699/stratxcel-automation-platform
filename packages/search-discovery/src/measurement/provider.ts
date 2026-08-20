import { createHash } from "node:crypto";
import type {
  SearchMeasurementCapability,
  MeasurementProviderStatus,
  MeasurementQueryRequest,
  MeasurementQueryResult,
  NormalizedSerpItem,
} from "./types.ts";

export interface SearchMeasurementProvider {
  readonly name: string;
  readonly capabilities: SearchMeasurementCapability[];
  status(): Promise<MeasurementProviderStatus>;
  measureQuery(req: MeasurementQueryRequest): Promise<MeasurementQueryResult>;
}

export class MeasurementProviderUnavailableError extends Error {
  readonly status: MeasurementProviderStatus;
  constructor(status: MeasurementProviderStatus, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Creates an unavailable search measurement provider that cleanly reports status
 * and never throws unhandled errors or produces fake zero ranks.
 */
export function createUnavailableSearchMeasurementProvider(
  reason = "Live SERP measurement provider is not configured for this workspace.",
  status: MeasurementProviderStatus = "NOT_CONFIGURED",
  name = "unconfigured_serp_provider"
): SearchMeasurementProvider {
  return {
    name,
    capabilities: ["keyword_serp", "competitor_serp"],
    async status(): Promise<MeasurementProviderStatus> {
      return status;
    },
    async measureQuery(_req: MeasurementQueryRequest): Promise<MeasurementQueryResult> {
      throw new MeasurementProviderUnavailableError(status, reason);
    },
  };
}

/**
 * Live SERP Provider Adapter boundary.
 * Inspects process environment for valid live credentials.
 * If credentials are not present, it safely evaluates to NOT_CONFIGURED.
 */
export function createLiveSerpProvider(options?: {
  apiKey?: string;
  endpointUrl?: string;
  providerName?: string;
}): SearchMeasurementProvider {
  const apiKey = options?.apiKey || process.env.SERP_API_KEY || process.env.DATAFORSEO_API_KEY;
  const providerName = options?.providerName || (process.env.DATAFORSEO_API_KEY ? "dataforseo" : "serp_api");

  if (!apiKey) {
    return createUnavailableSearchMeasurementProvider(
      "Live SERP provider API key is not configured in the platform environment.",
      "NOT_CONFIGURED",
      providerName
    );
  }

  return {
    name: providerName,
    capabilities: [
      "keyword_serp",
      "local_serp",
      "competitor_serp",
      "serp_features",
      "device_breakdown",
      "geography",
    ],
    async status(): Promise<MeasurementProviderStatus> {
      return "AVAILABLE";
    },
    async measureQuery(req: MeasurementQueryRequest): Promise<MeasurementQueryResult> {
      const now = new Date().toISOString();
      const fingerprint = createHash("sha256")
        .update(`${req.query}\u001f${req.location ?? ""}\u001f${req.country ?? "IN"}\u001f${req.device ?? "desktop"}`)
        .digest("hex");

      // Provider boundary for live HTTP SERP APIs
      const endpoint = options?.endpointUrl || process.env.SERP_API_ENDPOINT || "https://api.serpapi.com/search";
      try {
        const url = new URL(endpoint);
        url.searchParams.set("q", req.query);
        if (req.location) url.searchParams.set("location", req.location);
        url.searchParams.set("gl", (req.country ?? "in").toLowerCase());
        url.searchParams.set("hl", (req.language ?? "en").toLowerCase());
        url.searchParams.set("api_key", apiKey);

        const response = await fetch(url.toString(), {
          headers: { "User-Agent": "StratXcel-Search-Growth-OS/1.0" },
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new MeasurementProviderUnavailableError("AUTH_REQUIRED", `SERP API authentication failed: HTTP ${response.status}`);
          }
          if (response.status === 429) {
            throw new MeasurementProviderUnavailableError("RATE_LIMITED", "SERP API rate limit exceeded");
          }
          throw new MeasurementProviderUnavailableError("ERROR", `SERP API error: HTTP ${response.status}`);
        }

        const data = (await response.json()) as any;
        const organicResults: any[] = data.organic_results || data.results || [];
        const clientDomainNorm = req.clientDomain.toLowerCase().replace(/^www\./, "");
        const competitorDomainsNorm = new Set((req.competitorDomains || []).map((d) => d.toLowerCase().replace(/^www\./, "")));

        let clientPosition: number | null = null;
        let clientUrl: string | null = null;

        const items: NormalizedSerpItem[] = organicResults.map((item, idx) => {
          const itemUrl = item.link || item.url || "";
          let itemDomain = "";
          try {
            itemDomain = new URL(itemUrl).hostname.toLowerCase().replace(/^www\./, "");
          } catch {
            itemDomain = "";
          }

          const isClient = Boolean(itemDomain && (itemDomain === clientDomainNorm || itemDomain.endsWith(`.${clientDomainNorm}`)));
          const isCompetitor = Boolean(itemDomain && competitorDomainsNorm.has(itemDomain));
          const position = typeof item.position === "number" ? item.position : idx + 1;

          if (isClient && clientPosition === null) {
            clientPosition = position;
            clientUrl = itemUrl;
          }

          return {
            position,
            title: String(item.title || "").slice(0, 300),
            url: itemUrl,
            domain: itemDomain,
            snippet: item.snippet ? String(item.snippet).slice(0, 500) : undefined,
            resultType: "organic",
            isClient,
            isCompetitor,
          };
        });

        return {
          query: req.query,
          location: req.location,
          country: req.country ?? "IN",
          language: req.language ?? "en",
          device: req.device ?? "desktop",
          timestamp: now,
          items,
          clientPosition,
          clientUrl,
          sourceProvider: providerName,
          queryFingerprint: fingerprint,
          rawRef: { totalResults: data.search_information?.total_results },
        };
      } catch (err) {
        if (err instanceof MeasurementProviderUnavailableError) throw err;
        throw new MeasurementProviderUnavailableError("ERROR", err instanceof Error ? err.message : "Live SERP measurement query failed");
      }
    },
  };
}

/**
 * Creates a deterministic fixture measurement provider for automated testing and grounded simulations.
 */
export function createFixtureMeasurementProvider(
  fixtures: Record<string, NormalizedSerpItem[]>
): SearchMeasurementProvider {
  return {
    name: "fixture_measurement_provider",
    capabilities: ["keyword_serp", "local_serp", "competitor_serp"],
    async status(): Promise<MeasurementProviderStatus> {
      return "AVAILABLE";
    },
    async measureQuery(req: MeasurementQueryRequest): Promise<MeasurementQueryResult> {
      const items = fixtures[req.query] || [];
      const clientDomainNorm = req.clientDomain.toLowerCase().replace(/^www\./, "");
      const competitorDomainsNorm = new Set((req.competitorDomains || []).map((d) => d.toLowerCase().replace(/^www\./, "")));

      let clientPosition: number | null = null;
      let clientUrl: string | null = null;

      const normalizedItems = items.map((item, idx) => {
        const itemDomainNorm = item.domain.toLowerCase().replace(/^www\./, "");
        const isClient = itemDomainNorm === clientDomainNorm || item.isClient;
        const isCompetitor = competitorDomainsNorm.has(itemDomainNorm) || item.isCompetitor;
        const position = item.position || idx + 1;

        if (isClient && clientPosition === null) {
          clientPosition = position;
          clientUrl = item.url;
        }

        return {
          ...item,
          position,
          isClient,
          isCompetitor,
        };
      });

      const fingerprint = createHash("sha256")
        .update(`${req.query}\u001f${req.location ?? ""}\u001f${req.country ?? "IN"}`)
        .digest("hex");

      return {
        query: req.query,
        location: req.location,
        country: req.country ?? "IN",
        language: req.language ?? "en",
        device: req.device ?? "desktop",
        timestamp: new Date().toISOString(),
        items: normalizedItems,
        clientPosition,
        clientUrl,
        sourceProvider: "fixture_measurement_provider",
        queryFingerprint: fingerprint,
      };
    },
  };
}
