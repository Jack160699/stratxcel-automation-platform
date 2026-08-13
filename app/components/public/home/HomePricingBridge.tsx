import { Card } from "@/components/ui/Card";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { COMMERCIAL_PILLARS } from "@/lib/commercial/catalog";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
export function HomePricingBridge() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center"><p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Pricing</p><h2 className="mt-3 text-2xl font-bold sm:text-3xl">Start free, grow when you are ready</h2><p className="mt-3 text-sm text-sx-text-muted">Explore free, take the ₹999 audit for priorities, or activate monthly plans when ready.</p></div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{COMMERCIAL_PILLARS.map((pillar) => (<Card key={pillar.id} variant="panel" className="p-5"><p className="font-sx-mono text-[10px] font-bold uppercase text-sx-accent">{pillar.subtitle}</p><h3 className="mt-2 text-base font-bold">{pillar.title}</h3><p className="mt-2 text-xs text-sx-text-muted">{pillar.description}</p></Card>))}</div>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <TrackedCtaLink href={PUBLIC_CTAS.pricing.href} event={PUBLIC_CTAS.pricing.event} surface="home_pricing_bridge" className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-7 py-3 text-sm font-semibold">{PUBLIC_CTAS.pricing.label} →</TrackedCtaLink>
        <TrackedCtaLink href={PUBLIC_CTAS.productDemo.href} event={PUBLIC_CTAS.productDemo.event} surface="home_pricing_demo" className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-7 py-3 text-sm font-bold text-sx-accent-on">{PUBLIC_CTAS.productDemo.label}</TrackedCtaLink>
      </div>
    </div>
  );
}
