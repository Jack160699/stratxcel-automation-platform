import Link from "next/link";
import { PRODUCT_AVAILABILITY_LABELS } from "@/lib/product-suite/taxonomy";

/** Plain-language meaning of each availability state used across the catalogue. */
const STATE_MEANING: { label: string; meaning: string }[] = [
  { label: PRODUCT_AVAILABILITY_LABELS.live, meaning: "Built, running, and yours to use today." },
  { label: PRODUCT_AVAILABILITY_LABELS.beta, meaning: "Working, still being refined, available to try." },
  { label: PRODUCT_AVAILABILITY_LABELS.assisted, meaning: "Our team runs it with you while the workflow matures." },
  { label: PRODUCT_AVAILABILITY_LABELS["coming-later"], meaning: "On the roadmap. Not built yet, and we say so." },
];

export function HomeProductProof() {
  return (
    <section data-home-section="product-proof" id="product-proof" className="border-t border-sx-border bg-sx-surface-1">
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
              This is real software.
            </h2>
            <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
              The screens on this page are the actual Stratxcel interface, filled with sample data for a fictional
              business. Nothing here is a mock-up of something we intend to build.
            </p>
            <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
              Some parts are fully self-serve. Some are run with our team while the workflow matures. We label which is
              which, everywhere, rather than letting you find out later.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/product-proof"
                className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2 motion-reduce:transition-none"
              >
                Walk through the interface
              </Link>
              <Link
                href="/products"
                className="inline-flex min-h-11 items-center justify-center rounded-sx-sm px-6 py-3 font-sx-sans text-sm font-semibold text-sx-accent hover:underline"
              >
                See every product and its state →
              </Link>
            </div>
          </div>

          <dl className="grid gap-px overflow-hidden rounded-sx-lg border border-sx-border bg-sx-border">
            {STATE_MEANING.map((state) => (
              <div key={state.label} className="bg-sx-bg px-5 py-5 sm:px-6">
                <dt className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-accent">{state.label}</dt>
                <dd className="mt-1.5 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{state.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
