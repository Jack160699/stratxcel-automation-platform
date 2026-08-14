/**
 * Canonical public site surface — the single source of truth for
 * app/sitemap.ts and app/robots.ts.
 *
 * `stratxcel.in` 307-redirects to `https://www.stratxcel.in`, so www is the
 * canonical host and the only host that may appear in a sitemap. It matches
 * `metadataBase` in app/layout.tsx.
 *
 * PUBLIC_ROUTES lists only V1 customer-facing acquisition/trust content.
 * Deliberately excluded:
 *
 *  - /audit, and everything under /app and /admin — authenticated. /audit
 *    redirects to /login?next=/app/audit, so advertising it would publish an
 *    authenticated destination and earn a "Page with redirect" exclusion in
 *    Search Console.
 *  - /use-cases — compatibility route that redirects to /solutions
 *    (see lib/rbac/__tests__/public-marketing-pages.test.ts).
 *    Sitemaps must list the redirect target, never the redirect.
 *  - /modules — compatibility route that redirects to /products.
 *  - /login, /signup, /forgot-password, /reset-password — auth entry points
 *    with no indexable content.
 *  - /agents and /system — internal architecture pages; not part of the V1
 *    public story. They redirect to V1 content in Stable mode.
 *  - /work — no genuine published proof yet; do not index placeholders.
 */

export const CANONICAL_ORIGIN = "https://www.stratxcel.in";

export interface PublicRoute {
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "", changeFrequency: "weekly", priority: 1.0 },
  { path: "/ai-business-agent", changeFrequency: "weekly", priority: 0.95 },
  { path: "/ai-workforce", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-seo-agent", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-social-media-agent", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-website-agent", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-content-agent", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-crm-agent", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-marketing-agent", changeFrequency: "weekly", priority: 0.9 },
  { path: "/ai-business-automation", changeFrequency: "weekly", priority: 0.9 },
  { path: "/products", changeFrequency: "weekly", priority: 0.9 },
  { path: "/solutions", changeFrequency: "weekly", priority: 0.9 },
  { path: "/social-autopilot", changeFrequency: "weekly", priority: 0.9 },
  { path: "/integrations", changeFrequency: "monthly", priority: 0.75 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.8 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/security", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/data-deletion", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Paths crawlers must not index, written exactly as they go into robots.txt.
 *
 * robots.txt matching is literal prefix matching, which makes the trailing
 * slash load-bearing in both directions:
 *
 *  - Section roots keep it. `Disallow: /app/` must not become `/app`, which
 *    would also match the `/apple-icon.png` favicon asset.
 *  - Single pages must not have it. `/audit/` would fail to match `/audit`
 *    itself — the very URL that redirects into the authenticated dashboard.
 */
export const DISALLOWED_PATHS = [
  // Authenticated / machine sections.
  "/admin/",
  "/app/",
  "/api/",
  "/auth/",
  "/payment/",
  // Single pages: authenticated entry point and auth flows.
  "/audit",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  // V2 / internal architecture — not Stable public acquisition content.
  "/agents",
  "/system",
];
