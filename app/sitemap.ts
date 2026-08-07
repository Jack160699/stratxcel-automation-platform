import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, PUBLIC_ROUTES } from "@/lib/reporting/site";

/**
 * Public sitemap at /sitemap.xml — the URL submitted to Google Search Console.
 * Route inventory and the canonical origin live in lib/reporting/site.ts so
 * robots.ts cannot drift from it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${CANONICAL_ORIGIN}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
