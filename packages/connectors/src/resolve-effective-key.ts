import type { ServiceClient } from "./db.ts";
import { getConnectorConnection } from "./repository.ts";
import { resolveEffectiveConnectorSecret } from "./health.ts";

interface CacheEntry {
  key: string | undefined;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutes -- long enough that the hot AI-completion path never pays a DB round-trip per call, short enough that a newly-connected/rotated/revoked key takes effect promptly.
const cache = new Map<string, CacheEntry>();

/**
 * The real composition-root primitive for Section 20/21 ("ensure the
 * resource can actually be SELECTED by the AI runtime when configured,"
 * "preserve dependency direction, avoid circular package dependencies"):
 * resolves the effective platform-level API key for a Connector Control
 * Plane connector (gemini/openrouter today), falling back to the existing
 * env var when nothing is connected -- so wiring this into a real AI
 * provider constructor is a strict superset of today's behavior, never a
 * regression, and CANNOT be a circular dependency (this lives in
 * @stratxcel/connectors, which the calling app code depends on directly;
 * @stratxcel/ai-runtime itself never imports this).
 *
 * Deliberately cached (DEFAULT_TTL_MS) and fail-open: this is meant to sit
 * on the single highest-traffic code path in the product (every AI
 * completion, across WhatsApp/Admin Copilot/Hermes alike) -- an
 * uncached DB round-trip per call, or a connector-lookup failure ever
 * blocking a real AI response, would both be a strictly worse outcome
 * than just using the env var, which is why every failure mode here
 * degrades silently to envFallback rather than throwing.
 */
export async function resolveCachedPlatformConnectorSecret(
  supabase: ServiceClient,
  connectorKey: string,
  envFallback: string | undefined,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<string | undefined> {
  const cached = cache.get(connectorKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.key ?? envFallback;

  try {
    const connection = await getConnectorConnection(supabase, connectorKey, null);
    const resolved = await resolveEffectiveConnectorSecret(supabase, connectorKey, connection, envFallback);
    cache.set(connectorKey, { key: resolved, expiresAt: now + ttlMs });
    return resolved;
  } catch {
    // Fail open: never let a connector-resolution failure break a real AI
    // call that would otherwise have worked via the env var. Cache the
    // fallback briefly too, so a persistent failure doesn't retry the DB
    // on every single request.
    cache.set(connectorKey, { key: envFallback, expiresAt: now + Math.min(ttlMs, 30_000) });
    return envFallback;
  }
}

/** Test-only: clears the module-level cache between test runs. */
export function resetConnectorSecretCacheForTests(): void {
  cache.clear();
}
