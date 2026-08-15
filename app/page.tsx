import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { HomeHeroLight } from "@/app/components/public/home/HomeHeroLight";
import { HomeBenefitStrip } from "@/app/components/public/home/HomeBenefitStrip";
import { HomeWhatItHelpsWith } from "@/app/components/public/home/HomeWhatItHelpsWith";
import { HomeSimpleSteps } from "@/app/components/public/home/HomeSimpleSteps";
import { HomeInteractiveExplorerClean } from "@/app/components/public/home/HomeInteractiveExplorerClean";
import { HomeBusinessTypes } from "@/app/components/public/home/HomeBusinessTypes";
import { HomeProductEvidence } from "@/app/components/public/home/HomeProductEvidence";
import { HomeAuditSection } from "@/app/components/public/home/HomeAuditSection";
import { HomeTrustControl } from "@/app/components/public/home/HomeTrustControl";
import { HomeClosingSection } from "@/app/components/public/home/HomeClosingSection";

export const metadata: Metadata = {
  title: "Stratxcel AI Agent — You Run Your Business. We Help With The Digital Work.",
  description:
    "Stratxcel helps plan, create, manage and improve the digital work behind your business. Start with a free evidence-based Instant Business Audit.",
  alternates: {
    canonical: "https://www.stratxcel.in",
  },
  openGraph: {
    title: "Stratxcel AI Agent — Business Assistant & Growth Team",
    description:
      "Stratxcel helps plan, create, manage and improve the digital work behind your business with human approval at every step.",
    url: "https://www.stratxcel.in",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Agent" }],
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-white font-sx-sans text-slate-900 antialiased">
      {/* Primary Sticky Header */}
      <PublicHeader logoVariant="light" />

      <main className="flex-1">
        {/* 01 HERO */}
        <HomeHeroLight />

        {/* 02 RESULTS / BENEFITS */}
        <HomeBenefitStrip />

        {/* 03 WHAT STRATXCEL HELPS WITH */}
        <HomeWhatItHelpsWith />

        {/* 04 HOW IT WORKS */}
        <HomeSimpleSteps />

        {/* 05 WHAT DO YOU NEED HELP WITH? / BUSINESS EXPLORER */}
        <HomeInteractiveExplorerClean />
        <HomeBusinessTypes />

        {/* 06 REAL PRODUCT EVIDENCE */}
        <HomeProductEvidence />

        {/* 07 FREE BUSINESS GROWTH AUDIT */}
        <HomeAuditSection />

        {/* 08 TRUST / CONTROL */}
        <HomeTrustControl />

        {/* 09 FINAL CTA */}
        <HomeClosingSection />
      </main>

      {/* Public Footer with Verified Destinations */}
      <PublicFooter logoVariant="light" />
    </div>
  );
}
