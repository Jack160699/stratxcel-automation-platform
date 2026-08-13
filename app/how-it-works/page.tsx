import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { WorkflowRail } from "@/components/ui/WorkflowRail";

export const metadata: Metadata = {
  title: "How it works — Stratxcel",
  description: "How the ₹999 staff-delivered Stratxcel Business Growth Audit moves from checkout to a written roadmap.",
};

const STAGES: { label: string; title: string; body: string }[] = [
  {
    label: "Checkout",
    title: "Purchase the one-time Audit",
    body: "Pay ₹999, GST included. The purchase creates an Audit order; it does not start a subscription.",
  },
  {
    label: "Intake",
    title: "Share the essential business context",
    body: "Complete three guided sections in your workspace. Your answers are saved to the paid order and can be resumed.",
  },
  {
    label: "Review",
    title: "The Stratxcel team reviews the evidence",
    body: "A staff member reviews your context, public presence, competitors, and lead path. The order remains in review until a valid report exists.",
  },
  {
    label: "Delivery",
    title: "Your written roadmap is delivered",
    body: "The report includes an executive summary, priority risks, and a 30/60/90-day action plan. You can open it from the Audit page.",
  },
  {
    label: "Next step",
    title: "Decide what to act on",
    body: "Use the report independently or ask Stratxcel to scope monthly help. Any monthly plan is confirmed separately before activation.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is the Audit generated automatically?",
    a: "No. It is a staff-delivered review supported by a structured intake and workspace. Stratxcel does not promise an automated report engine for this offer.",
  },
  {
    q: "Does the Audit start a subscription?",
    a: "No. It is a one-time purchase. Monthly plans use a separate staff-assisted activation process during closed beta.",
  },
  {
    q: "Can Stratxcel staff see my data?",
    a: "Only what's needed to support your workspace, and it's isolated from every other client's data by construction. See the full security overview.",
  },
];

export default function HowItWorksPage() {
  return (
    <PublicPageShell>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">How it works</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            One clear path from purchase to a useful written roadmap.
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
              href="/audit"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start the ₹999 Audit
            </Link>
            <Link
              href="/security"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
            >
              Read the security overview
            </Link>
          </div>
        </section>
    </PublicPageShell>
  );
}
