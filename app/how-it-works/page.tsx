import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { WorkflowRail } from "@/components/ui/WorkflowRail";

export const metadata: Metadata = {
  title: "How it works — Stratxcel",
  description: "The mission, approval, execution and measurement loop behind every piece of work Stratxcel does for your business.",
};

const STAGES: { label: string; title: string; body: string }[] = [
  {
    label: "Mission",
    title: "You describe what you need",
    body: "In plain language, in your workspace: a goal, a request, a problem to fix. No form to fill out, no ticket taxonomy to learn.",
  },
  {
    label: "Plan",
    title: "Stratxcel plans the work",
    body: "The request is broken into concrete steps — content to draft, a page to change, leads to follow up — using what's already known about your business.",
  },
  {
    label: "Approval",
    title: "You approve anything sensitive",
    body: "Publishing, spend, outreach to your customers — anything with real-world consequence pauses for your explicit yes before it happens. Routine, reversible steps don't need to wait on you.",
  },
  {
    label: "Execution",
    title: "The work gets done",
    body: "Once approved, Stratxcel carries the step through — and leaves a record of exactly what happened, not just that it \"completed.\"",
  },
  {
    label: "Measurement",
    title: "Results land in your workspace",
    body: "Reporting on what actually happened, not projections — and only what's supported by real data. No invented numbers.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What happens if Stratxcel can't do something yet?",
    a: "You'll see it plainly in your workspace — a disabled action with a clear reason, never a fabricated result.",
  },
  {
    q: "Do I have to approve every single action?",
    a: "No. Routine, reversible work proceeds on its own. Anything with real-world consequence — spend, publishing, outreach — waits for you.",
  },
  {
    q: "Can Stratxcel staff see my data?",
    a: "Only what's needed to support your workspace, and it's isolated from every other client's data by construction. See the full security overview.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">How it works</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            One loop: mission, plan, approval, execution, measurement.
          </h1>
          <div className="mt-10 max-w-md">
            <WorkflowRail
              stages={STAGES.map((s, i) => ({ label: s.label, status: i === 0 ? "active" : "future" }))}
            />
          </div>

          <ol className="mt-14 space-y-10">
            {STAGES.map((s, i) => (
              <li key={s.label} className="flex gap-5 border-t border-sx-border pt-8 first:border-t-0 first:pt-0">
                <span className="font-sx-mono text-[13px] text-sx-text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-sx-sans text-base font-semibold text-sx-text">{s.title}</p>
                  <p className="mt-2 max-w-2xl font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-xl font-semibold text-sx-text">Common questions</h2>
            <div className="mt-7 space-y-6">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <p className="font-sx-sans text-sm font-semibold text-sx-text">{item.q}</p>
                  <p className="mt-1.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/contact?intent=demo"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start with Stratxcel
            </Link>
            <Link
              href="/security"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
            >
              Read the security overview
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
