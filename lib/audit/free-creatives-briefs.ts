import type { CanonicalBrandContext } from "@stratxcel/brand-brain";

/**
 * Pure logic split out of free-creatives.ts so it's directly, standalone
 * testable with plain `node` -- free-creatives.ts itself imports `after`
 * from "next/server", which only resolves inside a real Next.js build/dev
 * process, not plain node (same reason every other Next-coupled
 * server-only module in this codebase keeps its pure logic in its own
 * file). Final Customer Experience Repair mission, Section 2.
 */

export const FREE_CREATIVES_SOURCE_ID = "free_audit_creatives";

export interface FreeCreativeBrief {
  key: "business" | "offer" | "educational";
  label: string;
  brief: string;
}

/**
 * Builds the 3 real, distinct briefs from the tenant's own real Brand Brain
 * data. Never invents a service/offer: when no real active service exists,
 * the "offer" brief stays generically about the business itself (name/
 * industry only), never a specific fabricated service.
 */
export function buildFreeCreativeBriefs(brand: CanonicalBrandContext): FreeCreativeBrief[] {
  const name = brand.businessName?.trim();
  if (!name) return [];
  const industry = brand.industry?.trim();
  const about = brand.description?.trim() || brand.highlights?.filter(Boolean).join(". ") || "";
  const topService = brand.services?.[0];

  const briefs: FreeCreativeBrief[] = [
    {
      key: "business",
      label: "Business & Brand",
      brief: [
        `A polished, branded promotional social graphic introducing "${name}"${industry ? `, a ${industry} business` : ""}${brand.location ? ` in ${brand.location}` : ""}.`,
        about ? `Real business context: ${about}.` : "",
        "Professional, trustworthy tone. This is the business's own brand identity post, not a specific service or offer.",
      ].filter(Boolean).join(" "),
    },
    {
      key: "offer",
      label: topService ? "Service & Offer" : "What We Do",
      brief: topService
        ? [
            `A promotional social graphic for "${name}" highlighting their real service "${topService.name}"${topService.shortDescription ? `: ${topService.shortDescription}` : ""}.`,
            topService.startingPrice ? `Starting price: ${topService.startingPrice}.` : "",
            "Include a clear call to action to get in touch. Never invent details about this service beyond what's stated here.",
          ].filter(Boolean).join(" ")
        : [
            `A promotional social graphic for "${name}"${industry ? `, a ${industry} business` : ""} inviting customers to get in touch to learn more about what they offer.`,
            "Do not invent or name any specific service, price, or offer that wasn't given -- keep this general to the business itself.",
          ].join(" "),
    },
    {
      key: "educational",
      label: "Educational & Engagement",
      brief: [
        `An educational, engaging social post sharing one genuinely useful, general tip relevant to${industry ? ` the ${industry} industry` : " this business's industry"}, posted from the perspective of "${name}".`,
        "Approachable, helpful tone. Do not make any specific factual claim about this exact business beyond its name -- this is a general educational tip, not a business claim.",
      ].join(" "),
    },
  ];
  return briefs;
}
