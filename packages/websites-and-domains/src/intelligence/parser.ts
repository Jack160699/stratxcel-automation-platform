/**
 * HTML Parser & Semantic Extractor for Website Intelligence Engine
 *
 * Extracts:
 *   - Metadata (title, description, canonical, OG, Twitter)
 *   - Navigation hierarchies & primary links
 *   - Semantic sections (Hero, Features, Pricing, Testimonials, CTA, Footer, etc.)
 *   - Headings & heading hierarchy
 *   - Forms & Form fields
 *   - Buttons & Actionable CTAs
 *   - Media & Asset links with provenance tags
 *   - Integrations & third-party scripts
 */

import type {
  PageUnderstanding,
  NavigationItem,
  SectionUnderstanding,
  ImageUnderstanding,
  AssetUnderstanding,
  FormUnderstanding,
  CtaUnderstanding,
  IntegrationUnderstanding,
  SeoUnderstanding,
} from "./schema.ts";

export interface ParsedHtmlDocument {
  title: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  headings: Array<{ level: number; text: string }>;
  navigation: NavigationItem[];
  sections: SectionUnderstanding[];
  images: ImageUnderstanding[];
  assets: AssetUnderstanding[];
  forms: FormUnderstanding[];
  ctas: CtaUnderstanding[];
  integrations: IntegrationUnderstanding[];
  page: PageUnderstanding;
  seo: SeoUnderstanding;
  rawText: string;
  wordCount: number;
}

/**
 * Strips HTML tags and entities to produce clean plain text.
 */
function cleanText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseHtml(html: string, url: string = "https://example.com"): ParsedHtmlDocument {
  // 1. Meta & Title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : "";

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const metaDescription = descMatch ? descMatch[1].trim() : undefined;

  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1].trim() : undefined;

  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : undefined;

  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const ogDescription = ogDescMatch ? ogDescMatch[1].trim() : undefined;

  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
  const ogImage = ogImageMatch ? ogImageMatch[1].trim() : undefined;

  // 2. Headings
  const headings: Array<{ level: number; text: string }> = [];
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    const level = parseInt(hMatch[1], 10);
    const text = cleanText(hMatch[2]);
    if (text) {
      headings.push({ level, text });
    }
  }

  // 3. Navigation Links
  const navigation: NavigationItem[] = [];
  const navBlockMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i) || html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  if (navBlockMatch) {
    const linkRegex = /<a\b[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let lMatch: RegExpExecArray | null;
    while ((lMatch = linkRegex.exec(navBlockMatch[1])) !== null) {
      const href = lMatch[1].trim();
      const label = cleanText(lMatch[2]);
      if (label && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        navigation.push({
          label,
          path: href.startsWith("http") ? new URL(href).pathname : href,
          href,
          isPrimary: true,
        });
      }
    }
  }

  // 4. Semantic Sections
  const sections: SectionUnderstanding[] = [];
  let order = 0;

  // Hero section heuristic
  const heroMatch = html.match(/<(?:section|div)[^>]*(?:class|id)=["'][^"']*(?:hero|banner|jumbotron)[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|div)>/i);
  if (heroMatch || (headings.length > 0 && headings[0].level === 1)) {
    sections.push({
      type: "hero",
      heading: headings.find((h) => h.level === 1)?.text || "Main Headline",
      summary: heroMatch ? cleanText(heroMatch[1]).slice(0, 200) : "Hero Banner Section",
      order: order++,
      componentHints: ["HeroHeadline", "CtaButtonGroup", "HeroMedia"],
    });
  }

  // Features / Services section heuristic
  if (/features|services|what-we-do|benefits/i.test(html)) {
    sections.push({
      type: "features",
      heading: "Features & Capabilities",
      summary: "Key value propositions and core offerings",
      order: order++,
      componentHints: ["FeatureGrid", "IconCard"],
    });
  }

  // Testimonials / Social proof
  if (/testimonial|reviews|social-proof|clients/i.test(html)) {
    sections.push({
      type: "testimonials",
      heading: "Customer Reviews",
      summary: "Social proof, client testimonials, and ratings",
      order: order++,
      componentHints: ["TestimonialCard", "StarRating"],
    });
  }

  // Pricing
  if (/pricing|plans|price-table|subscription/i.test(html)) {
    sections.push({
      type: "pricing",
      heading: "Pricing & Plans",
      summary: "Tiered package breakdown and pricing cards",
      order: order++,
      componentHints: ["PricingCard", "FeatureComparison"],
    });
  }

  // Footer
  if (/<footer\b/i.test(html)) {
    sections.push({
      type: "footer",
      heading: "Footer",
      summary: "Site navigation, copyright, and social links",
      order: order++,
      componentHints: ["FooterNav", "CopyrightBlock"],
    });
  }

  // 5. Images
  const images: ImageUnderstanding[] = [];
  const imgRegex = /<img\b[^>]+src=["']([^"']*)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let iMatch: RegExpExecArray | null;
  while ((iMatch = imgRegex.exec(html)) !== null) {
    const src = iMatch[1].trim();
    const alt = iMatch[2]?.trim() || "";
    if (src && !src.startsWith("data:image/svg")) {
      const isLogo = /logo/i.test(src) || /logo/i.test(alt);
      const isHero = /hero|banner/i.test(src) || /hero|banner/i.test(alt);
      images.push({
        url: src,
        alt,
        role: isLogo ? "logo" : isHero ? "hero" : "content",
        provenance: "public-reference",
      });
    }
  }

  // 6. Assets (Fonts, Stylesheets)
  const assets: AssetUnderstanding[] = [];
  const fontRegex = /https:\/\/fonts\.googleapis\.com\/css2\?family=([^&"']+)/gi;
  let fMatch: RegExpExecArray | null;
  while ((fMatch = fontRegex.exec(html)) !== null) {
    assets.push({
      type: "font",
      url: fMatch[0],
      provenance: "public-reference",
    });
  }

  // 7. Forms
  const forms: FormUnderstanding[] = [];
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch: RegExpExecArray | null;
  while ((formMatch = formRegex.exec(html)) !== null) {
    const formAttrs = formMatch[1];
    const formBody = formMatch[2];

    const isContact = /contact/i.test(formAttrs) || /contact/i.test(formBody);
    const isNewsletter = /newsletter|subscribe|email-capture/i.test(formAttrs) || /newsletter|subscribe/i.test(formBody);
    const isSearch = /search/i.test(formAttrs);

    const fieldNames: string[] = [];
    const inputRegex = /<input\b[^>]+name=["']([^"']*)["']/gi;
    let inputMatch: RegExpExecArray | null;
    while ((inputMatch = inputRegex.exec(formBody)) !== null) {
      fieldNames.push(inputMatch[1]);
    }

    const buttonMatch = formBody.match(/<button\b[^>]*>(.*?)<\/button>/i) || formBody.match(/<input\b[^>]+type=["']submit["'][^>]+value=["']([^"']*)["']/i);
    const submitLabel = buttonMatch ? cleanText(buttonMatch[1]) : "Submit";

    forms.push({
      purpose: isContact ? "contact" : isNewsletter ? "newsletter" : isSearch ? "search" : "lead_capture",
      fieldNames,
      submitLabel,
    });
  }

  // 8. CTAs
  const ctas: CtaUnderstanding[] = [];
  const btnRegex = /<(?:button|a)\b[^>]*(?:class=["'][^"']*(?:btn|cta|button)[^"']*["'])[^>]*>(.*?)<\/(?:button|a)>/gi;
  let btnMatch: RegExpExecArray | null;
  while ((btnMatch = btnRegex.exec(html)) !== null) {
    const text = cleanText(btnMatch[1]);
    if (text && text.length < 40) {
      ctas.push({
        text,
        href: "#",
        styleVariant: "primary",
        location: "body",
      });
    }
  }

  // 9. Integrations
  const integrations: IntegrationUnderstanding[] = [];
  if (/gtag|google-analytics\.com|googletagmanager\.com/i.test(html)) {
    integrations.push({ name: "Google Analytics / Tag Manager", type: "analytics" });
  }
  if (/facebook\.net\/.*\/fbevents\.js|fbq\(/i.test(html)) {
    integrations.push({ name: "Meta / Facebook Pixel", type: "marketing" });
  }
  if (/crisp\.chat|widget\.intercom\.io|tawk\.to/i.test(html)) {
    integrations.push({ name: "Customer Live Chat", type: "chat" });
  }
  if (/checkout\.stripe\.com|checkout\.razorpay\.com/i.test(html)) {
    integrations.push({ name: "Payment Gateway", type: "payment" });
  }

  const rawText = cleanText(html);
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  const urlObj = new URL(url);
  const isHomepage = urlObj.pathname === "/" || urlObj.pathname === "";

  const page: PageUnderstanding = {
    url,
    path: urlObj.pathname,
    title: title || "Home",
    description: metaDescription,
    sectionCount: sections.length,
    wordCount,
    isHomepage,
    headings,
  };

  const seo: SeoUnderstanding = {
    metaTitle: title,
    metaDescription,
    ogTitle,
    ogDescription,
    ogImage,
    canonical: canonicalUrl,
    hasRobotsTxt: false,
    hasSitemap: false,
    structuredDataTypes: html.includes("application/ld+json") ? ["Schema.org JSON-LD"] : [],
    headingHierarchyValid: headings.length > 0 && headings.some((h) => h.level === 1),
  };

  return {
    title,
    metaDescription,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
    headings,
    navigation,
    sections,
    images,
    assets,
    forms,
    ctas,
    integrations,
    page,
    seo,
    rawText,
    wordCount,
  };
}
