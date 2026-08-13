import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { ProductOverview } from "@/app/components/public/product-suite/ProductOverview";

export const metadata: Metadata = {
  title: "Products — Stratxcel Growth Platform",
  description:
    "Explore Stratxcel's connected growth capabilities — intelligence, content, CRM, website, automations, and AI operations with truthful availability labels.",
};

export default function ProductsPage() {
  return (
    <PublicPageShell>
        <ProductOverview />
    </PublicPageShell>
  );
}
