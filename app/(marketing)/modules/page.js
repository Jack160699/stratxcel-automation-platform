import { PageHero } from "@/app/components/PageHero";
import { PipelineRail } from "@/app/components/visuals/PipelineRail";
import { PrimaryButton, GhostButton, CTARow, CTAMicrocopy, TrustChips } from "@/app/components/marketing-ui";
import { COLORS, whatsappHref } from "@/lib/constants";
import { Reveal } from "@/app/components/Reveal";

export const metadata = {
  title: "Modules — Stratxcel AI OS",
  description:
    "Lead intelligence, workflow engine, AI agents, and automation — modules of the Stratxcel operating system for businesses.",
};

const { surface, brand, accent } = COLORS;

const blocks = [
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
    <>
      <PageHero
        eyebrow="Modules"
        title="Capability you compose — not a feature matrix you rent"
        description="Each module is a bounded subsystem with clear IO contracts. Swap implementations without rewiring your operating model."
      />

      <div className="border-t border-slate-200/40 bg-white py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-6xl space-y-14 px-4 sm:space-y-16 sm:px-6 lg:space-y-20 lg:px-8">
          <div className="border-b border-slate-100 pb-10 sm:pb-12">
            <TrustChips
              items={[
                "Composable modules — swap parts without rewiring the OS",
                "Typed boundaries — safer agents and fewer midnight pages",
                "Production defaults — logging, retries, and escalation first",
              ]}
            />
          </div>
          {blocks.map((m, i) => (
            <Reveal key={m.id} delay={i * 60}>
              <article
                id={m.id}
                className="scroll-mt-24 border-b border-slate-100 pb-14 last:border-0 last:pb-0 sm:scroll-mt-28 sm:pb-16 md:pb-20"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-3">
                  <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#0B1220] sm:text-2xl md:text-3xl">
                    {m.title}
                  </h2>
                  <span
                    className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ borderColor: `${accent}40`, color: brand }}
                  >
                    {m.tag}
                  </span>
                </div>
                <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-slate-600 sm:mt-5 sm:text-[16px]">
                  {m.body}
                </p>
                <div className="mt-8 rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/80 p-5 sm:mt-9 sm:p-7 md:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Internal pipeline
                  </p>
                  <PipelineRail stages={m.stages} className="mt-2" />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="py-12 sm:py-16" style={{ backgroundColor: surface }}>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
            Need a custom module on the graph? We design extensions the same way we design core —
            with contracts, limits, and observability.
          </p>
          <CTARow className="mt-7 sm:mt-8">
            <PrimaryButton href={whatsappHref} external>
              Get started
            </PrimaryButton>
            <GhostButton href="/pricing">View pricing</GhostButton>
          </CTARow>
          <CTAMicrocopy>
            Opens WhatsApp · we&apos;ll tell you honestly if a module belongs in core vs. custom
          </CTAMicrocopy>
        </div>
      </div>
    </>
  );
}
