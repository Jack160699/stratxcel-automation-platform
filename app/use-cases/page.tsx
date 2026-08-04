import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { StageRail } from "@/app/components/public/StageRail";
import { TrustChips } from "@/app/components/public/TrustChips";
import { Card } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Use cases — Stratxcel AI OS",
  description:
    "How founders, agencies, and local businesses deploy the Stratxcel AI operating system — same substrate, different topologies.",
};

const cases: { id: string; title: string; lead: string; body: string; stages: string[] }[] = [
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
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Solutions</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            Same OS — tuned to how you operate
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            We do not reskin a generic SaaS template. We map your topology — channels, teams, compliance — then attach
            modules where they reduce entropy.
          </p>

          <div className="mt-10 border-t border-sx-border pt-8">
            <TrustChips
              items={[
                "We've shipped systems across founders, agencies, and local ops",
                "Playbooks grounded in real integrations — not generic AI hype",
                "You keep your stack — we don't force a rip-and-replace CRM",
              ]}
            />
          </div>

          <div className="mt-12 space-y-6">
            {cases.map((c) => (
              <Card key={c.id} variant="panel" id={c.id} className="scroll-mt-24 p-6 sm:p-7">
                <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">Topology</p>
                <h2 className="mt-2 font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text sm:text-xl">
                  {c.title}
                </h2>
                <p className="mt-3 max-w-3xl font-sx-sans text-[14.5px] font-medium leading-snug text-sx-text">{c.lead}</p>
                <p className="mt-3 max-w-3xl font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{c.body}</p>
                <div className="mt-6 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-5">
                  <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">
                    Typical rollout spine
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
              Tell us which topology you are closest to — we will respond with a concrete system map, not a capabilities
              PDF.
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
              Opens WhatsApp · typical first reply within one business day
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
