import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import {
  SolutionsHero,
  BuiltAroundYourBusinessSection,
  ImprovementIntentSection,
  OutcomesGrid,
  GrowthLifecycle,
  HowStratxcelWorks,
  CustomerTypesSection,
  AuditFunnelCta,
  SolutionConversionCta,
} from "@/app/components/public/solutions";

export const metadata: Metadata = {
  title: "Solutions — Stratxcel",
  description: "Outcome-oriented growth solutions for business owners.",
};

export default function SolutionsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        <SolutionsHero />
        <BuiltAroundYourBusinessSection />
        <ImprovementIntentSection />
        <GrowthLifecycle />
        <OutcomesGrid />
        <HowStratxcelWorks />
        <CustomerTypesSection />
        <AuditFunnelCta />
        <SolutionConversionCta />
      </main>
      <PublicFooter />
    </div>
  );
}
