import { getCustomerTypeBySlug, PUBLISHED_CUSTOMER_TYPES } from "./customer-types.ts";
import { getLocalBusinessVerticalBySlug, PUBLISHED_LOCAL_BUSINESS_VERTICALS } from "./local-business-verticals.ts";

export type SolutionPage =
  | { kind: "customer-type"; slug: string }
  | { kind: "local-business-vertical"; slug: string };

export function resolveSolutionPage(slug: string): SolutionPage | null {
  const vertical = getLocalBusinessVerticalBySlug(slug);
  if (vertical?.published) {
    return { kind: "local-business-vertical", slug: vertical.slug };
  }

  const customerType = getCustomerTypeBySlug(slug);
  if (customerType?.published) {
    return { kind: "customer-type", slug: customerType.slug };
  }

  return null;
}

export function getSolutionPageRecord(slug: string) {
  const resolved = resolveSolutionPage(slug);
  if (!resolved) return null;
  if (resolved.kind === "local-business-vertical") {
    return { kind: resolved.kind, data: getLocalBusinessVerticalBySlug(slug)! };
  }
  return { kind: resolved.kind, data: getCustomerTypeBySlug(slug)! };
}

const verticalSlugSet = new Set<string>(PUBLISHED_LOCAL_BUSINESS_VERTICALS.map((v) => v.slug));

export function getPublishedSolutionSlugs(): string[] {
  const verticalSlugs = PUBLISHED_LOCAL_BUSINESS_VERTICALS.map((v) => v.slug);
  const customerSlugs = PUBLISHED_CUSTOMER_TYPES.map((c) => c.slug).filter((slug) => !verticalSlugSet.has(slug));
  return [...verticalSlugs, ...customerSlugs];
}
