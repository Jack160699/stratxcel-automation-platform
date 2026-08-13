import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { CommercialTrustSection } from "@/app/components/public/commercial/CommercialTrustGrid";
import { ConversionCtaBand } from "@/app/components/public/commercial/ConversionCtaBand";
import { ConversionFaqSection } from "@/app/components/public/commercial/ConversionFaqSection";
import { ConversionTrustQuestions } from "@/app/components/public/commercial/ConversionTrustQuestions";
import { PricingPlanGuide } from "@/app/components/public/commercial/PricingPlanGuide";
import { PricingViewTracker } from "@/app/components/public/commercial/PricingViewTracker";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { COMMERCIAL_PILLARS, PRICING_TIERS, type CommercialPillarId } from "@/lib/commercial/catalog";
import { PRICING_OBJECTIONS } from "@/lib/commercial/objections";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = { title: "Pricing & Plans — Stratxcel Growth Operations", description: "Business Growth Audit, platform access, growth execution, and enterprise plans — GST-inclusive where published." };
const ORDER: CommercialPillarId[] = ["audit", "platform", "growth_execution", "enterprise"];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PricingViewTracker /><PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center"><span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Pricing & Plans</span><h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">Clear plans for every stage of growth</h1><p className="mt-3 text-sx-text-muted">Explore free, activate monthly execution when ready, or start with the ₹999 audit if you need priorities first.</p></div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{COMMERCIAL_PILLARS.map((p) => (<Card key={p.id} variant="panel" className="p-5"><p className="font-sx-mono text-[10px] font-bold uppercase text-sx-accent">{p.subtitle}</p><h2 className="mt-2 font-bold">{p.title}</h2><p className="mt-2 text-xs text-sx-text-muted">{p.description}</p></Card>))}</div>
        </section>
        <section className="border-t border-sx-border bg-sx-surface-2"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="mx-auto max-w-2xl text-center"><h2 className="text-xl font-bold">Which plan fits your business?</h2></div><PricingPlanGuide /></div></section>
        {ORDER.map((pillarId) => {
          const pillar = COMMERCIAL_PILLARS.find((p) => p.id === pillarId)!; const tiers = PRICING_TIERS.filter((t) => t.pillar === pillarId); if (!tiers.length) return null;
          return (<section key={pillarId} className={`border-t border-sx-border ${pillarId === "platform" ? "bg-sx-surface-2" : ""}`}><div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="font-sx-mono text-[10px] font-bold uppercase text-sx-accent">{pillar.subtitle}</p><h2 className="mt-2 text-2xl font-bold">{pillar.title}</h2></div>
            {pillarId === "audit" ? (<div className="mx-auto mt-10 max-w-4xl rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 text-center"><p className="text-[10px] font-bold uppercase text-sx-accent">Lower-funnel entry</p><h3 className="mt-2 text-2xl font-bold">{tiers[0].name} — {tiers[0].price}</h3><p className="mt-2 text-sm text-sx-text-muted">{tiers[0].pitch}</p><p className="mt-2 text-xs"><strong>Best for:</strong> {tiers[0].whoItsFor}</p><TrackedCtaLink href={tiers[0].href} event="start_audit" surface="pricing_audit" plan="audit" className="mt-6 inline-block rounded-sx-sm bg-sx-accent px-8 py-3 text-xs font-bold text-sx-accent-on">{tiers[0].cta} →</TrackedCtaLink></div>) : (
              <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{tiers.map((t) => (<Card key={t.id} variant={t.popular ? "elevated" : "panel"} className={`flex h-full flex-col p-8 border ${t.popular ? "border-sx-accent/60 ring-2 ring-sx-accent/30" : ""}`}><span className="text-[10px] font-bold uppercase text-sx-text-subtle">{t.badge}</span><h3 className="mt-2 text-2xl font-bold">{t.name}</h3><p className="mt-4 text-3xl font-extrabold">{t.price}</p><p className="text-xs text-sx-text-subtle">{t.period}</p><p className="mt-3 text-xs rounded-sx-sm bg-sx-surface-2 px-3 py-2"><strong>Best for:</strong> {t.whoItsFor}</p><ul className="mt-6 flex-1 space-y-3 text-xs text-sx-text-muted">{t.scope.map((line) => (<li key={line} className="flex gap-2"><span className="text-sx-accent">✓</span>{line}</li>))}</ul>{t.upgradePath ? <p className="mt-4 text-[11px] text-sx-text-subtle"><strong>Upgrade:</strong> {t.upgradePath}</p> : null}<p className="mt-4 border-t border-sx-border pt-4 text-[11px] italic text-sx-text-subtle">{t.note}</p><TrackedCtaLink href={t.href} event={t.href.startsWith("/signup") ? "signup_intent" : undefined} surface="pricing_tier" plan={t.planKey} className={`mt-6 block rounded-sx-sm py-3 text-center text-xs font-bold ${t.popular ? "bg-sx-accent text-sx-accent-on" : "border border-sx-border-strong"}`}>{t.cta}</TrackedCtaLink></Card>))}</div>)}
          </div></section>);
        })}
        <ConversionTrustQuestions />
        <ConversionFaqSection title="Pricing questions" subtitle="Transparent answers — no invented refund policies." items={PRICING_OBJECTIONS} className="border-t border-sx-border bg-sx-surface-1 py-16" />
        <CommercialTrustSection /><ConversionCtaBand surface="pricing_footer" showDemo />
        <section className="mx-auto max-w-2xl px-4 py-10 text-center"><h3 className="text-xl font-bold">Need custom enterprise scope?</h3><div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row"><a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-sx-sm bg-sx-accent px-6 py-3 text-xs font-bold text-sx-accent-on">Chat on WhatsApp</a><Link href="/contact?intent=custom" className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-xs font-semibold">Submit Custom Inquiry</Link></div></section>
      </main>
      <PublicFooter />
    </div>
  );
}
