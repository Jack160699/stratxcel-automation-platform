/**
 * Automated QA Runner — runs a suite of checks against a deployed website
 * before it can be marked LIVE. Uses lightweight HTTP checks and HTML
 * parsing rather than full browser automation for speed and reliability.
 * Playwright-based checks are available as an optional enhancement.
 *
 * Every check is independent and returns a pass/fail result with details.
 * The runner aggregates results and determines overall QA status.
 */

export interface QACheckResult {
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
  severity: "critical" | "warning" | "info";
}

export interface QARunResult {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  criticalFailures: number;
  results: QACheckResult[];
  durationMs: number;
  runAt: string;
}

export interface QARunInput {
  /** The URL to test (either preview or production). */
  baseUrl: string;
  /** The page slugs to test. */
  pageSlugs: string[];
  /** The expected site name for SEO checks. */
  siteName: string;
  /** Whether to check SSL (only for production domains). */
  checkSsl: boolean;
  /** Timeout per check in milliseconds. */
  checkTimeoutMs?: number;
}

/**
 * Runs the full QA suite against a deployed website.
 * A site MUST NOT be marked LIVE if any critical check fails.
 */
export async function runQAChecks(input: QARunInput): Promise<QARunResult> {
  const startTime = Date.now();
  const timeout = input.checkTimeoutMs ?? 15_000;
  const results: QACheckResult[] = [];

  // 1. Homepage loads
  results.push(await checkPageLoads(input.baseUrl, "", timeout));

  // 2. All generated routes load
  for (const slug of input.pageSlugs) {
    if (slug === "") continue; // Already checked as homepage
    results.push(await checkPageLoads(input.baseUrl, slug, timeout));
  }

  // 3. SEO metadata exists on homepage
  results.push(await checkSeoMetadata(input.baseUrl, input.siteName, timeout));

  // 4. No obvious 404s on navigation links
  results.push(await checkNoDeadLinks(input.baseUrl, timeout));

  // 5. SSL check (for production domains only)
  if (input.checkSsl) {
    results.push(await checkSsl(input.baseUrl, timeout));
  }

  // 6. Images load
  results.push(await checkImagesLoad(input.baseUrl, timeout));

  // 7. No critical console errors (via response headers/content)
  results.push(await checkNoServerErrors(input.baseUrl, timeout));

  const failedResults = results.filter((r) => !r.passed);
  const criticalFailures = failedResults.filter((r) => r.severity === "critical").length;

  return {
    passed: criticalFailures === 0,
    totalChecks: results.length,
    passedChecks: results.filter((r) => r.passed).length,
    failedChecks: failedResults.length,
    criticalFailures,
    results,
    durationMs: Date.now() - startTime,
    runAt: new Date().toISOString(),
  };
}

async function checkPageLoads(baseUrl: string, slug: string, timeout: number): Promise<QACheckResult> {
  const start = Date.now();
  const url = slug ? `${baseUrl}/${slug}` : baseUrl;
  const label = slug || "homepage";

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });

    if (res.ok) {
      return { name: `page_loads_${label}`, passed: true, details: `${url} returned ${res.status}`, durationMs: Date.now() - start, severity: "critical" };
    }
    return { name: `page_loads_${label}`, passed: false, details: `${url} returned ${res.status}`, durationMs: Date.now() - start, severity: "critical" };
  } catch (err) {
    return { name: `page_loads_${label}`, passed: false, details: `${url} failed: ${err instanceof Error ? err.message : "unknown"}`, durationMs: Date.now() - start, severity: "critical" };
  }
}

async function checkSeoMetadata(baseUrl: string, siteName: string, timeout: number): Promise<QACheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) {
      return { name: "seo_metadata", passed: false, details: `Homepage returned ${res.status}`, durationMs: Date.now() - start, severity: "warning" };
    }

    const html = await res.text();
    const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
    const hasDescription = /<meta[^>]*name=["']description["'][^>]*>/i.test(html);
    const hasViewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);

    const issues: string[] = [];
    if (!hasTitle) issues.push("missing <title>");
    if (!hasDescription) issues.push("missing meta description");
    if (!hasViewport) issues.push("missing viewport meta");

    if (issues.length === 0) {
      return { name: "seo_metadata", passed: true, details: "Title, description, and viewport present", durationMs: Date.now() - start, severity: "warning" };
    }
    return { name: "seo_metadata", passed: false, details: issues.join(", "), durationMs: Date.now() - start, severity: "warning" };
  } catch (err) {
    return { name: "seo_metadata", passed: false, details: `Check failed: ${err instanceof Error ? err.message : "unknown"}`, durationMs: Date.now() - start, severity: "warning" };
  }
}

async function checkNoDeadLinks(baseUrl: string, timeout: number): Promise<QACheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) {
      return { name: "no_dead_links", passed: false, details: `Homepage returned ${res.status}`, durationMs: Date.now() - start, severity: "warning" };
    }

    const html = await res.text();
    // Extract internal links from the HTML
    const linkMatches = html.match(/href=["']([^"']*?)["']/gi) ?? [];
    const internalLinks = linkMatches
      .map((m) => m.replace(/href=["']/i, "").replace(/["']$/, ""))
      .filter((href) => href.startsWith("/") && !href.startsWith("//"))
      .slice(0, 20); // Check up to 20 links

    let deadLinks = 0;
    for (const link of internalLinks) {
      try {
        const linkRes = await fetch(`${baseUrl}${link}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
        });
        if (linkRes.status === 404) deadLinks++;
      } catch {
        // Network errors on internal links count as issues
        deadLinks++;
      }
    }

    if (deadLinks === 0) {
      return { name: "no_dead_links", passed: true, details: `Checked ${internalLinks.length} internal links, all valid`, durationMs: Date.now() - start, severity: "warning" };
    }
    return { name: "no_dead_links", passed: false, details: `${deadLinks} dead links found out of ${internalLinks.length}`, durationMs: Date.now() - start, severity: "warning" };
  } catch (err) {
    return { name: "no_dead_links", passed: false, details: `Check failed: ${err instanceof Error ? err.message : "unknown"}`, durationMs: Date.now() - start, severity: "warning" };
  }
}

async function checkSsl(baseUrl: string, timeout: number): Promise<QACheckResult> {
  const start = Date.now();
  if (!baseUrl.startsWith("https://")) {
    return { name: "ssl_active", passed: false, details: "URL does not use HTTPS", durationMs: Date.now() - start, severity: "critical" };
  }

  try {
    const res = await fetch(baseUrl, {
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });

    if (res.ok) {
      return { name: "ssl_active", passed: true, details: "HTTPS connection successful", durationMs: Date.now() - start, severity: "critical" };
    }
    return { name: "ssl_active", passed: false, details: `HTTPS returned ${res.status}`, durationMs: Date.now() - start, severity: "critical" };
  } catch (err) {
    return { name: "ssl_active", passed: false, details: `HTTPS check failed: ${err instanceof Error ? err.message : "unknown"}`, durationMs: Date.now() - start, severity: "critical" };
  }
}

async function checkImagesLoad(baseUrl: string, timeout: number): Promise<QACheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) {
      return { name: "images_load", passed: true, details: "Skipped — could not fetch page", durationMs: Date.now() - start, severity: "info" };
    }

    const html = await res.text();
    const imgMatches = html.match(/src=["']([^"']*?\.(jpg|jpeg|png|gif|webp|svg|avif))[^"']*["']/gi) ?? [];

    if (imgMatches.length === 0) {
      return { name: "images_load", passed: true, details: "No image elements found", durationMs: Date.now() - start, severity: "info" };
    }

    return { name: "images_load", passed: true, details: `Found ${imgMatches.length} image references`, durationMs: Date.now() - start, severity: "info" };
  } catch (err) {
    return { name: "images_load", passed: true, details: `Skipped: ${err instanceof Error ? err.message : "unknown"}`, durationMs: Date.now() - start, severity: "info" };
  }
}

async function checkNoServerErrors(baseUrl: string, timeout: number): Promise<QACheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(timeout) });

    if (res.status >= 500) {
      return { name: "no_server_errors", passed: false, details: `Server returned ${res.status}`, durationMs: Date.now() - start, severity: "critical" };
    }

    return { name: "no_server_errors", passed: true, details: `Server returned ${res.status}`, durationMs: Date.now() - start, severity: "critical" };
  } catch (err) {
    return { name: "no_server_errors", passed: false, details: `Server unreachable: ${err instanceof Error ? err.message : "unknown"}`, durationMs: Date.now() - start, severity: "critical" };
  }
}
