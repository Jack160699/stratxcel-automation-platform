export interface SitePage {
  id: string;
  title: string;
  slug: string;
  sections: {
    type: "hero" | "features" | "about" | "testimonials" | "contact_form";
    heading: string;
    subheading?: string;
    content?: string;
    items?: Array<{ title: string; description: string }>;
  }[];
}

export interface SiteProjectInput {
  tenantId: string;
  businessName: string;
  industry?: string;
  contactEmail?: string;
  contactPhone?: string;
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

export function generate5PageSite(input: SiteProjectInput): SiteProject {
  const slug = input.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const previewSubdomain = `${slug}.stratxcel.site`;

  const pages: SitePage[] = [
    {
      id: "page_home",
      title: "Home",
      slug: "",
      sections: [
        {
          type: "hero",
          heading: `Welcome to ${input.businessName}`,
          subheading: "Accelerate your growth with AI-powered operational automation and premium digital experiences.",
        },
        {
          type: "features",
          heading: "Our Solutions",
          items: [
            { title: "Automated Lead Capture", description: "Convert website visitors directly into active CRM leads." },
            { title: "WhatsApp Business Integration", description: "Engage clients instantly with automated multi-channel messaging." },
            { title: "Growth Optimization", description: "Data-driven analytics to maximize campaign return on investment." },
          ],
        },
      ],
    },
    {
      id: "page_services",
      title: "Services",
      slug: "services",
      sections: [
        {
          type: "features",
          heading: "Comprehensive Business Services",
          items: [
            { title: "Digital Marketing & Ads", description: "Targeted Meta & Search campaigns designed for high conversion." },
            { title: "Social Content Creation", description: "Consistent visual and editorial content tailored to your target market." },
            { title: "CRM & Workflow Automation", description: "Streamlined operational flows to eliminate repetitive admin tasks." },
          ],
        },
      ],
    },
    {
      id: "page_about",
      title: "About Us",
      slug: "about",
      sections: [
        {
          type: "about",
          heading: `About ${input.businessName}`,
          content: `${input.businessName} is dedicated to delivering industry-leading service and innovation to our valued clients.`,
        },
      ],
    },
    {
      id: "page_reviews",
      title: "Client Reviews",
      slug: "reviews",
      sections: [
        {
          type: "testimonials",
          heading: "What Our Clients Say",
          items: [
            { title: "Outstanding Results", description: "Working with the team transformed our client response time and booking rates." },
            { title: "Seamless Automation", description: "Our sales pipeline is cleaner and more predictable than ever before." },
          ],
        },
      ],
    },
    {
      id: "page_contact",
      title: "Contact Us",
      slug: "contact",
      sections: [
        {
          type: "contact_form",
          heading: "Get in Touch",
          subheading: `Contact our team at ${input.contactEmail ?? "info@" + slug + ".com"} or call ${input.contactPhone ?? "+91 98765 43210"}.`,
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
    throw new Error("Growth includes 1 revision cycle. Additional revisions require an approved add-on.");
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
