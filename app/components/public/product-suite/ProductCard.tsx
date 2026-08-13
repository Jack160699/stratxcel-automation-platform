import Link from "next/link";
import type { ProductDefinition } from "@/lib/product-suite/types";
import { getProductHref } from "@/lib/product-suite/taxonomy";
import { getCustomerPresentationForProduct } from "@/lib/product-suite/customer-language";
import { ProductIcon } from "./ProductIcon";
import { ProductStateBadge } from "./ProductStateBadge";

export function ProductCard({
  product,
  compact = false,
  className = "",
}: {
  product: ProductDefinition;
  compact?: boolean;
  className?: string;
}) {
  const href = getProductHref(product);
  const isAnchor = product.availability !== "coming-later";
  const presentation = getCustomerPresentationForProduct(product);

  const body = (
    <article
      className={`group flex flex-col rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 transition-colors hover:border-sx-border-strong hover:bg-sx-surface-2 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ProductIcon product={product} />
          <div>
            <h3 className="font-sx-sans text-[15px] font-semibold leading-snug text-sx-text">{presentation.headline}</h3>
            <p className="mt-1 font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-sx-text-subtle">
              {product.name}
            </p>
            {!compact && (
              <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{presentation.capability}</p>
            )}
          </div>
        </div>
        <ProductStateBadge availability={product.availability} />
      </div>
      {!compact && (
        <p className="mt-4 font-sx-sans text-[12.5px] leading-relaxed text-sx-text-subtle">
          <span className="font-semibold text-sx-text-muted">The problem: </span>
          {presentation.problem}
        </p>
      )}
      {isAnchor && (
        <p className="mt-4 font-sx-sans text-[12px] font-semibold text-sx-accent transition-colors group-hover:text-[color:var(--sx-accent-hover)]">
          {presentation.ctaLabel} →
        </p>
      )}
    </article>
  );

  if (!isAnchor) return body;

  return (
    <Link
      href={href}
      className="block rounded-sx-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
    >
      {body}
    </Link>
  );
}
