import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { CommercialTrustSection } from "@/app/components/public/commercial/CommercialTrustGrid";
import { ConversionFaqSection } from "@/app/components/public/commercial/ConversionFaqSection";
import { ConversionTrustQuestions } from "@/app/components/public/commercial/ConversionTrustQuestions";
import { PlatformHero } from "@/app/components/public/home/PlatformHero";
import { GrowthLoopSection } from "@/app/components/public/home/GrowthLoopSection";
import { HomeSectionSlot } from "@/app/components/public/home/HomeSectionSlot";
import { HomeAuditOffer } from "@/app/components/public/home/HomeAuditOffer";
import { HomeFinalCta } from "@/app/components/public/home/HomeFinalCta";
import { HomeAiWorkforce } from "@/app/components/public/home/HomeAiWorkforce";
import { HomeIntegrationsPreview } from "@/app/components/public/home/HomeIntegrationsPreview";
import { HomePricingBridge } from "@/app/components/public/home/HomePricingBridge";
import { HomeSolutionsPreview } from "@/app/components/public/home/HomeSolutionsPreview";
import { HomeProductsPreview } from "@/app/components/public/product-suite/HomeProductsPreview";
import { ProductShowcase } from "@/app/components/public/showcase/ProductShowcase";
import { JOURNEY_OBJECTIONS } from "@/lib/commercial/objections";

export const metadata: Metadata = {
  title: "Stratxcel — Your AI Growth Operating System",
  description:
    "Research your market, create content, grow on search, manage leads, and run campaigns from one connected AI growth platform.",
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        <PlatformHero />
        <GrowthLoopSection />

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
        <ConversionTrustQuestions />
        <CommercialTrustSection />
        <HomeSectionSlot id="objections" sectionKey="objections" label="Common Questions" bordered={false}>
          <ConversionFaqSection title="Straight answers for small-business owners" subtitle="No AI jargon, no fake urgency." items={JOURNEY_OBJECTIONS} className="py-14" />
        </HomeSectionSlot>

        <HomeSectionSlot id="pricing" sectionKey="pricing" label="Pricing" bordered={false}>
          <HomePricingBridge />
        </HomeSectionSlot>

        <HomeFinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
