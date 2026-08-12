import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { StageRail } from "@/app/components/public/StageRail";
import { TrustChips } from "@/app/components/public/TrustChips";
import { Card, CardHeading } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Growth workflows — Stratxcel",
  description:
    "The practical growth workflows Stratxcel can review, scope, and support after a Business Growth Audit.",
};

const blocks: { id: string; title: string; tag: string; body: string; stages: string[] }[] = [
  {
    id: "audit",
    title: "Business Growth Audit",
    tag: "Start here",
    body: "A staff-delivered review of your positioning, website, discovery, competitors, and lead path, ending in a written 30/60/90-day roadmap.",
    stages: ["Purchase", "Complete intake", "Staff review", "Report delivery", "Choose next step"],
  },
  {
    id: "content",
    title: "Content planning",
    tag: "Staff-assisted",
    body: "Plan and prepare social content around a reviewed Brand Brain. Publishing remains approval-controlled and depends on a supported account connection.",
    stages: ["Set direction", "Prepare drafts", "Review", "Approve", "Publish when connected"],
  },
  {
    id: "leads",
    title: "Lead follow-up",
    tag: "Connected workflow",
    body: "Organize captured leads, assign ownership, keep activity visible, and scope follow-up around the channels that are actually connected.",
    stages: ["Capture", "Check duplicates", "Assign", "Follow up", "Record outcome"],
  },
  {
    id: "presence",
    title: "Website and discovery",
    tag: "Scoped service",
    body: "Review and prioritize website and search improvements. Any implementation or publishing scope is confirmed before work begins.",
    stages: ["Review", "Prioritize", "Confirm scope", "Prepare change", "Approve delivery"],
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
            Practical growth workflows, activated only when they fit
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Start with the Audit. If monthly help makes sense, the team confirms the workflow, provider access, scope, and ownership before activation.
          </p>

          <div className="mt-10 border-t border-sx-border pt-8">
            <TrustChips
              items={[
                "Clear scope before activation",
                "Human approval for consequential actions",
                "Unavailable connections shown honestly",
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
                    Typical workflow
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
              Need help after the Audit? Share the priority you want to act on and the team will confirm whether Stratxcel can support it now.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Talk to the team
              </a>
              <a
                href="/pricing"
                className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                View pricing
              </a>
            </div>
            <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
              Opens WhatsApp · scope and availability are confirmed before activation
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
