/** Public-facing availability — owner-friendly, not engineering status codes. */
export type ProductAvailability = "live" | "beta" | "assisted" | "coming-later";

export type ProductGroupId = "intelligence" | "growth" | "customers" | "build" | "ai-operations";

export interface ProductDefinition {
  id: string;
  name: string;
  outcome: string;
  userAction: string;
  availability: ProductAvailability;
  href: string | null;
  marketingHref?: string;
}

export interface ProductGroup {
  id: ProductGroupId;
  label: string;
  description: string;
  productIds: string[];
}
