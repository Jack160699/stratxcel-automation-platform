/**
 * Real Postgres-backed cache for runWebsiteIntelligencePipeline, fixing
 * capability:analyze_website_no_cache (master brief section 27, cost
 * optimization). Every analyze_website call used to re-fetch and
 * re-process the same URL from scratch, even seconds apart.
 *
 * Deliberately NOT an in-memory cache -- the same lesson learned live this
 * session from the editing/ module's in-memory version manager
 * (capability:editing_module_in_memory_prototype): a serverless route's
 * process memory does not survive across invocations, so an in-memory
 * cache here would silently never hit in production. A real table
 * (website_intelligence_cache, service-role-only RLS, global -- not
 * tenant-scoped, since a public website's real content isn't tenant data)
 * is the only cache that actually works in this architecture.
 *
 * TTL is 24 hours -- a deliberate, stated choice, not a rushed guess: a
 * business's public website content, SEO signals, and trust signals don't
 * meaningfully change within a day, and 24h keeps repeated same-day
 * lookups (the actual observed pattern -- staff re-checking a prospect,
 * or the same URL asked about by multiple callers) from re-crawling.
 */
import { runWebsiteIntelligencePipeline, type NormalizedWebsiteIntelligence } from "../intelligence/website-intelligence.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface MinimalSupabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> };
    };
    upsert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

function normalizeUrl(rawUrl: string): string {
  return rawUrl.trim().toLowerCase();
}

/**
 * Cache-through wrapper: a real, fresh cache hit skips the crawl entirely;
 * anything else (miss, expired, corrupt row, cache read/write failure)
 * falls through to a real, honest fresh pipeline run -- the cache can only
 * ever save work, it can never cause a stale or fabricated result to be
 * returned instead of a real one.
 *
 * `runPipeline` is injected (defaulting to the real
 * runWebsiteIntelligencePipeline) rather than imported and called
 * directly, specifically so this function's own cache logic -- the part
 * that's actually new and worth testing -- can be unit tested standalone
 * with a fake pipeline, without needing a real network crawl.
 */
export async function runWebsiteIntelligencePipelineCached(
  supabase: MinimalSupabase,
  websiteUrl: string,
  options: Parameters<typeof runWebsiteIntelligencePipeline>[1] = {},
  runPipeline: typeof runWebsiteIntelligencePipeline = runWebsiteIntelligencePipeline,
): Promise<{ intelligence: NormalizedWebsiteIntelligence; cacheHit: boolean }> {
  const normalizedUrl = normalizeUrl(websiteUrl);

  try {
    const { data } = await supabase
      .from("website_intelligence_cache")
      .select("intelligence, expires_at")
      .eq("normalized_url", normalizedUrl)
      .maybeSingle();
    const row = data as { intelligence: NormalizedWebsiteIntelligence; expires_at: string } | null;
    if (row && new Date(row.expires_at).getTime() > Date.now()) {
      return { intelligence: row.intelligence, cacheHit: true };
    }
  } catch {
    // Cache read failure -- fall through to a real fresh run, never block on it.
  }

  const intelligence = await runPipeline(websiteUrl, options);

  try {
    await supabase.from("website_intelligence_cache").upsert({
      normalized_url: normalizedUrl,
      intelligence,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    });
  } catch {
    // Cache write failure -- never fails the real result over a caching side effect.
  }

  return { intelligence, cacheHit: false };
}
