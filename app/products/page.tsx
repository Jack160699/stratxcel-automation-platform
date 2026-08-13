import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { ProductOverview } from "@/app/components/public/product-suite/ProductOverview";

export const metadata: Metadata = {
  title: "What Stratxcel Helps You Do — Growth Platform",
  description:
    "Get more customers, market your business, manage enquiries, and save time — with honest availability labels and human approval before consequential actions.",
};

export default function ProductsPage() {
  return (
    <PublicPageShell>
        <ProductOverview />
    </PublicPageShell>
  );
}
