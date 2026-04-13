import { PageHero } from "@/app/components/PageHero";
import { PipelineRail } from "@/app/components/visuals/PipelineRail";
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
  title: "Use cases — Stratxcel AI OS",
  description:
    "How founders, agencies, and local businesses deploy the Stratxcel AI operating system — same substrate, different topologies.",
};

const { surface } = COLORS;

const cases = [
  {
    id: "founders",
    title: "Founders",
    lead: "Ship a credible operating system before the team scales.",
    body: "You need pipelines that survive the next hire — lead routing, investor reporting, and product feedback all flowing through one graph. We bias toward thin vertical slices that earn their place in production weekly.",
    stages: ["Signal chaos", "Single pipeline", "Module expansion", "Board-ready metrics"],
  },
  {
    id: "agencies",
    title: "Agencies",
    lead: "Isolate client graphs without duplicating your own ops.",
    body: "Each client system gets boundaries: data planes, rate limits, and agent permissions. Your internal OS stays shared; client surfaces stay separate — so you scale delivery without scaling incidents.",
    stages: ["Tenant template", "Per-client graph", "Shared playbooks", "Cross-client learnings"],
  },
  {
    id: "local",
    title: "Local businesses",
    lead: "High-touch service with machine-grade follow-through.",
    body: "Missed calls and sticky notes are not a CRM. We wire SMS, booking, and inventory into workflows that feel human on the outside and disciplined on the inside — with escalation paths your staff already understands.",
    stages: ["Front desk signals", "Auto triage", "Human confirm", "Job completion"],
  },
];

export default function UseCasesPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Same OS — tuned to how you operate"
        description="We do not reskin a generic SaaS template. We map your topology — channels, teams, compliance — then attach modules where they reduce entropy."
      />

      <div className="border-t border-slate-200/40 bg-white">
        <div className="mx-auto max-w-6xl space-y-0 px-4 sm:px-6 lg:px-8">
          <div className="border-b border-slate-100 py-8 sm:py-10">
            <TrustChips
              items={[
                "We’ve shipped systems across founders, agencies, and local ops",
                "Playbooks grounded in real integrations — not generic AI hype",
                "You keep your stack — we don’t force a rip-and-replace CRM",
              ]}
            />
          </div>
          {cases.map((c, i) => (
            <Reveal key={c.id} delay={i * 80}>
              <section
                id={c.id}
                className="scroll-mt-24 border-b border-slate-100 py-12 last:border-0 sm:scroll-mt-28 sm:py-16 lg:py-20"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.2em]">
                  Topology
                </p>
                <h2 className="mt-2.5 text-xl font-semibold tracking-[-0.035em] text-[#0B1220] sm:mt-3 sm:text-2xl md:text-3xl">
                  {c.title}
                </h2>
                <p className="mt-3 max-w-3xl text-[16px] font-medium leading-snug text-slate-800 sm:mt-4 sm:text-lg">
                  {c.lead}
                </p>
                <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600 sm:mt-4 sm:text-[16px]">
                  {c.body}
                </p>
                <div className="mt-8 max-w-4xl rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/90 p-5 sm:mt-9 sm:p-7 md:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Typical rollout spine
                  </p>
                  <PipelineRail stages={c.stages} className="mt-2" />
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="py-12 sm:py-16" style={{ backgroundColor: surface }}>
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">
            Tell us which topology you are closest to — we will respond with a concrete system map,
            not a capabilities PDF.
          </p>
          <CTARow className="mt-7 sm:mt-8">
            <PrimaryButton href={whatsappHref} external>
              Get started
            </PrimaryButton>
            <GhostButton href="/pricing">View pricing</GhostButton>
          </CTARow>
          <CTAMicrocopy>
            Opens WhatsApp · typical first reply within one business day
          </CTAMicrocopy>
        </div>
      </div>
    </>
  );
}
