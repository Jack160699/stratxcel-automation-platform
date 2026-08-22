/**
 * Commercial Website Services Catalog & Pricing Model.
 *
 * Grounded in StratXcel's 10x Cost Rule:
 * Customer Selling Price = Verified Internal Production Cost * 10
 *
 * Differentiates the standalone commercial website creation services
 * from the recurring StratXcel SaaS subscription tiers.
 */

export interface WebsiteServicePackage {
  id: "landing_page" | "five_page" | "custom";
  name: string;
  shortDescription: string;
  internalCostCents: number; // Internal COGS (AI tokens, image generations, domain registration, edge hosting)
  priceCents: number; // Customer selling price = internalCostCents * 10
  priceInr: number;
  billingType: "one_time" | "package";
  turnaroundDays: string;
  idealFor: string;
  includedFeatures: string[];
  recommendedPages?: string[];
  ctaLabel: string;
}

export const WEBSITE_SERVICE_PACKAGES: Record<string, WebsiteServicePackage> = {
  landing_page: {
    id: "landing_page",
    name: "Landing Page",
    shortDescription: "One focused, high-conversion page to turn local searchers into paying customers.",
    internalCostCents: 49_990, // ₹499.90 verified internal production cost
    priceCents: 499_900, // ₹4,999.00 customer price (exact 10x)
    priceInr: 4999,
    billingType: "one_time",
    turnaroundDays: "24–48 hours",
    idealFor: "Local shops, single-service professionals, festival offers & rapid launch",
    includedFeatures: [
      "1 conversion-focused responsive layout",
      "Mobile-first design tailored to your shop",
      "Direct WhatsApp ordering & inquiry button",
      "Google Maps location & operating hours embed",
      "Customer reviews & trust highlights",
      "Clean .stratxcel.site or custom domain routing",
      "Fast SSL encryption & edge hosting",
      "Basic local SEO metadata setup",
    ],
    recommendedPages: ["Home / Landing"],
    ctaLabel: "Build Landing Page →",
  },
  five_page: {
    id: "five_page",
    name: "5-Page Website",
    shortDescription: "Complete standard business website giving customers everything they need to trust and contact you.",
    internalCostCents: 99_990, // ₹999.90 verified internal production cost
    priceCents: 999_900, // ₹9,999.00 customer price (exact 10x)
    priceInr: 9999,
    billingType: "package",
    turnaroundDays: "3–5 days",
    idealFor: "Established salons, clinics, restaurants, bakeries, retail stores & service businesses",
    includedFeatures: [
      "5 custom pages adapted to your specific industry",
      "Industry-specific page structure & copy recommendations",
      "Photo gallery, catalog & price list showcase",
      "Doctor/team profiles, menu or service cards",
      "WhatsApp lead capture & appointment requests",
      "Custom domain connection (yourbusiness.com)",
      "1 year high-speed hosting & automated SSL included",
      "Mobile optimization & fast local SEO setup",
    ],
    recommendedPages: [
      "Home",
      "About Us",
      "Services / Menu",
      "Gallery / Portfolio",
      "Contact & Location",
    ],
    ctaLabel: "Build 5-Page Website →",
  },
  custom: {
    id: "custom",
    name: "Custom Website",
    shortDescription: "A bespoke website designed around your specific workflow, booking flow, and unique requirements.",
    internalCostCents: 249_990, // ₹2,499.90 verified internal production cost
    priceCents: 2_499_900, // ₹24,999.00 customer price (exact 10x)
    priceInr: 24999,
    billingType: "package",
    turnaroundDays: "7–10 days",
    idealFor: "High-volume businesses, multi-branch clinics, bespoke brands & custom booking flows",
    includedFeatures: [
      "Bespoke information architecture & visual direction",
      "Unlimited custom sections, catalogs & service tiers",
      "Advanced booking, appointment, or inquiry flows",
      "Custom integrations & analytics setup",
      "Multi-language support (English, Hindi, Hinglish)",
      "Priority edge hosting & dedicated performance optimization",
      "Ongoing AI revisions & content updates",
      "Direct technical onboarding & launch verification",
    ],
    recommendedPages: [
      "Home",
      "Specialized Services",
      "About & Team",
      "Customer Case Studies / Reviews",
      "Interactive Booking / Inquiry",
      "Location & Hours",
    ],
    ctaLabel: "Start Custom Website →",
  },
};

/**
 * Industry-adaptive website architecture suggestions for Website Factory.
 */
export const INDUSTRY_WEBSITE_ARCHITECTURES: Record<
  string,
  { pages: string[]; keySections: string[]; ctaStyle: string }
> = {
  salon: {
    pages: ["Home", "Services & Pricing", "Photo Gallery", "Special Offers", "Contact & Booking"],
    keySections: ["Service Menu", "Before/After Gallery", "Client Testimonials", "WhatsApp Booking"],
    ctaStyle: "Book Appointment on WhatsApp",
  },
  restaurant: {
    pages: ["Home", "Food Menu", "Photo Gallery", "About the Chef", "Location & Reserve"],
    keySections: ["Featured Dishes", "Dine-in Menu & Prices", "Google 5-Star Reviews", "WhatsApp Takeaway"],
    ctaStyle: "Order or Reserve on WhatsApp",
  },
  clinic: {
    pages: ["Home", "Treatments & Care", "Doctors & Specialists", "Patient FAQs", "Contact & Appointments"],
    keySections: ["Specialist Profiles", "Treatment Overview", "Clinic Timing & Location", "Instant Appointment"],
    ctaStyle: "Schedule Consultation",
  },
  bakery: {
    pages: ["Home", "Fresh Bakes & Cakes", "Custom Order Gallery", "Flavors & Pricing", "Order Online"],
    keySections: ["Daily Specials", "Custom Cake Request", "Customer Reviews", "WhatsApp Instant Order"],
    ctaStyle: "Order Fresh Bakes",
  },
  retail: {
    pages: ["Home", "Product Catalog", "Store Highlights", "Customer Reviews", "Visit & Contact"],
    keySections: ["Featured Collections", "Price Highlights", "Store Hours & Map", "WhatsApp Inquiry"],
    ctaStyle: "Inquire on WhatsApp",
  },
  services: {
    pages: ["Home", "All Services", "Why Choose Us", "Pricing & Estimates", "Get in Touch"],
    keySections: ["Service Guarantees", "Rate Card / Packages", "Verified Reviews", "Instant Quote Request"],
    ctaStyle: "Request Free Quote",
  },
};

/**
 * Resolves the recommended architecture based on shop category or industry text.
 */
export function getRecommendedIndustryArchitecture(industry?: string) {
  const normalized = (industry || "").toLowerCase();
  if (normalized.includes("salon") || normalized.includes("beauty") || normalized.includes("spa") || normalized.includes("parlour")) {
    return INDUSTRY_WEBSITE_ARCHITECTURES.salon;
  }
  if (normalized.includes("restaurant") || normalized.includes("caf") || normalized.includes("dhaba") || normalized.includes("food") || normalized.includes("kitchen")) {
    return INDUSTRY_WEBSITE_ARCHITECTURES.restaurant;
  }
  if (normalized.includes("clinic") || normalized.includes("doctor") || normalized.includes("health") || normalized.includes("dental") || normalized.includes("care")) {
    return INDUSTRY_WEBSITE_ARCHITECTURES.clinic;
  }
  if (normalized.includes("bakery") || normalized.includes("cake") || normalized.includes("pastry") || normalized.includes("sweet")) {
    return INDUSTRY_WEBSITE_ARCHITECTURES.bakery;
  }
  if (normalized.includes("cloth") || normalized.includes("kirana") || normalized.includes("store") || normalized.includes("shop") || normalized.includes("retail") || normalized.includes("jewel")) {
    return INDUSTRY_WEBSITE_ARCHITECTURES.retail;
  }
  return INDUSTRY_WEBSITE_ARCHITECTURES.services;
}
