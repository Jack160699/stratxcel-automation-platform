import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, DISALLOWED_PATHS } from "@/lib/reporting/site";

/**
 * /robots.txt — allows legitimate indexing of the marketing surface and keeps
 * crawlers out of the authenticated dashboard, admin console, API routes and
 * auth flows. Nothing here is a security control (RLS and the route guards
 * are); it exists so Search Console reports a clean index rather than a pile
 * of soft-404s and redirect exclusions.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
