/**
 * Structured Change Applier
 *
 * Deterministically applies changes onto WebsiteSpecification and SiteProject.
 */

import type { WebsiteSpecification, PageSpec, SectionSpec } from "../specification/schema.ts";
import { generateSiteFromSpecification, type SiteProject } from "../site-builder.ts";
import type { WebsiteChange } from "./types.ts";

export function applyChangeToSpecification(
  spec: WebsiteSpecification,
  change: WebsiteChange
): WebsiteSpecification {
  const updated = JSON.parse(JSON.stringify(spec)) as WebsiteSpecification;
  const norm = change.requestedChange.toLowerCase().trim();

  if (!updated.pages) {
    updated.pages = [];
  }

  if (!updated.visualStyle) {
    updated.visualStyle = {
      aesthetic: "modern",
      colorPalette: {
        primary: "#111827",
        secondary: "#374151",
        accent: "#C5A880",
        background: "#090D16",
        surface: "#131C2E",
        text: "#F8FAFC",
        textMuted: "#94A3B8",
      },
      typography: {
        headingFont: "Playfair Display, serif",
        bodyFont: "Inter, sans-serif",
        style: "editorial",
      },
      spacing: "comfortable",
      borderRadius: "rounded",
      imageStyle: "editorial",
    };
  }

  if (!updated.visualStyle.colorPalette) {
    updated.visualStyle.colorPalette = {
      primary: "#111827",
      secondary: "#374151",
      accent: "#C5A880",
      background: "#090D16",
      surface: "#131C2E",
      text: "#F8FAFC",
      textMuted: "#94A3B8",
    };
  }

  // 1. Content Changes
  if (norm.includes("headline") || norm.includes("hero")) {
    const home = updated.pages.find((p) => p.slug === "" || p.isHomepage) || updated.pages[0];
    if (home) {
      const hero = home.sections.find((s) => s.type === "hero");
      if (hero) {
        hero.heading = hero.heading.includes("—") ? hero.heading : `${hero.heading} — Reimagined`;
        hero.subheading = "Precision engineered for distinction and effortless performance.";
      }
    }
  }

  if (norm.includes("testimonial") || norm.includes("review")) {
    const home = updated.pages.find((p) => p.slug === "" || p.isHomepage) || updated.pages[0];
    if (home && !home.sections.some((s) => s.type === "testimonials")) {
      home.sections.push({
        type: "testimonials",
        heading: "Client Testimonials & Praise",
        subheading: "Trusted by leaders and tastemakers worldwide",
        items: [
          { title: "Elena Vance", description: "The attention to detail and craftsmanship exceeded our highest expectations." },
          { title: "Julian Croft", description: "Flawless experience from concept to launch. Truly exceptional quality." },
        ],
      });
    }
  }

  if (norm.includes("faq")) {
    const home = updated.pages.find((p) => p.slug === "" || p.isHomepage) || updated.pages[0];
    if (home && !home.sections.some((s) => s.type === "faq")) {
      home.sections.push({
        type: "faq",
        heading: "Frequently Asked Questions",
        items: [
          { title: "What is your delivery timeframe?", description: "Orders are prepared and dispatched within 24 to 48 business hours." },
          { title: "Do you offer bespoke customizations?", description: "Yes, our team can tailor every specification to your exact requirements." },
        ],
      });
    }
  }

  // 2. Design Changes
  if (norm.includes("luxur") || norm.includes("darker")) {
    updated.visualStyle.aesthetic = "luxury";
    updated.visualStyle.colorPalette.accent = "#C5A880";
    updated.visualStyle.colorPalette.background = "#090D16";
    updated.visualStyle.colorPalette.surface = "#131C2E";
    updated.visualStyle.colorPalette.text = "#F8FAFC";
    updated.visualStyle.typography.headingFont = "Playfair Display, serif";
  } else if (norm.includes("color") || norm.includes("button")) {
    updated.visualStyle.colorPalette.primary = "#4F46E5";
    updated.visualStyle.colorPalette.accent = "#06B6D4";
  }

  // 3. Page Structure Changes
  if (norm.includes("add an about page") || norm.includes("add about page")) {
    if (!updated.pages.some((p) => p.slug === "about")) {
      updated.pages.push({
        id: "page_about",
        slug: "about",
        title: "About Us",
        isHomepage: false,
        seo: {
          title: `About Us | ${updated.brand.businessName}`,
          metaDescription: `Discover the philosophy, ethos, and craftsmanship behind ${updated.brand.businessName}.`,
        },
        sections: [
          { type: "hero", heading: "Our Heritage & Story", subheading: "Founded on the principles of timeless distinction." },
          { type: "about", heading: "The Artisan Craft", content: `${updated.brand.businessName} was established to redefine quality standards.` },
        ],
      });

      updated.navigation.push({ label: "About", slug: "about" });
    }
  }

  if (norm.includes("remove faq page") || norm.includes("delete faq page")) {
    updated.pages = updated.pages.filter((p) => p.slug !== "faq");
    updated.navigation = updated.navigation.filter((n) => n.slug !== "faq");
  }

  // 4. E-Commerce Product Changes
  if (norm.includes("product") || norm.includes("price") || norm.includes("pricing") || norm.includes("summer collection")) {
    const home = updated.pages.find((p) => p.slug === "" || p.isHomepage) || updated.pages[0];
    if (home) {
      let prod = home.sections.find((s) => s.type === "products");
      if (!prod) {
        prod = {
          type: "products",
          heading: "Summer Signature Collection",
          subheading: "Latest limited edition releases",
          items: [
            { title: "Bespoke Linen Shirt", description: "Breathable Italian linen with tailored collar", price: "₹6,499" },
            { title: "Silk Resort Trousers", description: "Relaxed fit with elasticated drawstring", price: "₹8,999" },
          ],
        };
        home.sections.push(prod);
      } else {
        prod.heading = "Summer Signature Collection";
        prod.items = [
          { title: "Bespoke Linen Shirt", description: "Breathable Italian linen with tailored collar", price: "₹6,499" },
          { title: "Silk Resort Trousers", description: "Relaxed fit with elasticated drawstring", price: "₹8,999" },
        ];
      }
    }
  }

  // 5. SEO Changes
  if (norm.includes("seo") || norm.includes("meta title") || norm.includes("meta description")) {
    const home = updated.pages.find((p) => p.slug === "" || p.isHomepage) || updated.pages[0];
    if (home) {
      home.seo.title = `${updated.brand.businessName} | Official Flagship Store & Studio`;
      home.seo.metaDescription = `Experience the highest standards in luxury design and bespoke craftsmanship at ${updated.brand.businessName}.`;
    }
  }

  return updated;
}
