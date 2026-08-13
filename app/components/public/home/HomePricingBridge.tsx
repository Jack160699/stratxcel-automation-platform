import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { COMMERCIAL_PILLARS } from "@/lib/commercial/catalog";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";

/** Homepage stays simple — the full comparison lives on /pricing. */
export function HomePricingBridge() {
  return (
    <section data-home-section="pricing" id="pricing" className="border-t border-sx-border bg-sx-surface-1">
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
            Start where you are.
          </h2>
          <p className="mt-3 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Look around for free, take the audit if you want priorities first, and move to a monthly plan only when it
            is worth it.
          </p>
        </div>

        <dl className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {COMMERCIAL_PILLARS.map((pillar) => (
            <div key={pillar.id} className="border-t border-sx-border pt-4">
              <dt className="font-sx-sans text-[15.5px] font-semibold text-sx-text">{pillar.title}</dt>
              <dd className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                {pillar.description}
              </dd>
            </div>
          ))}
        </dl>

        <TrackedCtaLink
          href={PUBLIC_CTAS.pricing.href}
          event={PUBLIC_CTAS.pricing.event}
          surface="home_pricing_bridge"
          className="mt-9 inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2 motion-reduce:transition-none"
        >
          Compare plans
        </TrackedCtaLink>
      </div>
    </section>
  );
}
