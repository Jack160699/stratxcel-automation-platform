import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { PlatformHero } from "@/app/components/public/home/PlatformHero";
import { GrowthLoopSection } from "@/app/components/public/home/GrowthLoopSection";
import { HomeSectionSlot } from "@/app/components/public/home/HomeSectionSlot";
import { HomeAuditOffer } from "@/app/components/public/home/HomeAuditOffer";
import { HomeTrustSection } from "@/app/components/public/home/HomeTrustSection";
import { HomeFinalCta } from "@/app/components/public/home/HomeFinalCta";

export const metadata: Metadata = {
  title: "Stratxcel — Your AI Growth Operating System",
  description:
    "Research your market, create content, grow on search, manage leads, and run campaigns from one connected AI growth platform.",
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        {/* 1. Platform Hero */}
        <PlatformHero />

        {/* 2. One Platform / Growth Loop */}
        <GrowthLoopSection />

        {/* 3. Products — Wave-1 integration slot */}
        <HomeSectionSlot id="products" sectionKey="products" label="Products" />

        {/* 4. Real Product Proof — Wave-1 integration slot */}
        <HomeSectionSlot id="product-proof" sectionKey="product-proof" label="Real Product Proof" />

        {/* 5. Outcomes / Solutions — Wave-1 integration slot */}
        <HomeSectionSlot id="solutions" sectionKey="solutions" label="Outcomes and Solutions" />

        {/* 6. AI Workforce — Wave-1 integration slot */}
        <HomeSectionSlot id="ai-workforce" sectionKey="ai-workforce" label="AI Workforce" />

        {/* 7. Integrations — Wave-1 integration slot */}
        <HomeSectionSlot id="integrations" sectionKey="integrations" label="Integrations" />

        {/* 8. Business Audit entry offer */}
        <HomeAuditOffer />

        {/* 9. Trust */}
        <HomeTrustSection />

        {/* 10. Pricing — minimal bridge until Wave-1 pricing section lands */}
        <HomeSectionSlot id="pricing" sectionKey="pricing" label="Pricing" bordered={false}>
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">Plans</h2>
              <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
                Monthly plans are staff-activated during closed beta after scope and availability are confirmed.
              </p>
              <Link
                href="/pricing"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-7 py-3 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
              >
                See plan details
              </Link>
            </div>
          </div>
        </HomeSectionSlot>

        {/* 11. Final CTA */}
        <HomeFinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
