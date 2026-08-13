export type { ProductAvailability, ProductDefinition, ProductGroup, ProductGroupId } from "./types.ts";
export {
  ALL_PRODUCTS,
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_GROUPS,
  PRODUCTS,
  getProductHref,
  getProductsByGroup,
} from "./taxonomy.ts";
export type { CustomerOutcomeGroup, CustomerOutcomeGroupId, CustomerProductPresentation } from "./customer-language.ts";
export {
  CUSTOMER_OUTCOME_GROUPS,
  CUSTOMER_PRODUCT_PRESENTATION,
  CUSTOMER_VALUE_PROPS,
  HOMEPAGE_FEATURED_PRODUCT_IDS,
  getAllCustomerOutcomeProductIds,
  getCustomerPresentation,
  getCustomerPresentationForProduct,
  getFeaturedHomepageProducts,
  getProductsByCustomerOutcomeGroup,
} from "./customer-language.ts";
