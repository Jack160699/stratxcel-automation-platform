import type { CustomerOutcomeGroup } from "@/lib/product-suite/customer-language";
import { getProductsByCustomerOutcomeGroup } from "@/lib/product-suite/customer-language";
import { ProductGrid } from "./ProductGrid";

export function CustomerOutcomeGroupSection({ group }: { group: CustomerOutcomeGroup }) {
  const products = getProductsByCustomerOutcomeGroup(group.id);

  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="max-w-3xl">
        <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-sx-accent">{group.label}</p>
        <h2 className="mt-2 font-sx-sans text-[clamp(1.35rem,2.5vw,1.75rem)] font-semibold tracking-[-0.02em] text-sx-text">
          {group.description}
        </h2>
      </div>
      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </section>
  );
}
