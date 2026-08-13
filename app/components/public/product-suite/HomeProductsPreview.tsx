import Link from "next/link";
import { CUSTOMER_OUTCOME_GROUPS, getFeaturedHomepageProducts } from "@/lib/product-suite/customer-language";
import { ProductCard } from "./ProductCard";

/** Compact homepage preview — outcome-first language with featured customer headlines. */
export function HomeProductsPreview() {
  const featured = getFeaturedHomepageProducts();

  return (
    <section className="border-y border-sx-border bg-sx-surface-2">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-sx-accent">What you can do</p>
          <h2 className="mt-2 font-sx-sans text-[clamp(1.4rem,3vw,2rem)] font-semibold tracking-[-0.02em] text-sx-text">
            Find customers, grow on social, and never lose an enquiry
          </h2>
          <p className="mt-3 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
            Stratxcel helps ordinary businesses get found, stay visible, and follow up — with clear labels on what is live
            today and what needs team support.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} compact />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {CUSTOMER_OUTCOME_GROUPS.map((group) => (
            <span
              key={group.id}
              className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1 font-sx-sans text-[11px] font-medium text-sx-text-muted"
            >
              {group.label}
            </span>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href="/products"
            className="inline-flex rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-5 py-2.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-bg"
          >
            See what Stratxcel helps you do →
          </Link>
        </div>
      </div>
    </section>
  );
}
