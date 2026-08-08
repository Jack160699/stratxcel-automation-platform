import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/admin/", "/api/", "/payment/"],
    },
    sitemap: "https://www.stratxcel.in/sitemap.xml",
    host: "https://www.stratxcel.in",
  };
}
