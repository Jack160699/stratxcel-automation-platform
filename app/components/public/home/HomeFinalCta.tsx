import { ConversionCtaBand } from "@/app/components/public/commercial/ConversionCtaBand";

/** Final CTA — demo at href="/contact?intent=demo", audit at href="/audit" */
export function HomeFinalCta() {
  return (
    <ConversionCtaBand
      id="final-cta"
      surface="home_final"
      title="Ready to run growth from one platform?"
      subtitle="See real software, explore products, or talk with the team."
      showDemo
    />
  );
}
