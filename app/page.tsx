import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { PlatformHero } from "@/app/components/public/home/PlatformHero";
import { HomeOpeningStatement } from "@/app/components/public/home/HomeOpeningStatement";
import { HomeIntentRouter } from "@/app/components/public/home/HomeIntentRouter";
import { HomeExampleDay } from "@/app/components/public/home/HomeExampleDay";
import { HomeProductChapters } from "@/app/components/public/home/HomeProductChapters";
import { HomeBusinessTypes } from "@/app/components/public/home/HomeBusinessTypes";
import { HomeAiControl } from "@/app/components/public/home/HomeAiControl";
import { HomeProductProof } from "@/app/components/public/home/HomeProductProof";
import { HomeTrust } from "@/app/components/public/home/HomeTrust";
import { HomeAuditOffer } from "@/app/components/public/home/HomeAuditOffer";
import { HomePricingBridge } from "@/app/components/public/home/HomePricingBridge";
import { HomeFinalCta } from "@/app/components/public/home/HomeFinalCta";

export const metadata: Metadata = {
  title: "Stratxcel — Marketing, Customers & Daily Work in One Place",
  description:
    "Stratxcel helps local and growing businesses get found, follow up faster, and get more done — with AI in one connected workspace.",
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-sx-bg font-sx-sans text-sx-text antialiased">
      <PublicHeader overHeroId="platform-hero" logoVariant="light" />
      <main className="flex-1">
        <PlatformHero />
        <HomeOpeningStatement />
        <HomeIntentRouter />
        <HomeExampleDay />
        <HomeProductChapters />
        <HomeBusinessTypes />
        <HomeAiControl />
        <HomeProductProof />
        <HomeTrust />
        <HomeAuditOffer />
        <HomePricingBridge />
        <HomeFinalCta />
      </main>
      <PublicFooter logoVariant="light" />
    </div>
  );
}
