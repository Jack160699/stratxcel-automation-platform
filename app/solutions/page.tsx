import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
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
    <PublicPageShell>
      <SolutionsHero />
      <BuiltAroundYourBusinessSection />
      <ImprovementIntentSection />
      <GrowthLifecycle />
      <OutcomesGrid />
      <HowStratxcelWorks />
      <CustomerTypesSection />
      <AuditFunnelCta />
      <SolutionConversionCta />
    </PublicPageShell>
  );
}
