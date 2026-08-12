/**
 * Parse Gemini generateContent groundingMetadata into provider-neutral AIWebEvidence.
 * Based on current Google Gemini Grounding with Google Search docs:
 * groundingChunks[].web.{uri,title}, groundingSupports[].{segment,groundingChunkIndices},
 * webSearchQueries, searchEntryPoint (attribution only — never render HTML).
 */
import type { AICitationSupport, AIWebEvidence, AIWebSource } from "../types.ts";

const MAX_URL_LEN = 2048;

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim().slice(0, MAX_URL_LEN);
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function parseGeminiGroundingMetadata(
  groundingMetadata: unknown,
  opts?: { retrievedAt?: string },
): AIWebEvidence {
  const empty: AIWebEvidence = {
    sources: [],
    citationSupports: [],
    searchQueries: [],
  };
  if (!groundingMetadata || typeof groundingMetadata !== "object") return empty;

  const meta = groundingMetadata as Record<string, unknown>;
  const searchQueries = Array.isArray(meta.webSearchQueries)
    ? meta.webSearchQueries.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    : [];

  const sources: AIWebSource[] = [];
  const chunkIndexToSourceId = new Map<number, string>();
  const chunks = Array.isArray(meta.groundingChunks) ? meta.groundingChunks : [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk || typeof chunk !== "object") continue;
    const web = (chunk as { web?: { uri?: unknown; title?: unknown } }).web;
    const uri = safeHttpUrl(web?.uri);
    if (!uri) continue;
    const title = typeof web?.title === "string" ? web.title.slice(0, 500) : undefined;
    const id = `gemini_src_${i}`;
    sources.push({
      id,
      providerSourceId: String(i),
      url: uri,
      title,
      domain: domainOf(uri),
      provider: "google",
      searchQueries: searchQueries.length ? searchQueries : undefined,
    });
    chunkIndexToSourceId.set(i, id);
  }

  const citationSupports: AICitationSupport[] = [];
  const sourceIndexMap = new Map(sources.map((src, idx) => [src.id, idx]));
  const supports = Array.isArray(meta.groundingSupports) ? meta.groundingSupports : [];
  for (const support of supports) {
    if (!support || typeof support !== "object") continue;
    const s = support as {
      segment?: { text?: unknown; startIndex?: unknown; endIndex?: unknown };
      groundingChunkIndices?: unknown;
    };
    const indices = Array.isArray(s.groundingChunkIndices)
      ? s.groundingChunkIndices.filter(
          (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0,
        )
      : [];
    const sourceIds = indices
      .map((idx) => chunkIndexToSourceId.get(idx))
      .filter((id): id is string => Boolean(id));
    if (sourceIds.length === 0) continue;
    const sourceIndices = sourceIds
      .map((id) => sourceIndexMap.get(id))
      .filter((idx): idx is number => typeof idx === "number");
    citationSupports.push({
      text: typeof s.segment?.text === "string" ? s.segment.text.slice(0, 2000) : undefined,
      startIndex: typeof s.segment?.startIndex === "number" ? s.segment.startIndex : undefined,
      endIndex: typeof s.segment?.endIndex === "number" ? s.segment.endIndex : undefined,
      sourceIds,
      sourceIndices,
    });
  }

  let searchAttribution: AIWebEvidence["searchAttribution"];
  const entry = meta.searchEntryPoint;
  if (entry && typeof entry === "object") {
    const rendered = (entry as { renderedContent?: unknown }).renderedContent;
    if (typeof rendered === "string" && rendered.length > 0) {
      searchAttribution = {
        hasSearchEntryPoint: true,
        renderedContentLength: rendered.length,
      };
    }
  }

  void opts;
  return {
    sources,
    citationSupports,
    searchQueries,
    searchAttribution,
  };
}
