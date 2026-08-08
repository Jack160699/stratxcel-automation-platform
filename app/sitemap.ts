import type { MetadataRoute } from "next";

const PUBLIC_ROUTES = [
  "", "/about", "/acceptable-use", "/agents", "/audit", "/contact", "/data-deletion",
  "/data-processing-terms", "/domain-website-terms", "/experience", "/how-it-works", "/modules",
  "/pricing", "/privacy", "/products", "/refund-cancellation", "/security", "/social-autopilot",
  "/solutions", "/support", "/system", "/terms", "/third-party-providers", "/use-cases",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `https://www.stratxcel.in${route}`,
    changeFrequency: route === "" || route === "/pricing" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/pricing" || route === "/audit" ? 0.9 : 0.7,
  }));
}
