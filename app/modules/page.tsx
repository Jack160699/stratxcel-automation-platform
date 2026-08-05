import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { StageRail } from "@/app/components/public/StageRail";
import { TrustChips } from "@/app/components/public/TrustChips";
import { Card, CardHeading } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Modules — Stratxcel AI OS",
  description:
    "Lead intelligence, workflow engine, AI agents, and automation — modules of the Stratxcel operating system for businesses.",
};

const blocks: { id: string; title: string; tag: string; body: string; stages: string[] }[] = [
  {
    id: "lead",
    title: "Lead intelligence",
    tag: "Signal → graph",
    body: "Enrichment, intent scoring, and deduplication that write to your CRM as structured state — not a parallel database nobody trusts.",
    stages: ["Capture", "Enrich", "Score", "Route to module", "Feedback loop"],
  },
  {
    id: "workflow",
    title: "Workflow engine",
    tag: "Deterministic core",
    body: "Branching pipelines with SLAs, approvals, and idempotent steps. Built for audits: every transition is logged and replayable.",
    stages: ["Trigger", "Validate", "Branch", "Side-effect", "Archive"],
  },
  {
    id: "agents",
    title: "AI agents",
    tag: "Reasoning layer",
    body: "Operators that read the graph, propose diffs, and call tools — always within policy envelopes you define.",
    stages: ["Observe", "Plan", "Act", "Verify", "Handoff"],
  },
  {
    id: "automation",
    title: "Automation fabric",
    tag: "Execution mesh",
    body: "Schedulers, queues, and integrations that move data between modules and your stack with backoff, dead letters, and alerts.",
    stages: ["Queue", "Transform", "Deliver", "Retry", "Escalate"],
  },
];

export default function ModulesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Modules</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            Capability you compose — not a feature matrix you rent
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Each module is a bounded subsystem with clear IO contracts. Swap implementations without rewiring your operating
            model.
          </p>

          <div className="mt-10 border-t border-sx-border pt-8">
            <TrustChips
              items={[
                "Composable modules — swap parts without rewiring the OS",
                "Typed boundaries — safer agents and fewer midnight pages",
                "Production defaults — logging, retries, and escalation first",
              ]}
            />
          </div>

          <div className="mt-12 space-y-6">
            {blocks.map((m) => (
              <Card key={m.id} variant="panel" id={m.id} className="scroll-mt-24 p-6 sm:p-7">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-3">
                  <CardHeading className="text-lg sm:text-xl">{m.title}</CardHeading>
                  <span className="w-fit rounded-sx-pill border border-sx-accent/40 px-3 py-1 font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sx-accent">
                    {m.tag}
                  </span>
                </div>
                <p className="mt-3 max-w-3xl font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{m.body}</p>
                <div className="mt-6 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-5">
                  <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">
                    Internal pipeline
                  </p>
                  <StageRail stages={m.stages} className="mt-4" />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
            <p className="font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
              Need a custom module on the graph? We design extensions the same way we design core — with contracts, limits,
              and observability.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Get started
              </a>
              <a
                href="/pricing"
                className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                View pricing
              </a>
            </div>
            <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
              Opens WhatsApp · we&apos;ll tell you honestly if a module belongs in core vs. custom
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
