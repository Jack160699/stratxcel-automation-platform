<<<<<<< HEAD
import ExperienceLoader from "@/app/_experience/ExperienceLoader";
import { Mark } from "@/app/components/Mark";
import Link from "next/link";
import {
  AGENT_STEPS,
  CAPABILITIES,
  CASE_STUDIES,
  EXPLORE_LINKS,
} from "@/app/_experience/content";
=======
import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

export const metadata: Metadata = {
  title: "Stratxcel — one workspace to run your business with AI",
  description:
    "Tell Stratxcel what you need done. Content, your website, leads, ads and reporting — planned by AI, approved by you, delivered in one workspace.",
};

const PRODUCTS: { title: string; description: string; href: string }[] = [
  {
    title: "Content & social",
    description: "Drafts, a posting schedule, and replies — planned for every connected channel.",
    href: "/social-autopilot",
  },
  {
    title: "Website",
    description: "Requests, changes and SEO fixes tracked from ask to shipped.",
    href: "/modules",
  },
  {
    title: "Leads & CRM",
    description: "Every enquiry captured, staged and followed up — nothing left in a shared inbox.",
    href: "/modules",
  },
  {
    title: "Reports",
    description: "One view of what happened across content, leads and your site — no fabricated numbers, ever.",
    href: "/modules",
  },
];

const STEPS: { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "Tell us the goal",
    body: "Post it in plain language — \"get more bookings this month\" is enough. No brief, no ticket queue.",
  },
  {
    step: "02",
    title: "We plan it, you approve",
    body: "Stratxcel proposes the work. Anything sensitive — spend, publishing, outreach — waits for your yes before it happens.",
  },
  {
    step: "03",
    title: "Track it in one place",
    body: "Every mission, deliverable and result lands in your workspace, not scattered across five tools.",
  },
];
>>>>>>> origin/feat/stratxcel-core-product-experience

export default function HomePage() {
  return (
<<<<<<< HEAD
    <>
      <div className="sr-only">
        <h1>Stratxcel — the AI operating system for modern business</h1>
        <p>
          We don&rsquo;t build websites. We engineer businesses. Stratxcel collapses
          disconnected software, missed leads and manual work into one
          connected, intelligent system.
        </p>
        <h2>Capabilities</h2>
        <ul>
          {CAPABILITIES.map((c) => (
            <li key={c.key}>
              {c.title} — {c.line}
            </li>
          ))}
        </ul>
        <h2>What a Stratxcel agent does</h2>
        <ol>
          {AGENT_STEPS.map((s) => (
            <li key={s.label}>
              {s.label}: {s.detail}
            </li>
          ))}
        </ol>
        <h2>Results</h2>
        <ul>
          {CASE_STUDIES.map((cs) => (
            <li key={cs.client}>
              {cs.client}: {cs.problem} {cs.transformation} Result:{" "}
              {cs.metric.value}
              {cs.metric.suffix} {cs.metric.label}.
            </li>
          ))}
        </ul>
        <h2>Explore</h2>
        <ul>
          {EXPLORE_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a> — {l.hint}
            </li>
          ))}
        </ul>
      </div>

      {/* Server-rendered gate shell: instant first paint. The client
          experience removes it the moment it mounts and takes over. */}
      <div
        id="sx-static-gate"
        className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#05070e] px-6 text-white"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-[#05070e]/80 to-[#05070e] pointer-events-none" />
        
        <p className="sx-kicker relative z-10 text-xs font-mono tracking-[0.4em] uppercase text-indigo-400">
          AI Business Operating System
        </p>
        <div className="mt-8 relative z-10">
          <Mark className="h-16 w-16 sm:h-20 sm:w-20" />
        </div>
        <p
          aria-hidden="true"
          className="sx-display sx-glow-text mt-8 text-center text-[clamp(2.6rem,7vw,5.5rem)] font-extrabold text-white relative z-10 tracking-tight"
        >
          Stratxcel
        </p>
        <p className="mt-4 max-w-md text-center text-[clamp(0.95rem,1.8vw,1.15rem)] font-light text-slate-300 relative z-10">
          We don&rsquo;t build agency brochures. We engineer automated business growth systems.
        </p>

        {/* Quick Commercial Action CTAs */}
        <div className="mt-8 relative z-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/audit"
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-transform hover:scale-105"
          >
            Book Audit ₹999
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-slate-700 bg-slate-900/60 px-8 py-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-200 transition-colors hover:bg-slate-800"
          >
            View Plans
          </Link>
        </div>

        <button
          type="button"
          disabled
          className="sx-start-pulse mt-8 rounded-full border border-[#45c4ff]/50 bg-[#45c4ff]/[0.06] px-10 py-3.5 font-mono text-xs tracking-[0.45em] text-white relative z-10"
        >
          PRESS&nbsp;START
        </button>
        <p className="mt-4 font-mono text-[10px] tracking-[0.3em] text-slate-500 relative z-10">
          INITIALIZING OS ENVIRONMENT…
        </p>
      </div>

      <ExperienceLoader />
    </>
=======
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">
              Stratxcel
            </p>
            <h1 className="mt-5 font-sx-sans text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-sx-text">
              One workspace to run your business with AI.
            </h1>
            <p className="mt-5 max-w-xl font-sx-sans text-[15.5px] leading-relaxed text-sx-text-muted sm:text-base">
              Content, your website, leads and reporting — planned by AI, approved by you, delivered in
              one place. No juggling five disconnected tools, no work happening you didn&rsquo;t sign off on.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="rounded-sx-sm bg-sx-accent px-5 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              >
                Start with Stratxcel
              </Link>
              <Link
                href="/contact?intent=demo"
                className="rounded-sx-sm border border-sx-border-strong px-5 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-6">
              <Link href="/experience" className="font-sx-sans text-[12.5px] text-sx-text-subtle underline underline-offset-4 hover:text-sx-text-muted">
                Prefer to look around first? View the interactive experience →
              </Link>
            </p>
          </div>
        </section>

        {/* Product overview strip */}
        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <h2 className="font-sx-sans text-xl font-semibold text-sx-text sm:text-2xl">
              Everything your business needs done, in one workspace.
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PRODUCTS.map((p) => (
                <Link
                  key={p.title}
                  href={p.href}
                  className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-5 transition-colors duration-150 hover:border-sx-border-strong"
                >
                  <p className="font-sx-sans text-sm font-semibold text-sx-text">{p.title}</p>
                  <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{p.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-sx-sans text-xl font-semibold text-sx-text sm:text-2xl">How Stratxcel works</h2>
          <div className="mt-9 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step}>
                <p className="font-sx-mono text-[11px] text-sx-text-subtle">{s.step}</p>
                <p className="mt-2.5 font-sx-sans text-base font-semibold text-sx-text">{s.title}</p>
                <p className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-9">
            <Link href="/how-it-works" className="font-sx-sans text-[13px] font-medium text-sx-accent hover:underline">
              See the full workflow →
            </Link>
          </p>
        </section>

        {/* Security / trust callout */}
        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 rounded-sx-md border border-sx-border bg-sx-surface-2 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <p className="font-sx-sans text-base font-semibold text-sx-text">Your data stays yours, and stays separated.</p>
                <p className="mt-1.5 max-w-xl font-sx-sans text-[13.5px] text-sx-text-muted">
                  Every workspace is isolated at the database level — one client can never see another&rsquo;s data, by construction, not by convention.
                </p>
              </div>
              <Link
                href="/security"
                className="shrink-0 rounded-sx-sm border border-sx-border-strong px-4 py-2.5 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-elevated"
              >
                Read the security overview
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-semibold text-sx-text sm:text-3xl">
            Ready to hand off the busywork?
          </h2>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start with Stratxcel
            </Link>
            <Link
              href="/pricing"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
            >
              See pricing
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
>>>>>>> origin/feat/stratxcel-core-product-experience
  );
}
