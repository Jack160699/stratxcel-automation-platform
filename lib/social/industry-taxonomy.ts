/**
 * Industry classification for the Creative-Direction Engine (build brief
 * Section 7): content strategy must materially change by industry, not
 * just swap the business name into one template. Pure, deterministic,
 * no AI call -- classification and the creative-angle libraries below are
 * available even with zero live AI credentials.
 *
 * `classifyIndustry` is intentionally conservative: an industry string that
 * matches nothing recognized returns "generic" rather than guessing wrong,
 * which would produce an industry-inappropriate creative concept (Self-
 * Critique question 4 in the campaign brief).
 */

export type IndustryCategory =
  | "restaurant"
  | "salon"
  | "gym"
  | "clinic"
  | "retail"
  | "real_estate"
  | "local_service"
  | "generic";

interface IndustryProfile {
  category: IndustryCategory;
  /** Keywords matched against the tenant's own industry/description text. */
  keywords: string[];
  /** Creative concept angles this industry's content should rotate through. */
  concepts: string[];
  /** Vocabulary that signals genuine industry relevance in generated copy. */
  relevanceVocabulary: string[];
  /** Photography/visual mood guidance for the (future) visual creative brief. */
  visualStyle: string;
  /** The CTA phrasing style appropriate for this industry. */
  ctaStyle: string;
}

const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    category: "restaurant",
    keywords: ["restaurant", "cafe", "café", "bakery", "bar", "kitchen", "dining", "eatery", "food truck", "bistro", "cloud kitchen", "catering"],
    concepts: ["dish spotlight", "ambience and setting", "meal occasion", "menu education", "chef or founder story", "seasonal ingredient", "customer favorite"],
    relevanceVocabulary: ["menu", "dish", "flavor", "taste", "chef", "kitchen", "ingredient", "recipe", "dine", "meal", "table", "cuisine"],
    visualStyle: "warm, appetizing close-up food photography with natural light and genuine plating",
    ctaStyle: "an invitation to visit, order, or reserve a table",
  },
  {
    category: "salon",
    keywords: ["salon", "spa", "hair", "beauty", "barber", "nail", "makeup", "skincare", "aesthetic"],
    concepts: ["transformation showcase", "style education", "stylist expertise", "seasonal look", "self-care moment", "product spotlight"],
    relevanceVocabulary: ["style", "cut", "color", "look", "treatment", "appointment", "stylist", "skin", "hair", "glow", "transformation"],
    visualStyle: "clean, well-lit before/after or portrait-style imagery with genuine styling detail",
    ctaStyle: "an invitation to book an appointment or consultation",
  },
  {
    category: "gym",
    keywords: ["gym", "fitness", "training", "crossfit", "yoga studio", "workout", "athletic", "sports club", "personal trainer"],
    concepts: ["training tip", "member transformation", "exercise education", "coach expertise", "community moment", "class spotlight"],
    relevanceVocabulary: ["workout", "training", "session", "coach", "trainer", "strength", "fitness", "class", "membership", "goal", "reps"],
    visualStyle: "high-energy action photography showing real movement, form, or a coached session",
    ctaStyle: "an invitation to join a class, book a session, or start a membership",
  },
  {
    category: "clinic",
    keywords: ["clinic", "hospital", "dental", "dentist", "doctor", "physician", "medical", "healthcare", "therapy", "physiotherapy", "diagnostic"],
    concepts: ["patient education", "specialty highlight", "doctor or practitioner expertise", "FAQ answered", "preventive care reminder", "facility trust"],
    relevanceVocabulary: ["patient", "treatment", "consultation", "specialist", "diagnosis", "care", "clinic", "appointment", "health", "symptom"],
    visualStyle: "clean, trustworthy clinical photography -- never staged or exaggerated -- emphasizing hygiene and professionalism",
    ctaStyle: "an invitation to book a consultation or appointment, never a medical claim or guarantee",
  },
  {
    category: "retail",
    keywords: ["store", "shop", "boutique", "retail", "showroom", "outlet", "mart", "supermarket", "electronics", "apparel", "clothing"],
    concepts: ["product spotlight", "buying guide", "new arrival", "styling or use-case idea", "comparison or value angle", "collection highlight"],
    relevanceVocabulary: ["product", "collection", "stock", "arrival", "price", "size", "range", "store", "shop", "in-store", "online"],
    visualStyle: "clean product photography with clear focal hierarchy, styled or in-context use",
    ctaStyle: "an invitation to shop, browse, or visit the store",
  },
  {
    category: "real_estate",
    keywords: ["real estate", "realty", "property", "builder", "developer", "apartment", "flat", "villa", "housing", "construction", "broker"],
    concepts: ["property spotlight", "neighborhood guide", "investment angle", "amenity highlight", "configuration/layout detail", "site visit invitation"],
    relevanceVocabulary: ["property", "location", "amenity", "sq ft", "bhk", "configuration", "possession", "site visit", "investment", "project"],
    visualStyle: "architectural photography emphasizing space, light, and the actual property -- never a generic stock skyline",
    ctaStyle: "an invitation to schedule a site visit or enquire about a specific property",
  },
  {
    category: "local_service",
    keywords: ["repair", "plumbing", "electrician", "cleaning", "consultant", "agency", "studio", "law firm", "accounting", "tuition", "coaching", "service"],
    concepts: ["problem/solution", "before/after result", "expertise demonstration", "process transparency", "client outcome", "seasonal reminder"],
    // Found against REAL generated output (Premium Creative Intelligence
    // campaign): a genuine, specific plumbing caption ("a sudden leak...
    // that leaking pipe joint... a technician arrives fast... same-day
    // emergency callouts") was hard-failed as LOW_INDUSTRY_RELEVANCE --
    // none of its very real, specific, on-topic vocabulary matched this
    // list, which was generic enough to miss it entirely.
    relevanceVocabulary: ["service", "job", "appointment", "expert", "quote", "problem", "solution", "reliable", "professional", "client", "leak", "pipe", "repair", "technician", "plumber", "electrician", "fix", "callout", "emergency"],
    visualStyle: "authentic, on-the-job photography that shows real work being done, not a staged handshake stock photo",
    ctaStyle: "an invitation to get a quote, book a service, or get in touch",
  },
];

const GENERIC_PROFILE: IndustryProfile = {
  category: "generic",
  keywords: [],
  concepts: ["product or service spotlight", "customer story", "behind the scenes", "helpful tip related to the business"],
  relevanceVocabulary: [],
  visualStyle: "authentic photography of the actual business, product, or team -- never generic stock imagery",
  ctaStyle: "a clear, specific next step relevant to this business",
};

/** Classifies free-text industry/description into a known category. Never
 * guesses when nothing matches -- returns "generic" rather than a wrong,
 * industry-inappropriate category. */
export function classifyIndustry(industryText: string | null | undefined, descriptionText: string | null | undefined = ""): IndustryCategory {
  const haystack = `${industryText ?? ""} ${descriptionText ?? ""}`.toLowerCase();
  if (!haystack.trim()) return "generic";
  for (const profile of INDUSTRY_PROFILES) {
    if (profile.keywords.some((keyword) => haystack.includes(keyword))) return profile.category;
  }
  return "generic";
}

export function getIndustryProfile(category: IndustryCategory): IndustryProfile {
  return INDUSTRY_PROFILES.find((profile) => profile.category === category) ?? GENERIC_PROFILE;
}

export function allIndustryCategories(): IndustryCategory[] {
  return [...INDUSTRY_PROFILES.map((profile) => profile.category), "generic"];
}

/**
 * Target-industry-contamination detection (STRATXCEL ONE-SHOT REBUILD
 * mission, Section 16): found live in production -- 2 of StratXcel's own 4
 * real published posts read as though StratXcel ITSELF were a clinic
 * ("...while you focus on your patients. Dr. Sharma sits at the wooden
 * reception desk of a local clinic..."), because the model illustrated a
 * customer example by addressing the READER in second person with an
 * industry-specific possessive noun, instead of a clearly third-person,
 * explicitly-attributed example ("a growing retail business... they
 * implemented..." -- the correct pattern, also found live on a different
 * real published post). `classifyIndustry` itself was NOT the bug here --
 * StratXcel's own brand profile correctly classifies as "generic" (a B2B
 * SaaS company, not a locally-served vertical) -- this catches the specific
 * failure mode of the generated COPY nonetheless drifting into a different
 * industry's identity.
 *
 * Deliberately a small, hand-picked, high-precision word list rather than
 * each industry's full relevanceVocabulary: many of those words (e.g.
 * "service", "client", "solution", "problem") are completely ordinary,
 * legitimate B2B language and would false-positive constantly if used here.
 * Same conservative philosophy as classifyIndustry's own header comment:
 * never guess wrong (a false positive here blocks genuinely fine copy).
 * `local_service`'s own vocabulary overlaps too much with ordinary business
 * language to include at all -- deliberately omitted.
 */
const IDENTITY_CLAIMING_NOUNS: Partial<Record<IndustryCategory, string[]>> = {
  clinic: ["patients", "patient"],
  restaurant: ["diners", "menu"],
  salon: ["stylists"],
  gym: ["workout", "gym members"],
  retail: ["shoppers", "storefront"],
  real_estate: ["tenants", "listings"],
};

export interface IndustryContaminationCheck {
  isContaminated: boolean;
  reason: string | null;
}

/** `ownIndustry` is the business's OWN classified category (from
 * classifyIndustry against ITS OWN identity/description) -- that
 * category's own words are correctly self-referential and are never
 * flagged. Every other category's identity-claiming words are checked. */
export function checkTargetIndustryContamination(caption: string, ownIndustry: IndustryCategory): IndustryContaminationCheck {
  const lower = caption.toLowerCase();
  for (const [category, nouns] of Object.entries(IDENTITY_CLAIMING_NOUNS) as Array<[IndustryCategory, string[]]>) {
    if (category === ownIndustry) continue;
    for (const noun of nouns) {
      const pattern = new RegExp(`\\byour\\s+${noun}\\b`, "i");
      if (pattern.test(lower)) {
        return {
          isContaminated: true,
          reason: `"your ${noun}" addresses the reader as though the business itself were a ${category.replace("_", " ")} -- a customer example must be third-person and clearly attributed (e.g. "a local ${category.replace("_", " ")}... they use...", never "you"/"your ${noun}")`,
        };
      }
    }
  }
  return { isContaminated: false, reason: null };
}
