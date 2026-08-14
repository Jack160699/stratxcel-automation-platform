"use client";

import Link from "next/link";
import { PRODUCT_AVAILABILITY_LABELS } from "@/lib/product-suite/taxonomy";

const REAL_EVIDENCE_POINTS = [
  {
    title: "Grounding in Brand Brain",
    badge: "Active in Product",
    desc: "Every agent artifact — from search articles to WhatsApp replies — is grounded directly in verified Brand Brain positioning rules. Hallucinations are actively filtered by policy gates.",
  },
  {
    title: "Multi-Department Execution DAG",
    badge: "Verified Engine",
    desc: "Workflows execute across specialized departments (Strategy, Research, Creative, SEO, Social, CRM, Sales) over a structured Directed Acyclic Graph with explicit quality gates.",
  },
  {
    title: "Governed Mutation Controls",
    badge: "Security Standard",
    desc: "Agents cannot unilaterally commit high-stake mutations (such as live publishing, CRM deletions, or ad spend changes) without passing human approval checkpoints.",
  },
  {
    title: "Isolated Tenant Architecture",
    badge: "Production Reality",
    desc: "Tenant isolation and Row Level Security (RLS) protect customer data from cross-tenant leakage. No client data is pooled or fed into shared foundational model weights.",
  },
];

const AVAILABILITY_LEVELS = [
  {
    label: PRODUCT_AVAILABILITY_LABELS.live,
    meaning: "Built, tested, running, and accessible for direct business use today.",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  {
    label: PRODUCT_AVAILABILITY_LABELS.beta,
    meaning: "Working in production, actively refined with early customer feedback.",
    badgeClass: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  },
  {
    label: PRODUCT_AVAILABILITY_LABELS.assisted,
    meaning: "Our team operates the workflow alongside you while automation matures.",
    badgeClass: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  {
    label: PRODUCT_AVAILABILITY_LABELS["coming-later"],
    meaning: "On the product roadmap. Not built yet, and we explicitly declare it.",
    badgeClass: "bg-sx-surface-2 text-sx-text-subtle border-sx-border",
  },
];

export function HomeProductEvidence() {
  return (
    <section
      id="proof"
      data-home-section="product-evidence"
      className="relative border-t border-sx-border bg-sx-bg py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
            VERIFIED PRODUCT PROOF
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,3rem)] font-bold tracking-tight text-sx-text">
            Built for real business operations.
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px]">
            We build real software and label every capability with radical honesty. Zero fabricated customer metrics,
            zero fake case studies, and zero unverified compliance claims.
          </p>
        </div>

        {/* Evidence Cards */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REAL_EVIDENCE_POINTS.map((item) => (
            <div
              key={item.title}
              className="flex flex-col justify-between rounded-2xl border border-sx-border bg-sx-surface-1 p-6 transition-colors hover:border-sx-border-strong"
            >
              <div>
                <span className="inline-block rounded-full bg-sx-surface-2 px-2.5 py-0.5 font-sx-mono text-[10px] font-bold uppercase text-sx-accent">
                  {item.badge}
                </span>
                <h3 className="mt-3.5 font-sx-sans text-base font-bold text-sx-text">
                  {item.title}
                </h3>
                <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Honest Availability Standards Box */}
        <div className="mt-12 rounded-2xl border border-sx-border bg-sx-surface-1 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-sx-border pb-5 sm:flex-row sm:items-center">
            <div>
              <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-sx-accent">
                Availability Standard
              </p>
              <h3 className="mt-1 font-sx-sans text-lg font-bold text-sx-text">
                How we label every module in the catalogue
              </h3>
            </div>
            <Link
              href="/product-proof"
              className="inline-flex items-center gap-1 font-sx-sans text-xs font-semibold text-sx-accent hover:underline"
            >
              Walk through illustrative interface screens →
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AVAILABILITY_LEVELS.map((lvl) => (
              <div key={lvl.label} className="rounded-xl border border-sx-border bg-sx-bg p-4">
                <span
                  className={`inline-block rounded border px-2 py-0.5 font-sx-mono text-[10px] font-bold uppercase ${lvl.badgeClass}`}
                >
                  {lvl.label}
                </span>
                <p className="mt-2 font-sx-sans text-xs leading-relaxed text-sx-text-muted">
                  {lvl.meaning}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
