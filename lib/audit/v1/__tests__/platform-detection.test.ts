// Run with: node --experimental-strip-types lib/audit/v1/__tests__/platform-detection.test.ts
import assert from "node:assert/strict";
import { detectWebsitePlatform } from "../platform-detection.ts";

console.log("Running StratXcel Website Platform Detection Test Suite...\n");

function mockFetcher(headers: Record<string, string>, html: string): typeof fetch {
  return (async () => ({
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? headers[k] ?? null },
    text: async () => html,
  })) as unknown as typeof fetch;
}

async function run() {
  // --- 1. Header-based detection (high confidence) ------------------------
  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: mockFetcher({ "x-vercel-id": "bom1::abcde-123" }, "<html></html>"),
    });
    assert.equal(result.platform, "vercel");
    assert.equal(result.confidence, "high");
    assert.ok(result.detectionSource.includes("header:x-vercel-id"));
  }

  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: mockFetcher({ "x-nf-request-id": "abc123" }, "<html></html>"),
    });
    assert.equal(result.platform, "netlify");
    assert.equal(result.confidence, "high");
  }

  // --- 2. HTML fingerprint detection (medium confidence) -------------------
  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: mockFetcher({}, '<html><head><link rel="stylesheet" href="https://cdn.shopify.com/s/files/1/theme.css"></head></html>'),
    });
    assert.equal(result.platform, "shopify");
    assert.equal(result.confidence, "medium");
  }

  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: mockFetcher({}, '<html><body class="wp-content"><script src="/wp-includes/js/jquery.js"></script></body></html>'),
    });
    assert.equal(result.platform, "wordpress");
  }

  // --- 3. A high-confidence header signal wins over a lower-confidence
  //        HTML signal for a different platform (e.g. a Shopify storefront
  //        that also references a generic CDN asset matched by mistake). --
  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: mockFetcher(
        { "x-shopify-stage": "production" },
        '<html><script src="https://assets-global.website-files.com/x.js"></script></html>'
      ),
    });
    assert.equal(result.platform, "shopify", "the high-confidence header signal must win over a lower-confidence HTML match for a different platform");
    assert.equal(result.confidence, "high");
  }

  // --- 4. No signals at all -- must honestly report unknown, never guess. -
  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: mockFetcher({}, "<html><body>Just a plain static page</body></html>"),
    });
    assert.equal(result.platform, "unknown");
    assert.equal(result.confidence, "none");
    assert.deepEqual(result.detectionSource, []);
  }

  // --- 5. Unreachable/unsafe URL -- never throws, never blocks the caller.
  {
    const result = await detectWebsitePlatform("not a url at all", {});
    assert.equal(result.platform, "unknown");
    assert.equal(result.confidence, "none");
    assert.ok(result.error, "an unreachable/invalid URL must report a real error, not silently succeed as unknown");
  }

  {
    const result = await detectWebsitePlatform("https://example.com", {
      fetcher: (async () => {
        throw new Error("simulated network failure");
      }) as unknown as typeof fetch,
    });
    assert.equal(result.platform, "unknown");
    assert.equal(result.confidence, "none");
    assert.ok(result.error);
  }

  console.log("✓ Platform detection: header rules, HTML fingerprints, precedence, and honest-unknown fallback all verified");
}

await run();

console.log("\n===============================================");
console.log("ALL WEBSITE PLATFORM DETECTION TESTS PASSED!");
console.log("===============================================");
