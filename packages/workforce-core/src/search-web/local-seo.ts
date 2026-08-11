import type { LocalSeoRecommendation } from "./types.ts";

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildLocalSeoRecommendation(input: {
  tenantId: string;
  services: readonly string[];
  cities: readonly string[];
  nap?: {
    name?: string;
    address?: string;
    phone?: string;
    websiteName?: string;
    websiteAddress?: string;
    websitePhone?: string;
  };
  /** Only true when a real GBP connection exists. */
  gbpConnected?: boolean;
}): LocalSeoRecommendation {
  const gbpConnected = input.gbpConnected === true;
  const serviceCityPages = input.services.flatMap((service) =>
    input.cities.map((city) => ({
      service,
      city,
      suggestedPath: `/${slugify(service)}-${slugify(city)}`,
    })),
  );

  const napNotes: string[] = [];
  const nap = input.nap;
  if (nap) {
    if (nap.name && nap.websiteName && nap.name !== nap.websiteName) {
      napNotes.push("Business name mismatch between NAP and website — align exactly");
    }
    if (nap.address && nap.websiteAddress && nap.address !== nap.websiteAddress) {
      napNotes.push("Address mismatch between NAP and website — align exactly");
    }
    if (nap.phone && nap.websitePhone && nap.phone !== nap.websitePhone) {
      napNotes.push("Phone mismatch between NAP and website — align exactly");
    }
    if (!nap.address || !nap.phone || !nap.name) {
      napNotes.push("Complete NAP (name, address, phone) before local landing pushes");
    }
  } else {
    napNotes.push("Collect verified NAP details before claiming local consistency");
  }

  return {
    kind: "local_seo_recommendation",
    id: `local_seo_recommendation_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    serviceCityPages,
    napNotes,
    gbpConnected,
    gbpRecommendation: gbpConnected
      ? undefined
      : "Connect Google Business Profile when ready — not claimed connected until verified",
  };
}
