import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { HomeHeroLight } from "@/app/components/public/home/HomeHeroLight";
import { HomeProblemRecognition } from "@/app/components/public/home/HomeProblemRecognition";
import { HomeHowStratxcelHelps } from "@/app/components/public/home/HomeHowStratxcelHelps";
import { HomeWhatItHelpsWith } from "@/app/components/public/home/HomeWhatItHelpsWith";
import { HomeSimpleSteps } from "@/app/components/public/home/HomeSimpleSteps";
import { HomeInteractiveExplorerClean } from "@/app/components/public/home/HomeInteractiveExplorerClean";
import { HomeBusinessTypes } from "@/app/components/public/home/HomeBusinessTypes";
import { HomeToolsAndSafety } from "@/app/components/public/home/HomeToolsAndSafety";
import { HomeAuditSection } from "@/app/components/public/home/HomeAuditSection";
import { HomeClosingSection } from "@/app/components/public/home/HomeClosingSection";

export const metadata: Metadata = {
  title: "Stratxcel AI Agent — Your AI Business Assistant & Digital Growth Team",
  description:
    "Connect the tools you already use. Your Stratxcel AI Agent helps manage and grow the digital side of your business across website, Google SEO, content, social media, and customer inquiries.",
  alternates: {
    canonical: "https://www.stratxcel.in",
  },
  openGraph: {
    title: "Stratxcel AI Agent — Your AI Business Assistant",
    description:
      "Connect the tools you already use. Stratxcel helps manage and grow the digital side of your business with human approval at every step.",
    url: "https://www.stratxcel.in",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Agent" }],
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-white font-sx-sans text-slate-900 antialiased">
      {/* Primary Light Sticky Header */}
      <PublicHeader logoVariant="light" />

      <main className="flex-1">
        {/* SECTION 01: Hero with Living SaaS Command Center */}
        <HomeHeroLight />

        {/* SECTION 02: The Problem / Recognition */}
        <HomeProblemRecognition />

        {/* SECTION 03: How Stratxcel Helps */}
        <HomeHowStratxcelHelps />

        {/* SECTION 04: What Stratxcel Can Help You With */}
        <HomeWhatItHelpsWith />

        {/* SECTION 05: How It Works (Simple 4 Steps) */}
        <HomeSimpleSteps />

        {/* SECTION 06: Interactive Business Explorer & Business Types */}
        <HomeInteractiveExplorerClean />
        <HomeBusinessTypes />

        {/* SECTION 07: Connect Your Tools & Privacy Guarantees */}
        <HomeToolsAndSafety />

        {/* SECTION 08: ₹999 Business Growth Audit */}
        <HomeAuditSection />

        {/* SECTION 09: Final Closing CTA */}
        <HomeClosingSection />
      </main>

      {/* Public Footer */}
      <PublicFooter logoVariant="light" />
    </div>
  );
}
