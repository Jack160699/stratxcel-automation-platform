import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { IntegrationsShowcase } from "@/app/components/public/commercial/IntegrationsShowcase";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";

export const metadata: Metadata = {
  title: "Integrations — Stratxcel",
  description: "Genuine supported integrations with honest connected, available, and coming-soon labels.",
};

export default function IntegrationsPage() {
  return (
    <PublicPageShell>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Integrations</p>
          <h1 className="mt-4 font-sx-sans text-3xl font-semibold text-sx-text">Connect what your team authorizes</h1>
          <p className="mt-5 max-w-2xl text-[15px] text-sx-text-muted">OAuth grants, bindings, and payment rails that exist in the product today — labeled honestly.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TrackedCtaLink href={PUBLIC_CTAS.explorePlatform.href} event="explore_product" surface="integrations_hero" className="rounded-sx-sm bg-sx-accent px-6 py-3 text-sm font-semibold text-sx-accent-on">{PUBLIC_CTAS.explorePlatform.label}</TrackedCtaLink>
            <TrackedCtaLink href={PUBLIC_CTAS.secondary.href} event="explore_product" surface="integrations_hero" className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-sm font-semibold">{PUBLIC_CTAS.secondary.label}</TrackedCtaLink>
          </div>
        </section>
        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8"><IntegrationsShowcase /></div>
        </section>
        <section className="border-t border-sx-border py-14 text-center">
          <Link href="/social-autopilot" className="text-sm font-semibold text-sx-accent hover:underline">View Social Autopilot →</Link>
        </section>
    </PublicPageShell>
  );
}
