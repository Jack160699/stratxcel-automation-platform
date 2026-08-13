import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { Card } from "@/components/ui/Card";
import { CommercialTrustSection } from "@/app/components/public/commercial/CommercialTrustGrid";
import { PricingViewTracker } from "@/app/components/public/commercial/PricingViewTracker";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { COMMERCIAL_PILLARS, PRICING_TIERS, type CommercialPillarId } from "@/lib/commercial/catalog";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing & Plans — Stratxcel Growth Operations",
  description: "Business Growth Audit, platform access, growth execution, and enterprise plans — GST-inclusive where published.",
};

const faq = [
  { q: "How does the Business Growth Audit work?", a: "Pay once, complete guided intake, and receive a written 30/60/90-day roadmap from the Stratxcel team." },
  { q: "Are ad spend and domains included?", a: "Subscriptions cover operating system work; ad spend and domain registration remain separate." },
  { q: "Who owns our website domain?", a: "You remain the legal beneficial owner; Stratxcel configures DNS under your registrant details." },
  { q: "Can we upgrade plans?", a: "Start with Starter and upgrade to Growth or Business; Scale/Custom is quote-led." },
  { q: "Why staff-activated monthly plans?", a: "Scope, integrations, and capacity are confirmed before paid platform activation during closed beta." },
];

const ORDER: CommercialPillarId[] = ["audit", "platform", "growth_execution", "enterprise"];

export default function PricingPage() {
  return (
    <PublicPageShell beforeMain={<PricingViewTracker />}>
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Pricing & Plans</span>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">Plans sell access. Capabilities explain what runs.</h1>
            <p className="mt-3 text-sx-text-muted">Start with ₹999 Business Growth Audit, then choose platform, execution, or enterprise scope.</p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COMMERCIAL_PILLARS.map((p) => (
              <Card key={p.id} variant="panel" className="p-5 shadow-[var(--sx-shadow-lg)]">
                <p className="font-sx-mono text-[10px] font-bold uppercase text-sx-accent">{p.subtitle}</p>
                <h2 className="mt-2 font-bold">{p.title}</h2>
                <p className="mt-2 text-xs text-sx-text-muted">{p.description}</p>
              </Card>
            ))}
          </div>
        </section>
        {ORDER.map((pillarId) => {
          const pillar = COMMERCIAL_PILLARS.find((p) => p.id === pillarId)!;
          const tiers = PRICING_TIERS.filter((t) => t.pillar === pillarId);
          if (!tiers.length) return null;
          const auditOnly = pillarId === "audit";
          return (
            <section key={pillarId} className={`border-t border-sx-border ${pillarId === "platform" ? "bg-sx-surface-2" : ""}`}>
              <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl text-center">
                  <p className="font-sx-mono text-[10px] font-bold uppercase text-sx-accent">{pillar.subtitle}</p>
                  <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{pillar.title}</h2>
                  <p className="mt-2 text-sm text-sx-text-muted">{pillar.description}</p>
                </div>
                {auditOnly ? (
                  <div className="mt-10 mx-auto max-w-4xl rounded-sx-lg border border-sx-accent/30 bg-sx-surface-1 p-8 text-center shadow-[var(--sx-shadow-xl)]">
                    <h3 className="text-2xl font-bold">{tiers[0].name} — {tiers[0].price}</h3>
                    <p className="mt-2 text-sm text-sx-text-muted">{tiers[0].pitch}</p>
                    <TrackedCtaLink href={tiers[0].href} event="start_audit" surface="pricing_audit" plan="audit" className="mt-6 inline-block rounded-sx-sm bg-sx-accent px-8 py-3 text-xs font-bold text-sx-accent-on">{tiers[0].cta} →</TrackedCtaLink>
                  </div>
                ) : (
                  <div className={`mt-10 grid gap-8 ${tiers.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 max-w-4xl mx-auto"}`}>
                    {tiers.map((t) => (
                      <Card key={t.id} variant={t.popular ? "elevated" : "panel"} className={`flex h-full flex-col p-8 border ${t.popular ? "border-sx-accent/60 ring-2 ring-sx-accent/30" : ""}`}>
                        <span className="font-sx-mono text-[10px] font-bold uppercase text-sx-text-subtle">{t.badge}</span>
                        <h3 className="mt-2 text-2xl font-bold">{t.name}</h3>
                        <p className="mt-4 text-3xl font-extrabold sm:text-4xl">{t.price}</p>
                        <p className="text-xs text-sx-text-subtle">{t.period}</p>
                        <p className="mt-3 text-xs text-sx-text-muted">{t.pitch}</p>
                        <ul className="mt-6 flex-1 space-y-3 text-xs text-sx-text-muted">
                          {t.scope.map((line) => (<li key={line} className="flex gap-2"><span className="text-sx-accent">✓</span>{line}</li>))}
                        </ul>
                        <p className="mt-6 border-t border-sx-border pt-4 text-[11px] italic text-sx-text-subtle">{t.note}</p>
                        <TrackedCtaLink href={t.href} event={t.href.startsWith("/signup") ? "signup_intent" : undefined} surface="pricing_tier" plan={t.planKey} className={`mt-6 block rounded-sx-sm py-3 text-center text-xs font-bold ${t.popular ? "bg-sx-accent text-sx-accent-on" : "border border-sx-border-strong"}`}>{t.cta}</TrackedCtaLink>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
        <section className="border-t border-sx-border bg-sx-surface-1 py-16">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center text-2xl font-bold">Frequently Asked Questions</h2>
            <dl className="mt-10 space-y-4">
              {faq.map((item) => (
                <div key={item.q} className="rounded-sx-md border border-sx-border bg-sx-bg p-6 shadow-[var(--sx-shadow-lg)]">
                  <dt className="font-bold">{item.q}</dt>
                  <dd className="mt-2 text-sm text-sx-text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <CommercialTrustSection />
        <section className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h3 className="text-xl font-bold">Need custom enterprise scope?</h3>
          <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-sx-sm bg-sx-accent px-6 py-3 text-xs font-bold text-sx-accent-on">Chat on WhatsApp</a>
            <Link href="/contact?intent=custom" className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-xs font-semibold">Submit Custom Inquiry</Link>
            <TrackedCtaLink href={PUBLIC_CTAS.explorePlatform.href} event="explore_product" surface="pricing_footer" className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-xs font-semibold">{PUBLIC_CTAS.explorePlatform.label}</TrackedCtaLink>
          </div>
        </section>
    </PublicPageShell>
  );
}
