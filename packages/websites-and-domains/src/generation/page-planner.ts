/**
 * Dynamic Page Architecture & Section Planner
 *
 * Plans complete page structures based on the website type:
 *   - LANDING_PAGE
 *   - BUSINESS_WEBSITE
 *   - ECOMMERCE
 *   - SERVICE_BUSINESS
 *   - AI_BUSINESS
 */

import type { WebsiteType, PageSpec } from "../specification/schema.ts";
import type { BusinessBrandContext } from "./types.ts";

export function planPageArchitecture(
  websiteType: WebsiteType,
  brandContext?: BusinessBrandContext
): PageSpec[] {
  const brandName = brandContext?.businessName || "Our Brand";

  switch (websiteType) {
    case "ECOMMERCE":
      return [
        {
          id: "page_home",
          slug: "",
          title: "Home",
          isHomepage: true,
          seo: {
            title: `${brandName} | Premium Online Store`,
            metaDescription: `Explore our exclusive collection at ${brandName}. Handcrafted quality, seamless shopping, and express worldwide delivery.`,
          },
          sections: [
            {
              type: "hero",
              heading: `Elevate Your Style with ${brandName}`,
              subheading: "Discover our latest curated seasonal collection designed with unmatched elegance.",
              ctaText: "Shop New Arrivals",
              ctaLink: "/shop",
            },
            // Found live (2026-09-02, same defect class as the testimonials fix
            // below): this section hardcoded three fabricated products
            // ("Signature Tailored Blazer... ₹24,999" and two others) with no
            // connection to the real business's actual catalog -- for a website
            // about to be published live as the customer's own storefront. No
            // "products" section is generated here at all now, same rule as
            // testimonials: "real verified data, clearly marked placeholder, or
            // nothing" -- there is no real product data at generation time.
            {
              type: "features",
              heading: "Why Choose Us",
              items: [
                { title: "Artisan Craftsmanship", description: "Ethically sourced materials and master craftsmanship." },
                { title: "Express Worldwide Shipping", description: "Fast and insured delivery straight to your doorstep." },
                { title: "30-Day Hassle-Free Returns", description: "Love it or exchange it with complete peace of mind." },
              ],
            },
            // Found live during E2E testing: this section fabricated a
            // specific customer count ("Loved by Over 50,000 Customers")
            // and two named reviewers with invented quotes -- for a website
            // about to be published live as the customer's own storefront,
            // with no real review data behind any of it. No testimonials
            // section is generated here at all now; the mission's own rule
            // is "real verified data, clearly marked placeholder, or
            // nothing" -- there is no real data at generation time, and an
            // invented placeholder quote risks being published unedited
            // just as easily as the fabricated one it would replace.
          ],
        },
        {
          id: "page_shop",
          slug: "shop",
          title: "Shop",
          isHomepage: false,
          seo: {
            title: `Shop All Collections | ${brandName}`,
            metaDescription: `Browse all items, categories, and latest drops from ${brandName}.`,
          },
          sections: [
            {
              type: "hero",
              heading: "All Collections",
              subheading: "Explore every curated item designed for perfection.",
            },
            // Found live (2026-09-02): same fabricated-products defect as the
            // homepage "Trending Favorites" section above ("Classic Knit
            // Crewneck... ₹14,999" and one other, again invented). Removed for
            // the same reason -- no real catalog data exists at generation time.
          ],
        },
        {
          id: "page_about",
          slug: "about",
          title: "Our Story",
          isHomepage: false,
          seo: {
            title: `Our Story & Heritage | ${brandName}`,
            metaDescription: `Learn about the passion, mission, and artisans behind ${brandName}.`,
          },
          sections: [
            {
              type: "hero",
              heading: "Born from a Passion for Quality",
              subheading: `At ${brandName}, we believe luxury is in the details.`,
            },
            {
              type: "about",
              heading: "The Artisan Craft",
              content: `${brandName} was established to bring uncompromising craftsmanship directly to discerning customers worldwide.`,
            },
          ],
        },
        {
          id: "page_journal",
          slug: "journal",
          title: "Journal",
          isHomepage: false,
          seo: {
            title: `Journal & Editorial Stories | ${brandName}`,
            metaDescription: `Read our latest journal entries, brewing guides, and artisanal craft stories at ${brandName}.`,
          },
          sections: [
            {
              type: "hero",
              heading: "The Obsidian Journal",
              subheading: "Stories of origin, craft, tasting notes, and brewing perfection.",
            },
            {
              type: "features",
              heading: "Featured Articles",
              items: [
                { title: "The Art of Slow Pour-Over", description: "Mastering temperature, flow rate, and extraction balance." },
                { title: "Direct Trade in Yirgacheffe", description: "Supporting sustainable farming communities in southern Ethiopia." },
              ],
            },
          ],
        },
        {
          id: "page_contact",
          slug: "contact",
          title: "Contact",
          isHomepage: false,
          seo: {
            title: `Contact Us | ${brandName}`,
            metaDescription: `Get in touch with the ${brandName} concierge support team.`,
          },
          sections: [
            {
              type: "contact_form",
              heading: "We're Here to Help",
              subheading: "Reach out with any sizing questions or custom inquiries.",
            },
          ],
        },
      ];

    case "SERVICE_BUSINESS":
      return [
        {
          id: "page_home",
          slug: "",
          title: "Home",
          isHomepage: true,
          seo: {
            title: `${brandName} | Professional Services`,
            metaDescription: `High-impact solutions and expert advisory from ${brandName}.`,
          },
          sections: [
            {
              type: "hero",
              heading: `Transforming Your Business with ${brandName}`,
              subheading: "Industry-leading consulting, strategy, and execution tailored for exponential growth.",
              ctaText: "Book a Consultation",
              ctaLink: "/contact",
            },
            {
              type: "features",
              heading: "Our Core Services",
              subheading: "End-to-end expertise designed to scale your operations.",
              items: [
                { title: "Strategic Growth Advisory", description: "Comprehensive market analysis and growth roadmaps." },
                { title: "Operational Excellence", description: "Automating workflows and maximizing operational margins." },
                { title: "Technology Modernization", description: "Modern cloud architecture and intelligent automation." },
              ],
            },
            // Found live during E2E testing: this fabricated a named
            // reviewer at a fake company ("David Chen — CEO, NexaTech")
            // whose quote claimed "Stratxcel" (the platform itself,
            // hardcoded -- not this customer's actual business, which
            // ${brandName} is used for everywhere else in this file)
            // helped them, on every SERVICE_BUSINESS site regardless of
            // who the actual customer is. No testimonials section is
            // generated here at all now -- see the identical rationale on
            // the ECOMMERCE case above.
            {
              type: "cta",
              heading: "Ready to accelerate your growth?",
              subheading: "Schedule a confidential discovery call with our principal advisors.",
              ctaText: "Schedule Consultation",
              ctaLink: "/contact",
            },
          ],
        },
        {
          id: "page_services",
          slug: "services",
          title: "Services",
          isHomepage: false,
          seo: { title: `Services | ${brandName}`, metaDescription: `Explore consulting and execution services from ${brandName}.` },
          sections: [
            { type: "hero", heading: "Our Services & Capabilities", subheading: "Tailored solutions for modern enterprises." },
            {
              type: "features",
              heading: "Strategic Execution",
              items: [
                { title: "Enterprise Scaling", description: "Proven playbooks for hypergrowth companies." },
              ],
            },
          ],
        },
        {
          id: "page_contact",
          slug: "contact",
          title: "Contact",
          isHomepage: false,
          seo: { title: `Contact Us | ${brandName}`, metaDescription: `Get in touch with ${brandName}.` },
          sections: [
            { type: "contact_form", heading: "Let's Start a Conversation", subheading: "Tell us about your project goals." },
          ],
        },
      ];

    case "LANDING_PAGE":
      return [
        {
          id: "page_home",
          slug: "",
          title: "Home",
          isHomepage: true,
          seo: {
            title: `${brandName} | Launch Your Vision`,
            metaDescription: `The single best solution for modern growth. Experience ${brandName} today.`,
          },
          sections: [
            {
              type: "hero",
              heading: `The Modern Platform for ${brandName}`,
              subheading: "Empowering fast-moving teams with intelligent automation and world-class design.",
              ctaText: "Get Started Free",
              ctaLink: "#pricing",
            },
            {
              type: "features",
              heading: "Built for Velocity & Scale",
              items: [
                { title: "Instant Deployment", description: "Go live globally in seconds with automated SSL & CDN." },
                { title: "Autonomous AI Agents", description: "24/7 intelligent sales and customer concierge built-in." },
                { title: "Zero-Maintenance Hosting", description: "99.99% uptime with automated point-in-time recovery." },
              ],
            },
            // Found live (2026-09-02): same fabricated-data defect -- this
            // section hardcoded two invented plan names/features/prices
            // ("Starter... ₹2,999/mo", "Pro... ₹6,999/mo") with no connection
            // to whatever the real business actually charges. No "pricing"
            // section is generated here at all now -- there is no real pricing
            // data at generation time.
            {
              type: "faq",
              heading: "Frequently Asked Questions",
              items: [
                { title: "How long does it take to launch?", description: "Your custom website is generated and deployed in under 2 minutes." },
                { title: "Can I connect my own custom domain?", description: "Yes, you can register a new domain or attach an existing domain instantly." },
              ],
            },
          ],
        },
      ];

    case "BUSINESS_WEBSITE":
    default:
      return [
        {
          id: "page_home",
          slug: "",
          title: "Home",
          isHomepage: true,
          seo: {
            title: `${brandName} | Official Website`,
            metaDescription: `Welcome to ${brandName}. Discover our mission, products, and excellence.`,
          },
          sections: [
            {
              type: "hero",
              heading: `Welcome to ${brandName}`,
              subheading: "Crafting exceptional experiences and building lasting value for our clients.",
              ctaText: "Discover More",
              ctaLink: "/about",
            },
            {
              type: "features",
              heading: "Our Core Pillars",
              items: [
                { title: "Innovation", description: "Pioneering state-of-the-art solutions." },
                { title: "Integrity", description: "Transparent, reliable, and client-first." },
                { title: "Excellence", description: "Uncompromising attention to quality." },
              ],
            },
            // Found live during E2E testing: this fabricated a named
            // reviewer ("Elena Rostova — Director") and an invented quote
            // for every BUSINESS_WEBSITE-type site -- confirmed live on the
            // real Stratxcel tenant's own generated site. No testimonials
            // section is generated here at all now -- see the identical
            // rationale on the ECOMMERCE case above.
          ],
        },
        {
          id: "page_about",
          slug: "about",
          title: "About Us",
          isHomepage: false,
          seo: { title: `About Us | ${brandName}`, metaDescription: `The history, vision, and team behind ${brandName}.` },
          sections: [
            { type: "hero", heading: "Our Journey & Purpose", subheading: "Dedicated to creating meaningful impact." },
            { type: "about", heading: "Our Philosophy", content: `${brandName} was established with a singular commitment to excellence.` },
          ],
        },
        {
          id: "page_contact",
          slug: "contact",
          title: "Contact",
          isHomepage: false,
          seo: { title: `Contact Us | ${brandName}`, metaDescription: `Reach out to ${brandName} today.` },
          sections: [
            { type: "contact_form", heading: "Connect with Us", subheading: "We would love to hear from you." },
          ],
        },
      ];
  }
}
