import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { StageRail } from "@/app/components/public/StageRail";
import { TrustChips } from "@/app/components/public/TrustChips";
import { Card } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Who Stratxcel helps — Stratxcel",
  description:
    "How founders, agencies, and local businesses can use a Stratxcel Business Growth Audit and scoped follow-on support.",
};

const cases: { id: string; title: string; lead: string; body: string; stages: string[] }[] = [
  {
    id: "founders",
    title: "Founders",
    lead: "Choose the few growth priorities worth acting on before adding more tools.",
    body: "The Audit clarifies positioning, discovery, and lead-path gaps. Follow-on work can then be scoped around the highest-value constraint.",
    stages: ["Business context", "Evidence review", "Priority roadmap", "Scoped next step"],
  },
  {
    id: "agencies",
    title: "Agencies",
    lead: "Create a clearer, repeatable review and delivery path for client growth work.",
    body: "Use the Audit to structure discovery and recommendations. Any recurring delivery support is scoped with explicit client ownership and approvals.",
    stages: ["Client intake", "Evidence review", "Recommendation", "Approved delivery"],
  },
  {
    id: "local",
    title: "Local businesses",
    lead: "Find where local discovery and inquiry follow-up are losing opportunities.",
    body: "The Audit reviews the public presence and current lead path, then turns gaps into a practical sequence your team can follow.",
    stages: ["Local presence", "Inquiry path", "Follow-up gaps", "Action roadmap"],
  },
];

export default function UseCasesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Solutions</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            One starting point, adapted to how you operate
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            The same structured Audit is grounded in your business context, public evidence, channels, and goals.
          </p>

          <div className="mt-10 border-t border-sx-border pt-8">
            <TrustChips
              items={[
                "No fabricated benchmarks or results",
                "Recommendations grounded in available evidence",
                "No forced replacement of your current tools",
              ]}
            />
          </div>

          <div className="mt-12 space-y-6">
            {cases.map((c) => (
              <Card key={c.id} variant="panel" id={c.id} className="scroll-mt-24 p-6 sm:p-7">
                <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">Business fit</p>
                <h2 className="mt-2 font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text sm:text-xl">
                  {c.title}
                </h2>
                <p className="mt-3 max-w-3xl font-sx-sans text-[14.5px] font-medium leading-snug text-sx-text">{c.lead}</p>
                <p className="mt-3 max-w-3xl font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{c.body}</p>
                <div className="mt-6 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-5">
                  <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">
                    Common starting path
                  </p>
                  <StageRail stages={c.stages} className="mt-4" />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-6 lg:px-8">
            <p className="font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
              Not sure whether the Audit fits? Tell us what you are trying to improve and we will answer before you purchase.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Ask a question
              </a>
              <a
                href="/pricing"
                className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                View pricing
              </a>
            </div>
            <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
              Opens WhatsApp · typical first reply within one business day
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
