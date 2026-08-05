import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { TrustChips } from "@/app/components/public/TrustChips";
import { Card } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing — Stratxcel AI OS",
  description:
    "System-based tiered pricing for the Stratxcel AI operating system — scoped by pipelines and complexity, not per-user seats.",
};

const tiers: { name: string; pitch: string; scope: string[]; note: string; popular: boolean }[] = [
  {
    name: "Signal",
    pitch: "One production system, end-to-end.",
    scope: [
      "Single bounded pipeline (ingest → decision → execution)",
      "Up to 3 integrated surfaces (e.g. CRM, inbox, sheet/DB)",
      "Core modules only — no custom graph extensions",
      "Monthly system review & drift checks",
    ],
    note: "Ideal when you need proof on one critical path before expanding the OS.",
    popular: false,
  },
  {
    name: "Mesh",
    pitch: "Multiple pipelines sharing context.",
    scope: [
      "3–5 connected pipelines with shared policy + schema",
      "Cross-module routing (lead, workflow, automation)",
      "Agent-assisted steps within defined envelopes",
      "Bi-weekly operating reviews + incident playbooks",
    ],
    note: "Where most growing teams land after the first system proves ROI.",
    popular: true,
  },
  {
    name: "Fleet",
    pitch: "Program-wide operating model.",
    scope: [
      "Many pipelines / environments with governance tiers",
      "Custom modules & integrations on your graph",
      "Priority design reviews & escalation lane",
      "Optional residency / compliance packaging (scoped per engagement)",
    ],
    note: "For orgs treating AI like infrastructure — not an experiment.",
    popular: false,
  },
];

const faq: { q: string; a: string }[] = [
  {
    q: "How fast do we move after WhatsApp?",
    a: "You'll get a short checklist (systems, volumes, owners). From there we propose a pilot slice with clear go / no-go metrics — usually within a few days of first contact.",
  },
  {
    q: "What if we outgrow a tier?",
    a: "Tiers describe topology, not contracts for vanity seats. When pipelines multiply or coupling tightens, we remap scope — you're not penalized for adding humans.",
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Pricing</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            Tiered by system complexity — never by seat
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            We price the surface area of your operating system: how many pipelines run in production, how tightly modules
            couple, and how much autonomy you want under audit.
          </p>

          <div className="mx-auto mt-10 max-w-2xl text-center">
            <p className="font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
              No per-user fees. You scale by adding pipelines and modules — we scale with you on scope, not headcount
              tricks.
            </p>
            <div className="mt-7 border-y border-sx-border py-6">
              <TrustChips
                className="sm:justify-center"
                items={[
                  "Scoping calls are free — we respond with a tier fit, not a hard sell",
                  "Milestones tied to live pipelines, not slide milestones",
                  "Engagements sized on system surface — never per-seat math",
                ]}
              />
            </div>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Get started
              </a>
              <a
                href="/system"
                className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                How the system works
              </a>
            </div>
            <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
              Opens WhatsApp · typical first reply within one business day
            </p>
          </div>

          <ul className="mt-14 grid gap-4 lg:grid-cols-3">
            {tiers.map((t) => (
              <li key={t.name} className="relative">
                <Card
                  variant={t.popular ? "elevated" : "panel"}
                  className={`flex h-full flex-col p-6 sm:p-7 ${t.popular ? "border-sx-accent/50" : ""}`}
                >
                  {t.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sx-pill border border-sx-accent/50 bg-sx-bg px-3 py-0.5 font-sx-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sx-accent">
                      Most teams start here
                    </span>
                  ) : null}
                  <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">Tier</p>
                  <h2 className="mt-2 font-sx-sans text-xl font-semibold tracking-[-0.02em] text-sx-text">{t.name}</h2>
                  <p className="mt-2.5 font-sx-sans text-[14px] font-medium leading-snug text-sx-text">{t.pitch}</p>
                  <ul className="mt-5 flex-1 space-y-2.5 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
                    {t.scope.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 border-t border-sx-border pt-4 font-sx-sans text-[12px] leading-relaxed text-sx-text-subtle">
                    {t.note}
                  </p>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 block rounded-sx-sm bg-sx-accent px-4 py-2.5 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    Get started
                  </a>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:px-8">
            <h3 className="text-center font-sx-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-sx-text-subtle">
              Straight answers
            </h3>
            <dl className="mt-6 space-y-6">
              {faq.map((item) => (
                <div key={item.q}>
                  <dt className="font-sx-sans text-[15px] font-semibold tracking-[-0.01em] text-sx-text">{item.q}</dt>
                  <dd className="mt-2 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h3 className="font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text">
            Every quote is scoped to your graph
          </h3>
          <p className="mt-3 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
            Share your pipelines and systems of record — we respond with a tier recommendation and milestone plan. No SKU
            gymnastics.
          </p>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-block rounded-sx-sm bg-sx-accent px-6 py-3 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
          >
            Get started
          </a>
          <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
            You&rsquo;ll always talk to someone who can reason about systems — not a script.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
