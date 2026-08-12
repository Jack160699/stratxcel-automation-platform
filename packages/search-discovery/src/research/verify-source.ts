/**
 * Bounded optional verification fetch for strongest grounded sources.
 * Uses existing SSRF protections; never stores full pages.
 */
import { lookup } from "node:dns/promises";
import { assertResearchFetchTarget, normalizeResearchUrl } from "./normalize.ts";
import { contentHash, safeExcerpt } from "./evidence.ts";
import type { ResearchSource, SourceVerificationStatus } from "./types.ts";
import { RESEARCH_BOUNDS } from "./types.ts";

export interface VerifySourceOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetcher?: typeof fetch;
  resolver?: typeof lookup;
}

const ALLOWED_TYPES = /^(text\/html|text\/plain|application\/xhtml\+xml)/i;

async function readBodyWithCap(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, maxBytes);
  }
  if (signal?.aborted) {
    throw Object.assign(new Error("Aborted"), { name: "AbortError" });
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort);
  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      }
      const next = await reader.read();
      if (next.done) break;
      const value = next.value;
      if (!value) continue;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // already released/cancelled
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function verifyResearchSource(
  source: ResearchSource,
  options: VerifySourceOptions = {},
): Promise<ResearchSource> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxBytes = options.maxBytes ?? 200_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const fetcher = options.fetcher ?? fetch;
  const resolver = options.resolver ?? lookup;

  let verification: SourceVerificationStatus = "unavailable";
  let excerpt = source.excerpt;
  let hash = source.contentHash;
  let title = source.title;

  try {
    let current = await assertResearchFetchTarget(source.canonicalUrl, resolver);
    let redirects = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(current.href, {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: "text/html,text/plain",
            "User-Agent": "StratxcelResearchVerify/1.0 (+https://stratxcel.in/support)",
          },
          signal: controller.signal,
          // Never forward credentials/cookies.
          credentials: "omit" as RequestCredentials,
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirects >= maxRedirects) {
            verification = "unavailable";
            break;
          }
          redirects += 1;
          current = await assertResearchFetchTarget(new URL(location, current).href, resolver);
          continue;
        }

        const type = response.headers.get("content-type") ?? "";
        if (!ALLOWED_TYPES.test(type)) {
          verification = "blocked";
          break;
        }
        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > maxBytes) {
          verification = "blocked";
          break;
        }
        // Timeout remains active through body streaming.
        const body = await readBodyWithCap(response, maxBytes, controller.signal);
        if (controller.signal.aborted) {
          throw Object.assign(new Error("Aborted"), { name: "AbortError" });
        }
        const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
        if (titleMatch?.[1] && !title) {
          title = titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 300);
        }
        const textish = body
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");
        excerpt = safeExcerpt(textish, RESEARCH_BOUNDS.maxExcerptChars);
        hash = contentHash(excerpt);
        verification = response.ok ? "verified" : "unavailable";
        break;
      } catch {
        verification = "unavailable";
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    verification = "unavailable";
  }

  // Keep citation even when verification fails.
  const normalized = normalizeResearchUrl(source.canonicalUrl);
  return {
    ...source,
    ...normalized,
    title,
    excerpt,
    contentHash: hash,
    verification,
  };
}

export async function verifyTopSources(
  sources: readonly ResearchSource[],
  maxFetches: number,
  options?: VerifySourceOptions,
): Promise<ResearchSource[]> {
  const limit = Math.min(
    Math.max(0, maxFetches),
    RESEARCH_BOUNDS.maxVerifiedFetchesHard,
  );
  const out: ResearchSource[] = [];
  let fetches = 0;
  for (const source of sources) {
    if (fetches < limit) {
      out.push(await verifyResearchSource(source, options));
      fetches += 1;
    } else {
      out.push({ ...source, verification: source.verification ?? "skipped" });
    }
  }
  return out;
}
