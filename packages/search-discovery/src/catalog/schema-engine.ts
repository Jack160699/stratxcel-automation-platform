export interface LocalBusinessSchemaInput {
  businessName: string;
  url: string;
  telephone?: string;
  address?: {
    streetAddress?: string;
    addressLocality: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry: string;
  };
  geo?: {
    latitude: number;
    longitude: number;
  };
  openingHours?: string[];
  sameAs?: string[];
}

export interface FAQPageSchemaInput {
  faqs: Array<{
    question: string;
    answer: string;
  }>;
}

export interface ServiceSchemaInput {
  serviceName: string;
  providerName: string;
  providerUrl: string;
  description: string;
  areaServed?: string;
}

/**
 * Generates valid JSON-LD LocalBusiness schema.
 */
export function generateLocalBusinessSchema(input: LocalBusinessSchemaInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.businessName,
    url: input.url,
  };

  if (input.telephone) schema.telephone = input.telephone;

  if (input.address) {
    schema.address = {
      "@type": "PostalAddress",
      streetAddress: input.address.streetAddress || "",
      addressLocality: input.address.addressLocality,
      addressRegion: input.address.addressRegion || "",
      postalCode: input.address.postalCode || "",
      addressCountry: input.address.addressCountry || "IN",
    };
  }

  if (input.geo) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    };
  }

  if (input.openingHours && input.openingHours.length > 0) {
    schema.openingHours = input.openingHours;
  }

  if (input.sameAs && input.sameAs.length > 0) {
    schema.sameAs = input.sameAs;
  }

  return schema;
}

/**
 * Generates valid JSON-LD FAQPage schema.
 */
export function generateFAQPageSchema(input: FAQPageSchemaInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: input.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

/**
 * Generates valid JSON-LD Service schema.
 */
export function generateServiceSchema(input: ServiceSchemaInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.serviceName,
    description: input.description,
    provider: {
      "@type": "LocalBusiness",
      name: input.providerName,
      url: input.providerUrl,
    },
    areaServed: input.areaServed ? { "@type": "AdministrativeArea", name: input.areaServed } : undefined,
  };
}
