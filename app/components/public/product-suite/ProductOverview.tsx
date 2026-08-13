import Link from "next/link";
import { PRODUCT_GROUPS } from "@/lib/product-suite/taxonomy";
import { TrustChips } from "@/app/components/public/TrustChips";
import { ProductGroupSection } from "./ProductGroupSection";

export function ProductOverview() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Products</p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
          One Stratxcel platform composed of connected growth capabilities
        </h1>
        <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
          Explore what Stratxcel can help you understand, improve, and run — with clear availability labels and no
          overstated promises.
        </p>

        <div className="mt-10 border-t border-sx-border pt-8">
          <TrustChips
            items={[
              "Live, Beta, Staff-assisted, and Coming later labels",
              "Human approval for consequential actions",
              "Scope confirmed before activation",
            ]}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {PRODUCT_GROUPS.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text"
            >
              {group.label}
            </a>
          ))}
          <Link
            href="/pricing"
            className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text"
          >
            View pricing
          </Link>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-2">
        <div className="mx-auto max-w-6xl space-y-14 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          {PRODUCT_GROUPS.map((group) => (
            <ProductGroupSection key={group.id} group={group} />
          ))}
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-xl font-semibold text-sx-text">Start with clarity, then choose what to activate</h2>
          <p className="mt-3 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
            The Business Growth Audit is the recommended first step. Monthly capabilities are scoped and confirmed before
            activation.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/audit"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start the Audit
            </Link>
            <Link
              href="/contact"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors hover:bg-sx-surface-2"
            >
              Talk to the team
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
