import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { PlatformHero } from "@/app/components/public/home/PlatformHero";
import { HomeHowItWorks } from "@/app/components/public/home/HomeHowItWorks";
import { HomeAiWorkforce } from "@/app/components/public/home/HomeAiWorkforce";
import { HomeConnectBusiness } from "@/app/components/public/home/HomeConnectBusiness";
import { HomeBusinessTypes } from "@/app/components/public/home/HomeBusinessTypes";
import { HomeUseCaseExplorer } from "@/app/components/public/home/HomeUseCaseExplorer";
import { HomeProductEvidence } from "@/app/components/public/home/HomeProductEvidence";
import { HomeAuditOffer } from "@/app/components/public/home/HomeAuditOffer";
import { HomeFinalCta } from "@/app/components/public/home/HomeFinalCta";

export const metadata: Metadata = {
  title: "Stratxcel AI Agent — Your AI Business Agent & Digital Operating Workforce",
  description:
    "Connect your business. Your Stratxcel AI Agent operates the digital work across website, technical SEO, content, social media, CRM, and analytics that helps it grow.",
  alternates: {
    canonical: "https://www.stratxcel.in",
  },
  openGraph: {
    title: "Stratxcel AI Agent — Your AI Business Agent",
    description:
      "Connect your business. Your Stratxcel AI Agent operates the digital work across website, SEO, content, social, CRM, and analytics.",
    url: "https://www.stratxcel.in",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Agent" }],
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-sx-bg font-sx-sans text-sx-text antialiased">
      <PublicHeader overHeroId="platform-hero" logoVariant="light" />
      <main className="flex-1">
        {/* SECTION 01: Hero */}
        <PlatformHero />

        {/* SECTION 02: How Stratxcel Works */}
        <HomeHowItWorks />

        {/* SECTION 03: Your AI Workforce */}
        <HomeAiWorkforce />

        {/* SECTION 04: Connect Your Business */}
        <HomeConnectBusiness />

        {/* SECTION 05: What Can Your Agent Do? & Business Types */}
        <HomeUseCaseExplorer />
        <HomeBusinessTypes />

        {/* SECTION 06: Proof / Real Product Evidence */}
        <HomeProductEvidence />

        {/* SECTION 07: Business Growth Audit */}
        <HomeAuditOffer />

        {/* SECTION 08: Final CTA */}
        <HomeFinalCta />
      </main>
      <PublicFooter logoVariant="light" />
    </div>
  );
}
