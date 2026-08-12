import type { ProductDefinition } from "@/lib/product-suite/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, compact = false }: { products: ProductDefinition[]; compact?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} compact={compact} />
      ))}
    </div>
  );
}
