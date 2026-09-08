/**
 * The single canonical "Type of business" list StepBusiness.tsx's dropdown
 * renders. Exported here (rather than defined inline in that client
 * component) so the server-side intelligence engine can map a discovered
 * Google Places category into a value this exact dropdown actually has an
 * <option> for -- without this, a real Google category like "Hotel" or
 * "Health Consultant" would be silently stored in draft.business.industry
 * but never visibly selected in the dropdown (a <select> shows nothing
 * selected when its value matches no <option>), making autofill look like
 * it silently failed even though the data was technically there.
 */
export const INDUSTRY_OPTIONS = [
  "SaaS & Technology",
  "Healthcare & Clinics",
  "Food & Dining (Restaurants / Cafes)",
  "Salon & Beauty Services",
  "Professional Services & Consulting",
  "Real Estate & Architecture",
  "Retail & E-commerce",
  "Fitness & Wellness",
  "Automotive & Repair",
  "Education & Coaching",
  "Manufacturing & Industrial",
  "General Business",
] as const;

export type IndustryOption = (typeof INDUSTRY_OPTIONS)[number];

/**
 * Real, bounded keyword rules mapping Google's own place `types` (the raw
 * snake_case taxonomy, e.g. "hotel", "lodging", "health_consultant" --
 * live-verified against Google's Places API (New) documentation during
 * this build) to the closest real option in this dropdown. Deliberately
 * conservative: an unmatched type falls through to "General Business"
 * (already a real, honest catch-all option) rather than inventing a new
 * category or leaving the field showing nothing selected.
 */
const TYPE_KEYWORD_RULES: Array<{ option: IndustryOption; keywords: string[] }> = [
  { option: "Healthcare & Clinics", keywords: ["health", "doctor", "hospital", "clinic", "dental", "medical", "pharmacy", "physiotherapist", "veterinary"] },
  { option: "Food & Dining (Restaurants / Cafes)", keywords: ["restaurant", "cafe", "food", "bakery", "bar", "meal_", "coffee"] },
  { option: "Salon & Beauty Services", keywords: ["beauty_salon", "hair_care", "spa", "nail_salon", "barber"] },
  { option: "Real Estate & Architecture", keywords: ["real_estate", "architect", "property_management"] },
  { option: "Retail & E-commerce", keywords: ["store", "shop", "shopping_mall", "clothing_store", "supermarket", "grocery"] },
  { option: "Fitness & Wellness", keywords: ["gym", "fitness", "yoga", "sports_"] },
  { option: "Automotive & Repair", keywords: ["car_repair", "car_dealer", "car_rental", "auto_"] },
  { option: "Education & Coaching", keywords: ["school", "university", "tutor", "education", "training"] },
  { option: "Professional Services & Consulting", keywords: ["consultant", "lawyer", "accounting", "insurance_agency", "travel_agency", "finance"] },
  { option: "SaaS & Technology", keywords: ["software", "technology", "it_service"] },
];

/**
 * Maps real Google Places data (raw `types` first -- more reliable than
 * the humanized `category` display string, which can read as e.g. "Point
 * Of Interest" if that's the only type available) to one of this
 * dropdown's real options. Returns "General Business" -- never null, never
 * an invented category -- when nothing matches, so the dropdown always has
 * a real, visibly-selected value once a business is chosen.
 */
export function mapGooglePlaceToIndustryOption(types: string[] | null | undefined): IndustryOption {
  const haystack = (types ?? []).join(" ").toLowerCase();
  for (const rule of TYPE_KEYWORD_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) return rule.option;
  }
  return "General Business";
}
