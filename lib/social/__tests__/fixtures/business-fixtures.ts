/**
 * Realistic, genuinely-different fixtures for the seven reference
 * industries (build brief Phase F). Deliberately vary data completeness
 * across fixtures (Phase G): some have a phone, some don't; some have an
 * offer, some don't; some have a live Google Business rating, some don't --
 * so personalization tests can assert real facts are used AND missing
 * facts are never fabricated.
 *
 * Shapes mirror the real inputs each pipeline stage actually consumes:
 * googleBusiness/brandBrain match buildVerifiedBusinessInformation's
 * input (package-business-facts.ts); the rest matches
 * creative-brief.ts/quality-score.ts.
 */

import type { VerifiedGoogleBusinessFacts, VerifiedBrandBrainFacts } from "../../package-business-facts.ts";

export interface BusinessFixture {
  key: string;
  businessName: string;
  industryText: string;
  descriptionText: string;
  contentPillars: string[];
  audience: string;
  brandTone: string[];
  brandColors: string[];
  hasLogo: boolean;
  googleBusiness: VerifiedGoogleBusinessFacts | null;
  brandBrain: VerifiedBrandBrainFacts | null;
  /** Explicitly what this fixture does NOT have -- used by personalization
   * tests to assert the corresponding fact never appears fabricated. */
  missing: Array<"phone" | "address" | "rating" | "offer">;
}

export const RESTAURANT_FIXTURE: BusinessFixture = {
  key: "restaurant",
  businessName: "Coastal Kitchen",
  industryText: "Restaurant",
  descriptionText: "A family-run Kerala coastal-cuisine restaurant serving fresh seafood and traditional thalis.",
  contentPillars: ["Dish spotlight", "Chef story", "Local ingredient education", "Weekend special"],
  audience: "local food lovers and tourists visiting Fort Kochi",
  brandTone: ["warm", "unpretentious", "proud of local ingredients"],
  brandColors: ["#1E5631", "#F4A300"],
  hasLogo: true,
  googleBusiness: { address: "14 Princess Street, Fort Kochi, Kerala 682001", category: "Seafood restaurant", websiteUri: "https://coastalkitchen.example.in" },
  brandBrain: { location: "Fort Kochi, Kerala", target_audience: "local food lovers and tourists", priority_offering: "Kerala seafood thali", differentiation: "sources fish directly from the Fort Kochi harbour every morning", average_customer_spend: "₹600-900 per person", business_stage: "ESTABLISHED", growth_priority: "weekend footfall" },
  missing: ["offer", "rating"], // complete data fixture EXCEPT these -- Phase G "complete data" case with one deliberate gap to keep the fixture honest
};

export const SALON_FIXTURE: BusinessFixture = {
  key: "salon",
  businessName: "Glow Studio",
  industryText: "Hair and beauty salon",
  descriptionText: "A unisex hair and skincare salon specializing in color correction and bridal styling.",
  contentPillars: ["Transformation showcase", "Style education", "Stylist expertise", "Seasonal look"],
  audience: "working professionals and brides-to-be in Bandra West",
  brandTone: ["confident", "trend-forward"],
  brandColors: ["#B76E79", "#111111"],
  hasLogo: true,
  googleBusiness: { address: "Shop 4, Linking Road, Bandra West, Mumbai 400050", category: "Hair salon", websiteUri: null },
  brandBrain: { location: "Bandra West, Mumbai", target_audience: "working professionals and brides-to-be", priority_offering: "bridal styling packages" },
  missing: ["phone", "offer", "rating"], // Phase G "partial data" case
};

export const GYM_FIXTURE: BusinessFixture = {
  key: "gym",
  businessName: "IronCore Fitness",
  industryText: "Gym and strength training studio",
  descriptionText: "A strength and conditioning gym with certified coaches and small-group training.",
  contentPillars: ["Training tip", "Member transformation", "Coach expertise", "Community moment"],
  audience: "working professionals in Koramangala starting a fitness routine",
  brandTone: ["motivating", "no-nonsense"],
  brandColors: ["#D62828", "#1B1B1B"],
  hasLogo: false, // Phase G "no brand assets" case
  googleBusiness: null, // GBP not connected yet
  brandBrain: { location: "Koramangala, Bengaluru", target_audience: "working professionals starting a fitness routine", growth_priority: "new member sign-ups" },
  missing: ["phone", "address", "rating", "offer"], // Phase G "no phone / no address / no rating / no offer" case
};

export const CLINIC_FIXTURE: BusinessFixture = {
  key: "clinic",
  businessName: "Sunrise Dental Care",
  industryText: "Dental clinic",
  descriptionText: "A family dental clinic offering general and cosmetic dentistry.",
  contentPillars: ["Patient education", "Specialty highlight", "Doctor expertise", "FAQ answered"],
  audience: "families in Indiranagar looking for a trusted family dentist",
  brandTone: ["reassuring", "professional"],
  brandColors: ["#0077B6", "#FFFFFF"],
  hasLogo: true,
  googleBusiness: { address: "221 100 Feet Road, Indiranagar, Bengaluru 560038", category: "Dental clinic", websiteUri: "https://sunrisedental.example.in" },
  brandBrain: { location: "Indiranagar, Bengaluru", target_audience: "families looking for a trusted family dentist", differentiation: "same-day appointments and painless root canal specialists" },
  missing: ["offer", "rating"], // medical services never fabricate a discount or a rating
};

export const RETAIL_FIXTURE: BusinessFixture = {
  key: "retail",
  businessName: "Urban Threads",
  industryText: "Clothing boutique, online and in-store",
  descriptionText: "An independent clothing boutique curating small-batch Indian designer wear, sold online and from a Delhi showroom.",
  contentPillars: ["Product spotlight", "New arrival", "Styling idea", "Collection highlight"],
  audience: "style-conscious shoppers aged 22-35 in Delhi NCR and online",
  brandTone: ["chic", "approachable"],
  brandColors: ["#7B2D26", "#E8DFCA"],
  hasLogo: true,
  googleBusiness: null, // primarily online -- no GBP location connected
  brandBrain: { location: "Connaught Place, New Delhi (showroom) + online nationwide", target_audience: "style-conscious shoppers aged 22-35", priority_offering: "new festive collection" },
  missing: ["phone", "rating", "offer"],
};

export const REAL_ESTATE_FIXTURE: BusinessFixture = {
  key: "real_estate",
  businessName: "Skyline Properties",
  industryText: "Real estate developer",
  descriptionText: "A real estate developer with residential projects in Whitefield and Sarjapur, Bengaluru.",
  contentPillars: ["Property spotlight", "Neighborhood guide", "Investment angle", "Site visit invitation"],
  audience: "first-time homebuyers and investors in East Bengaluru",
  brandTone: ["trustworthy", "aspirational but grounded"],
  brandColors: ["#22333B", "#C6AC8F"],
  hasLogo: true,
  googleBusiness: { address: "Skyline Sales Office, ITPL Main Road, Whitefield, Bengaluru 560066", category: "Real estate developer", websiteUri: "https://skylineproperties.example.in" },
  // Phase G "multiple locations" case: two active projects, only ONE is the
  // subject of any given post -- personalization tests assert the caller
  // must pick the correct one explicitly, never blend both.
  brandBrain: { location: "Whitefield and Sarjapur, Bengaluru (2 active projects)", target_audience: "first-time homebuyers and investors in East Bengaluru", priority_offering: "Whitefield 2BHK/3BHK towers, possession Q4" },
  missing: ["phone", "rating", "offer"],
};

export const LOCAL_SERVICE_FIXTURE: BusinessFixture = {
  key: "local_service",
  businessName: "QuickFix Plumbing & Electric",
  industryText: "Plumbing and electrical repair service",
  descriptionText: "A local plumbing and electrical repair service covering Andheri East and nearby suburbs.",
  contentPillars: ["Problem/solution", "Before/after result", "Expertise demonstration", "Seasonal reminder"],
  audience: "homeowners and small businesses in Andheri East needing reliable repairs",
  brandTone: ["reliable", "straightforward"],
  brandColors: ["#F77F00", "#003049"],
  hasLogo: true,
  googleBusiness: { address: "Andheri East, Mumbai 400069", category: "Plumber", websiteUri: null },
  brandBrain: { location: "Andheri East, Mumbai", target_audience: "homeowners and small businesses needing reliable repairs", differentiation: "same-day emergency callouts" },
  missing: ["rating", "offer"],
};

export const ALL_FIXTURES: BusinessFixture[] = [
  RESTAURANT_FIXTURE,
  SALON_FIXTURE,
  GYM_FIXTURE,
  CLINIC_FIXTURE,
  RETAIL_FIXTURE,
  REAL_ESTATE_FIXTURE,
  LOCAL_SERVICE_FIXTURE,
];
