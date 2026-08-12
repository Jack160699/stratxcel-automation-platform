import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { ProductOverview } from "@/app/components/public/product-suite/ProductOverview";

export const metadata: Metadata = {
  title: "Products — Stratxcel Growth Platform",
  description:
    "Explore Stratxcel's connected growth capabilities — intelligence, content, CRM, website, automations, and AI operations with truthful availability labels.",
};

export default function ProductsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <ProductOverview />
      </main>
      <PublicFooter />
    </div>
  );
}
