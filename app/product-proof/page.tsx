import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { ProductShowcase } from "@/app/components/public/showcase";

export const metadata: Metadata = {
  title: "Product proof — Stratxcel",
  description: "Preview Stratxcel customer-facing modules with illustrative workspace data. For marketing integration — not a live tenant.",
  robots: { index: false, follow: false },
};

export default function ProductProofPage() {
  return (
    <div className="min-h-screen bg-sx-bg text-sx-text">
      <PublicHeader />
      <main>
        <div className="border-b border-sx-border bg-sx-surface-1/40">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <p className="font-sx-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-sx-text-subtle">Marketing preview · Agent 3</p>
            <h1 className="mt-2 font-sx-sans text-2xl font-semibold tracking-tight text-sx-text sm:text-3xl">Product proof showcase</h1>
            <p className="mt-2 max-w-2xl text-sm text-sx-text-muted">Reusable components built from real customer-facing UI patterns. All data is fictional — Northstar Coffee is a demo business.</p>
          </div>
        </div>
        <ProductShowcase />
      </main>
      <PublicFooter />
    </div>
  );
}
