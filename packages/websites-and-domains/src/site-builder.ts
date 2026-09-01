import type { WebsiteSpecification, SectionType } from "./specification/schema.ts";

export interface SiteSectionItem {
  title: string;
  description: string;
  icon?: string;
  image?: string;
  price?: string;
  link?: string;
  rating?: number;
  author?: string;
  role?: string;
}

export interface SiteSection {
  type: SectionType;
  heading: string;
  subheading?: string;
  content?: string;
  items?: SiteSectionItem[];
  ctaText?: string;
  ctaLink?: string;
  layout?: "grid" | "list" | "carousel" | "masonry";
  columns?: 1 | 2 | 3 | 4;
  backgroundStyle?: "default" | "accent" | "dark" | "gradient" | "image";
  /** Set true when a value is an editable stand-in rather than a real fact — the UI must render this distinctly and prompt the customer to confirm it. */
  needsConfirmation?: boolean;
}

export interface SitePage {
  id: string;
  title: string;
  slug: string;
  seo: {
    title: string;
    metaDescription: string;
    keywords?: string[];
  };
  sections: SiteSection[];
  isHomepage?: boolean;
}

export interface SiteProjectInput {
  tenantId: string;
  businessName: string;
  industry?: string;
  businessDescription?: string;
  /** Real, customer-supplied differentiators only — never invent these. */
  differentiators?: string[];
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  /** Optional real Brand Brain context — used to enrich copy, never to fabricate facts not present in it. */
  brandBrain?: { targetAudience?: string; toneOfVoice?: string; pillars?: string[] } | null;
}

export interface SiteProject {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  templateId: string;
  status: "draft" | "preview" | "in_revision" | "approved" | "published" | "preview_ready" | "deploying" | "live" | "failed";
  previewSubdomain: string;
  customDomain?: string;
  pages: SitePage[];
  revisionNotes?: string;
  revisionCount: number;
  exportUnlocked: boolean;
  themeConfig?: Record<string, unknown>;
  websiteType?: string;
}

/**
 * Which non-fabricating page fills the 5th slot, chosen from the business's
 * own industry rather than hardcoded. Every option here can be filled with
 * generic, honestly-labeled content — none of them require inventing a
 * specific fact (a testimonial, a client count, an award) the business
 * hasn't actually supplied. FAQ is the universal safe default.
 */
type FifthPageKind = "gallery" | "team" | "process" | "faq";

const FIFTH_PAGE_RULES: Array<{ kind: FifthPageKind; keywords: string[] }> = [
  { kind: "gallery", keywords: ["restaurant", "cafe", "hotel", "salon", "spa", "photograph", "interior", "fashion", "retail", "bakery", "boutique"] },
  { kind: "team", keywords: ["consult", "legal", "law", "medical", "clinic", "dental", "agency", "accounting", "finance", "architect"] },
  { kind: "process", keywords: ["construction", "renovation", "manufactur", "logistics", "repair", "install", "engineering"] },
];

function chooseFifthPage(industry: string | undefined): FifthPageKind {
  const normalized = (industry ?? "").toLowerCase();
  for (const rule of FIFTH_PAGE_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) return rule.kind;
  }
  return "faq";
}

function buildFifthPage(kind: FifthPageKind, input: SiteProjectInput): SitePage {
  const base = { id: "page_5", slug: "" as string };
  switch (kind) {
    case "gallery":
      return {
        ...base,
        id: "page_gallery",
        slug: "gallery",
        title: "Gallery",
        seo: { title: `Gallery — ${input.businessName}`, metaDescription: `A look at ${input.businessName}'s work.` },
        sections: [
          {
            type: "gallery",
            heading: "Our Work",
            subheading: "[Add photos showcasing your work, space, or products]",
            needsConfirmation: true,
          },
        ],
      };
    case "team":
      return {
        ...base,
        id: "page_team",
        slug: "team",
        title: "Our Team",
        seo: { title: `Our Team — ${input.businessName}`, metaDescription: `Meet the team behind ${input.businessName}.` },
        sections: [
          {
            type: "team",
            heading: "Meet the Team",
            subheading: "[Add team member names, roles, and photos]",
            needsConfirmation: true,
          },
        ],
      };
    case "process":
      return {
        ...base,
        id: "page_process",
        slug: "process",
        title: "Our Process",
        seo: { title: `Our Process — ${input.businessName}`, metaDescription: `How ${input.businessName} works with clients.` },
        sections: [
          {
            type: "process",
            heading: "How We Work",
            items: [
              { title: "1. Consultation", description: "[Describe your first step with a new client]" },
              { title: "2. Planning", description: "[Describe how you plan/scope the work]" },
              { title: "3. Delivery", description: "[Describe how you deliver the result]" },
            ],
            needsConfirmation: true,
          },
        ],
      };
    case "faq":
    default:
      return {
        ...base,
        id: "page_faq",
        slug: "faq",
        title: "FAQ",
        seo: { title: `FAQ — ${input.businessName}`, metaDescription: `Frequently asked questions about ${input.businessName}.` },
        sections: [
          {
            type: "faq",
            heading: "Frequently Asked Questions",
            items: [
              { title: "What areas do you serve?", description: "[Add your service area]" },
              { title: "How do I get started?", description: "[Add your booking/contact process]" },
              { title: "What are your business hours?", description: "[Add your hours]" },
            ],
            needsConfirmation: true,
          },
        ],
      };
  }
}

export function generate5PageSite(input: SiteProjectInput): SiteProject {
  const slug = input.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const previewSubdomain = `${slug}.stratxcel.site`;

  const contactLine = [
    input.contactEmail ? `Email: ${input.contactEmail}` : "Email: [Add your business email]",
    input.contactPhone ? `Phone: ${input.contactPhone}` : "Phone: [Add your business phone]",
  ].join(" · ");

  const aboutContent = input.businessDescription
    ? input.businessDescription
    : `[Add a short description of ${input.businessName} — what you do and who you serve]`;

  const pages: SitePage[] = [
    {
      id: "page_home",
      title: "Home",
      slug: "",
      seo: {
        title: `${input.businessName}${input.industry ? ` — ${input.industry}` : ""}`,
        metaDescription: input.businessDescription ?? `${input.businessName} — [add a one-line summary for search results]`,
      },
      sections: [
        {
          type: "hero",
          heading: `Welcome to ${input.businessName}`,
          subheading: input.businessDescription ?? "[Add a short tagline describing what you offer]",
          needsConfirmation: !input.businessDescription,
        },
        ...(input.differentiators && input.differentiators.length > 0
          ? [
              {
                type: "features" as const,
                heading: "Why Choose Us",
                items: input.differentiators.map((d) => ({ title: d, description: "" })),
              },
            ]
          : []),
      ],
    },
    {
      id: "page_services",
      title: "Services",
      slug: "services",
      seo: {
        title: `Services — ${input.businessName}`,
        metaDescription: `Services offered by ${input.businessName}.`,
      },
      sections: [
        {
          type: "features",
          heading: "Our Services",
          items: [{ title: "[Add a service]", description: "[Describe this service]" }],
          needsConfirmation: true,
        },
      ],
    },
    {
      id: "page_about",
      title: "About Us",
      slug: "about",
      seo: {
        title: `About — ${input.businessName}`,
        metaDescription: `Learn about ${input.businessName}.`,
      },
      sections: [
        {
          type: "about",
          heading: `About ${input.businessName}`,
          content: aboutContent,
          needsConfirmation: !input.businessDescription,
        },
      ],
    },
    buildFifthPage(chooseFifthPage(input.industry), input),
    {
      id: "page_contact",
      title: "Contact Us",
      slug: "contact",
      seo: {
        title: `Contact — ${input.businessName}`,
        metaDescription: `Get in touch with ${input.businessName}.`,
      },
      sections: [
        {
          type: "contact_form",
          heading: "Get in Touch",
          subheading: contactLine,
          needsConfirmation: !input.contactEmail || !input.contactPhone,
        },
      ],
    },
  ];

  return {
    id: `site_${Date.now()}`,
    tenantId: input.tenantId,
    name: input.businessName,
    slug,
    templateId: "modern-business-5page",
    status: "preview",
    previewSubdomain,
    pages,
    revisionCount: 0,
    exportUnlocked: false,
  };
}

export function requestSiteRevision(project: SiteProject, notes: string): SiteProject {
  if (project.revisionCount >= 1) {
    throw new Error("Growth plan includes 1 revision cycle. Additional revisions require an approved add-on or a higher plan.");
  }
  return {
    ...project,
    status: "in_revision",
    revisionNotes: notes,
    revisionCount: project.revisionCount + 1,
  };
}

export function approveAndPublishSite(project: SiteProject, customDomain?: string): SiteProject {
  return {
    ...project,
    status: "published",
    customDomain: customDomain ?? project.customDomain,
  };
}

export function checkSiteExportEligibility(paidSubscriptionMonthsCount: number): boolean {
  // Free included website export unlocked after 3 successful subscription payments
  return paidSubscriptionMonthsCount >= 3;
}

/**
 * Transforms a validated WebsiteSpecification into a complete SiteProject
 * model with all pages, SEO metadata, theme styling, and routing ready for preview/rendering.
 */
export function generateSiteFromSpecification(tenantId: string, spec: WebsiteSpecification): SiteProject {
  const slug = spec.brand.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const previewSubdomain = `${slug}.stratxcel.site`;

  const pages: SitePage[] = spec.pages.map((p, idx) => ({
    id: p.id || `page_${idx}_${p.slug || "home"}`,
    title: p.title,
    slug: p.slug,
    isHomepage: p.isHomepage ?? (p.slug === "" || idx === 0),
    seo: {
      title: p.seo?.title || `${p.title} — ${spec.brand.businessName}`,
      metaDescription: p.seo?.metaDescription || `${spec.brand.businessName} — ${spec.brand.tagline || p.title}`,
      keywords: p.seo?.keywords,
    },
    sections: p.sections.map((s) => ({
      type: s.type,
      heading: s.heading,
      subheading: s.subheading,
      content: s.content,
      items: s.items?.map((item) => ({
        title: item.title,
        description: item.description,
        icon: item.icon,
        image: item.image,
        price: item.price,
        link: item.link,
      })),
      ctaText: s.ctaText,
      ctaLink: s.ctaLink,
      layout: s.layout,
      columns: s.columns,
      backgroundStyle: s.backgroundStyle,
    })),
  }));

  return {
    id: `site_${Date.now()}`,
    tenantId,
    name: spec.brand.businessName,
    slug,
    templateId: "ai-generated-specification",
    status: "preview_ready",
    previewSubdomain,
    customDomain: spec.domain?.requested,
    pages,
    revisionCount: 0,
    exportUnlocked: false,
    themeConfig: spec.visualStyle as unknown as Record<string, unknown>,
    websiteType: spec.websiteType,
  };
}

/**
 * Natural-Language Website Editor:
 * Applies a customer modification instruction (currently recognized:
 * "Make the homepage/hero more premium/luxurious", "Add an About page")
 * onto an existing project and generates an updated page tree.
 *
 * VERIFICATION INTEGRITY (2026-09-02, same defect class and fix as the
 * generation-time fabrication fixed the same day -- see
 * no-fabricated-testimonials.test.ts): this function used to (1) insert
 * hardcoded fabricated testimonials/products for "testimonial"/"product"/
 * "price" instructions, and (2) ALWAYS report revisionCount+1/
 * status:"in_revision" even when the instruction matched none of its
 * recognized patterns -- indistinguishable from a real edit having
 * happened. Fixed by (1) removing the fabricating patterns entirely
 * (same "real data, clearly marked placeholder, or nothing" rule), and
 * (2) only advancing revisionCount/status/revisionNotes when a pattern
 * genuinely changed something -- an unrecognized instruction (including,
 * by design, "testimonial"/"product"/"price" ones now that those patterns
 * are gone) returns currentProject completely unchanged, which
 * app/api/platform/website-factory/[projectId]/edit/route.ts now checks
 * for and reports honestly rather than claiming success. This is
 * DELIBERATELY still a no-op for unrecognized instructions -- including
 * destructive-sounding ones -- not a thrown error: see
 * website-factory-security.test.ts's "Distinguishes safe visual edits
 * from destructive/financial commands", a real, intentional safety
 * property this fix preserves exactly, just without the previously
 * misleading success signal.
 */
export function applyNaturalLanguageEdit(
  currentProject: SiteProject,
  instruction: string,
  updatedSpec?: WebsiteSpecification
): SiteProject {
  const norm = instruction.toLowerCase().trim();
  const pages = JSON.parse(JSON.stringify(currentProject.pages)) as SitePage[];
  const homePage = pages.find((p) => p.slug === "" || p.isHomepage) || pages[0];
  let matched = false;

  // 1. "Make homepage more premium" / "Make hero more luxurious"
  if (norm.includes("premium") || norm.includes("luxurious") || norm.includes("hero")) {
    const heroSec = homePage?.sections.find((s) => s.type === "hero");
    if (heroSec) {
      heroSec.heading = heroSec.heading.includes("—") ? heroSec.heading : `${heroSec.heading} — Handcrafted Excellence`;
      heroSec.subheading = "Curated collections engineered with uncompromising craftsmanship, timeless design, and unmatched distinction.";
      heroSec.backgroundStyle = "dark";
      matched = true;
    }
  }

  // 2. "Add an About page" / "about"
  if (norm.includes("about page") && !pages.some((p) => p.slug === "about")) {
    pages.push({
      id: "page_about",
      title: "About Us",
      slug: "about",
      seo: {
        title: `About Our Heritage — ${currentProject.name}`,
        metaDescription: `Discover the philosophy, ethos, and craftsmanship behind ${currentProject.name}.`,
      },
      sections: [
        {
          type: "hero",
          heading: `The ${currentProject.name} Story`,
          subheading: "A heritage founded on timeless elegance, uncompromising quality, and visionary ambition.",
        },
        {
          type: "about",
          heading: "Our Philosophy",
          content: `${currentProject.name} was established with a singular vision: to redefine contemporary standards through authentic design and master craftsmanship.`,
        },
      ],
    });
    matched = true;
  }

  // If updated specification was generated by AI, use its validated pages --
  // this branch is always a real change (a fresh AI-validated spec exists),
  // independent of the keyword patterns above.
  if (updatedSpec && updatedSpec.pages && updatedSpec.pages.length > 0) {
    const fromSpec = generateSiteFromSpecification(currentProject.tenantId, updatedSpec);
    return {
      ...currentProject,
      pages: fromSpec.pages,
      revisionCount: currentProject.revisionCount + 1,
      revisionNotes: instruction,
      status: "in_revision",
      themeConfig: (updatedSpec.visualStyle as unknown as Record<string, unknown>) || currentProject.themeConfig,
    };
  }

  if (!matched) return currentProject;

  return {
    ...currentProject,
    pages,
    revisionCount: currentProject.revisionCount + 1,
    revisionNotes: instruction,
    status: "in_revision",
  };
}

