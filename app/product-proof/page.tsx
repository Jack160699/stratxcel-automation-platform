import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { ProductShowcase } from "@/app/components/public/showcase";
import { DEMO_DISCLAIMER } from "@/app/components/public/showcase/fixtures/showcase-data";

export const metadata: Metadata = {
  title: "Inside the product — Stratxcel",
  description:
    "Walk through the Stratxcel interface with illustrative workspace data. Sample business, real screens — not a live tenant.",
  robots: { index: false, follow: false },
};

export default function ProductProofPage() {
  return (
    <PublicPageShell>
      <div className="border-b border-sx-border bg-sx-surface-1">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <h1 className="font-sx-sans text-[clamp(1.6rem,3vw+0.4rem,2.5rem)] font-semibold tracking-[-0.03em] text-sx-text">
            Inside the product
          </h1>
          <p className="mt-3 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
            These are the screens your business would actually work in. Each one is filled with sample data so you can
            read it end to end without signing up.
          </p>
          <p className="mt-3 font-sx-sans text-[12.5px] text-sx-text-subtle">{DEMO_DISCLAIMER}</p>
        </div>
      </div>
      <ProductShowcase />
    </PublicPageShell>
  );
}
