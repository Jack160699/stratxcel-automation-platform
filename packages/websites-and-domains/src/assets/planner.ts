/**
 * Image Strategy & Asset Planning Engine
 *
 * Automatically plans required images, logos, responsive dimensions,
 * alt-text directives, and generation prompts based on website specifications.
 */

import type { AssetPlan, AssetPlanItem } from "./schema.ts";
import type { WebsiteSpecification, WebsiteType } from "../specification/schema.ts";

export function planWebsiteAssets(
  tenantId: string,
  spec: WebsiteSpecification,
  projectId?: string
): AssetPlan {
  const brand = spec.brand.businessName;
  const industry = spec.brand.industry || "Modern Business";
  const items: AssetPlanItem[] = [];

  // 1. Brand Logo & Favicon
  items.push({
    key: "brand-logo",
    type: "logo",
    usage: "logo",
    targetDimensions: { width: 512, height: 128, aspectRatio: "4:1" },
    altTextDirective: `${brand} official brand logo`,
    preferredProvenance: "customer-provided",
    requiredForLaunch: false,
  });

  items.push({
    key: "brand-favicon",
    type: "favicon",
    usage: "favicon",
    targetDimensions: { width: 64, height: 64, aspectRatio: "1:1" },
    altTextDirective: `${brand} site icon`,
    preferredProvenance: "generated",
    requiredForLaunch: false,
  });

  // 2. OpenGraph Social Sharing Image
  items.push({
    key: "og-banner",
    type: "og-image",
    usage: "og_banner",
    targetDimensions: { width: 1200, height: 630, aspectRatio: "1.91:1" },
    altTextDirective: `${brand} social sharing banner — ${spec.brand.tagline || industry}`,
    generationPrompt: `High-resolution editorial banner for ${brand}, ${industry}, minimalist luxury aesthetic, 1200x630`,
    preferredProvenance: "generated",
    requiredForLaunch: true,
  });

  // 3. Homepage Hero Imagery
  items.push({
    key: "hero-main",
    type: "image",
    usage: "hero",
    targetDimensions: { width: 1920, height: 1080, aspectRatio: "16:9" },
    altTextDirective: `High quality hero photograph representing ${brand}`,
    generationPrompt: `Ultra-high quality professional hero photograph for ${brand} in ${industry}, clean cinematic lighting, 8k resolution`,
    preferredProvenance: "generated",
    requiredForLaunch: true,
  });

  // 4. E-Commerce Product Photography
  if (spec.websiteType === "ECOMMERCE") {
    for (let i = 1; i <= 4; i++) {
      items.push({
        key: `product-item-${i}`,
        type: "image",
        usage: "product",
        targetDimensions: { width: 800, height: 1000, aspectRatio: "4:5" },
        altTextDirective: `${brand} signature collection product item #${i}`,
        generationPrompt: `Clean studio product photography for ${brand} apparel item #${i}, soft diffused lighting on pure neutral background, 4:5 aspect ratio`,
        preferredProvenance: "placeholder",
        requiredForLaunch: false,
      });
    }
  }

  // 5. Service / About Story Imagery
  items.push({
    key: "about-lifestyle",
    type: "image",
    usage: "gallery",
    targetDimensions: { width: 1200, height: 800, aspectRatio: "3:2" },
    altTextDirective: `Behind the scenes and craftsmanship at ${brand}`,
    generationPrompt: `Authentic editorial craftsmanship and workspace photography for ${brand}, warm ambient lighting`,
    preferredProvenance: "generated",
    requiredForLaunch: false,
  });

  return {
    tenantId,
    projectId,
    brandName: brand,
    items,
    totalRequired: items.length,
    totalPlaceholdersAllowed: items.filter((i) => !i.requiredForLaunch).length,
  };
}
