import { PageHero } from "@/app/components/PageHero";
import {
  PrimaryButton,
  GhostButton,
  CTARow,
  CTAMicrocopy,
  TrustChips,
} from "@/app/components/marketing-ui";
import { COLORS, whatsappHref } from "@/lib/constants";
import { Reveal } from "@/app/components/Reveal";

export const metadata = {
  title: "Pricing — Stratxcel AI OS",
  description:
    "System-based tiered pricing for the Stratxcel AI operating system — scoped by pipelines and complexity, not per-user seats.",
};

const { surface, brand, accent } = COLORS;

const tiers = [
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

const trustAboveTiers = [
  "Scoping calls are free — we respond with a tier fit, not a hard sell",
  "Milestones tied to live pipelines, not slide milestones",
  "Engagements sized on system surface — never per-seat math",
];

const faq = [
  {
    q: "How fast do we move after WhatsApp?",
    a: "You’ll get a short checklist (systems, volumes, owners). From there we propose a pilot slice with clear go / no-go metrics — usually within a few days of first contact.",
  },
  {
    q: "What if we outgrow a tier?",
    a: "Tiers describe topology, not contracts for vanity seats. When pipelines multiply or coupling tightens, we remap scope — you’re not penalized for adding humans.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Tiered by system complexity — never by seat"
        description="We price the surface area of your operating system: how many pipelines run in production, how tightly modules couple, and how much autonomy you want under audit."
      />

      <div className="border-t border-slate-200/40 bg-white py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                No per-user fees. You scale by adding pipelines and modules — we scale with you on
                scope, not headcount tricks.
              </p>
              <div className="mt-8 border-y border-slate-100 py-6 sm:mt-9 sm:py-7">
                <TrustChips items={trustAboveTiers} />
              </div>
              <CTARow className="mt-6 sm:mt-7">
                <PrimaryButton href={whatsappHref} external>
                  Get started
                </PrimaryButton>
                <GhostButton href="/system">How the system works</GhostButton>
              </CTARow>
              <CTAMicrocopy>
                Opens WhatsApp · typical first reply within one business day
              </CTAMicrocopy>
            </div>
          </Reveal>

          <ul className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 lg:mt-14 lg:grid-cols-3">
            {tiers.map((t, i) => (
              <Reveal key={t.name} delay={80 + i * 70}>
                <li
                  className={`relative flex h-full flex-col rounded-2xl border bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_16px_48px_-32px_rgba(11,18,32,0.14)] sm:p-7 ${
                    t.popular
                      ? "border-blue-400/35 ring-2 ring-blue-500/[0.14] ring-offset-2 ring-offset-white"
                      : "border-slate-200/70"
                  }`}
                >
                  {t.popular ? (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-blue-200/80 bg-white px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800 shadow-sm">
                      Most teams start here
                    </span>
                  ) : null}
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.2em]">
                    Tier
                  </p>
                  <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#0B1220] sm:text-xl lg:text-2xl">
                    {t.name}
                  </h2>
                  <p className="mt-2.5 text-[14px] font-medium leading-snug text-slate-800 sm:text-[15px]">
                    {t.pitch}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-[13px] leading-relaxed text-slate-600 sm:space-y-3 sm:text-[14px]">
                    {t.scope.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: `linear-gradient(135deg, ${accent}, ${brand})` }}
                          aria-hidden
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 border-t border-slate-200/60 pt-4 text-[12px] leading-relaxed text-slate-500 sm:text-[13px]">
                    {t.note}
                  </p>
                  <div className="mt-5">
                    <PrimaryButton href={whatsappHref} external className="!w-full sm:!w-full">
                      Get started
                    </PrimaryButton>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200/35 bg-white py-10 sm:py-12">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.2em]">
            Straight answers
          </h3>
          <dl className="mt-6 space-y-6 text-left">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="text-[15px] font-semibold tracking-[-0.02em] text-[#0B1220]">{item.q}</dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="py-12 sm:py-16" style={{ backgroundColor: surface }}>
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#0B1220] sm:text-lg">
            Every quote is scoped to your graph
          </h3>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-600 sm:mt-4 sm:text-[15px]">
            Share your pipelines and systems of record — we respond with a tier recommendation and
            milestone plan. No SKU gymnastics.
          </p>
          <CTARow className="mt-7 sm:mt-8">
            <PrimaryButton href={whatsappHref} external>
              Get started
            </PrimaryButton>
          </CTARow>
          <CTAMicrocopy>
            You’ll always talk to someone who can reason about systems — not a script.
          </CTAMicrocopy>
        </div>
      </div>
    </>
  );
}
