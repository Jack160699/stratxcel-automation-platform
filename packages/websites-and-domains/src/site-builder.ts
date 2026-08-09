export interface SitePage {
  id: string;
  title: string;
  slug: string;
  seo: {
    title: string;
    metaDescription: string;
  };
  sections: {
    type: "hero" | "features" | "about" | "faq" | "gallery" | "team" | "process" | "contact_form";
    heading: string;
    subheading?: string;
    content?: string;
    items?: Array<{ title: string; description: string }>;
    /** Set true when a value is an editable stand-in rather than a real fact — the UI must render this distinctly and prompt the customer to confirm it. */
    needsConfirmation?: boolean;
  }[];
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
  status: "draft" | "preview" | "in_revision" | "approved" | "published";
  previewSubdomain: string;
  customDomain?: string;
  pages: SitePage[];
  revisionNotes?: string;
  revisionCount: number;
  exportUnlocked: boolean;
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
