import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { ProductOverview } from "@/app/components/public/product-suite/ProductOverview";

export const metadata: Metadata = {
  title: "What Stratxcel Helps You Do — Growth Platform",
  description:
    "Get more customers, market your business, manage enquiries, and save time — with honest availability labels and human approval before consequential actions.",
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
