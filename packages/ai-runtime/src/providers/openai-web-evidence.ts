/**
 * Parse OpenAI Responses API web_search output into provider-neutral AIWebEvidence.
 * Based on current OpenAI docs:
 * - message content annotations: type=url_citation {url,title,start_index,end_index}
 * - web_search_call items with action.queries[] (current) or action.query (legacy)
 *   and optional action.sources[].url
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

type OpenAIOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{
      type?: string;
      url?: string;
      title?: string;
      start_index?: number;
      end_index?: number;
    }>;
  }>;
  action?: {
    type?: string;
    queries?: string[];
    query?: string;
    sources?: Array<{ type?: string; url?: string }>;
  };
};

export function parseOpenAIWebEvidence(json: {
  output?: OpenAIOutputItem[];
}): AIWebEvidence {
  const sources: AIWebSource[] = [];
  const citationSupports: AICitationSupport[] = [];
  const searchQueries: string[] = [];
  const seenQueries = new Set<string>();
  const urlToIndex = new Map<string, number>();

  function upsertSource(args: {
    url: string;
    title?: string;
    startIndex?: number;
    endIndex?: number;
    query?: string;
  }): number {
    const existing = urlToIndex.get(args.url);
    if (existing != null) return existing;
    const idx = sources.length;
    urlToIndex.set(args.url, idx);
    sources.push({
      id: `openai_src_${idx}`,
      url: args.url,
      title: args.title?.slice(0, 500),
      domain: domainOf(args.url),
      provider: "openai",
      startIndex: args.startIndex,
      endIndex: args.endIndex,
      searchQueries: args.query ? [args.query] : undefined,
    });
    return idx;
  }

  for (const item of json.output ?? []) {
    if (item.type === "web_search_call") {
      const queries: string[] = [];
      if (Array.isArray(item.action?.queries)) {
        for (const q of item.action?.queries ?? []) {
          if (typeof q === "string" && q.trim()) queries.push(q.trim());
        }
      }
      if (typeof item.action?.query === "string" && item.action.query.trim()) {
        queries.push(item.action.query.trim());
      }
      for (const q of queries) {
        const key = q.toLowerCase();
        if (seenQueries.has(key)) continue;
        seenQueries.add(key);
        searchQueries.push(q);
      }
      for (const src of item.action?.sources ?? []) {
        const url = safeHttpUrl(src.url);
        if (!url) continue;
        upsertSource({ url, query: queries[0] || undefined });
      }
      continue;
    }

    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      for (const ann of part.annotations ?? []) {
        if (ann.type !== "url_citation") continue;
        const url = safeHttpUrl(ann.url);
        if (!url) continue;
        const idx = upsertSource({
          url,
          title: typeof ann.title === "string" ? ann.title : undefined,
          startIndex: typeof ann.start_index === "number" ? ann.start_index : undefined,
          endIndex: typeof ann.end_index === "number" ? ann.end_index : undefined,
        });
        citationSupports.push({
          startIndex: typeof ann.start_index === "number" ? ann.start_index : undefined,
          endIndex: typeof ann.end_index === "number" ? ann.end_index : undefined,
          sourceIds: [sources[idx]!.id],
          sourceIndices: [idx],
        });
      }
    }
  }

  return {
    sources,
    citationSupports,
    searchQueries,
  };
}
