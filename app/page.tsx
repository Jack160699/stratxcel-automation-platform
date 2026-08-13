import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { CommercialTrustSection } from "@/app/components/public/commercial/CommercialTrustGrid";
import { PlatformHero } from "@/app/components/public/home/PlatformHero";
import { HomeBusinessWorkSection } from "@/app/components/public/home/HomeBusinessWorkSection";
import { HomeSectionSlot } from "@/app/components/public/home/HomeSectionSlot";
import { HomeAuditOffer } from "@/app/components/public/home/HomeAuditOffer";
import { HomeFinalCta } from "@/app/components/public/home/HomeFinalCta";
import { HomeAiWorkforce } from "@/app/components/public/home/HomeAiWorkforce";
import { HomeIntegrationsPreview } from "@/app/components/public/home/HomeIntegrationsPreview";
import { HomePricingBridge } from "@/app/components/public/home/HomePricingBridge";
import { HomeSolutionsPreview } from "@/app/components/public/home/HomeSolutionsPreview";
import { HomeProductsPreview } from "@/app/components/public/product-suite/HomeProductsPreview";
import { ProductShowcase } from "@/app/components/public/showcase/ProductShowcase";

export const metadata: Metadata = {
  title: "Stratxcel — Marketing, Customers & Daily Work in One Place",
  description:
    "Stratxcel helps local and growing businesses get found, follow up faster, and get more done — with AI in one connected workspace.",
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-sx-bg text-sx-text">
      <PublicHeader logoVariant="light" />
      <main className="flex-1">
        <PlatformHero />
        <HomeBusinessWorkSection />

        <HomeSectionSlot id="products" sectionKey="products" label="Products" bordered={false}>
          <HomeProductsPreview />
        </HomeSectionSlot>

        <HomeSectionSlot id="product-proof" sectionKey="product-proof" label="Real Product Proof">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <ProductShowcase standalone={false} />
          </div>
        </HomeSectionSlot>

        <HomeSectionSlot id="solutions" sectionKey="solutions" label="Outcomes and Solutions">
          <HomeSolutionsPreview />
        </HomeSectionSlot>

        <HomeSectionSlot id="ai-workforce" sectionKey="ai-workforce" label="AI Workforce">
          <HomeAiWorkforce />
        </HomeSectionSlot>

        <HomeSectionSlot id="integrations" sectionKey="integrations" label="Integrations">
          <HomeIntegrationsPreview />
        </HomeSectionSlot>

        <HomeAuditOffer />
        <CommercialTrustSection />

        <HomeSectionSlot id="pricing" sectionKey="pricing" label="Pricing" bordered={false}>
          <HomePricingBridge />
        </HomeSectionSlot>

        <HomeFinalCta />
      </main>
      <PublicFooter logoVariant="light" />
    </div>
  );
}
