import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { TrustChips } from "@/app/components/public/TrustChips";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Agents — Stratxcel AI OS",
  description:
    "How AI agents operate inside the Stratxcel system: reasoning, tool use, human checkpoints, and module APIs — not chatbots bolted on the side.",
  robots: { index: false, follow: false },
};

export default async function AgentsPage() {
  const { gatePublicTechnicalPage } = await import("@/lib/release/public-technical-gate");
  await gatePublicTechnicalPage("/how-it-works");
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Agents</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            Operators on your graph — not another chat window
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Agents read structured state, propose actions, and call module APIs. They default to narrow missions so
            reliability stays ahead of novelty.
          </p>

          <div className="mt-10 border-t border-sx-border pt-8">
            <TrustChips
              items={[
                "Policy envelopes — agents can't exceed what you sign off",
                "Tool calls are logged — replay and audit stay first-class",
                "Humans stay in the loop where stakes demand it",
              ]}
            />
          </div>

          <div className="mt-12 max-w-3xl space-y-10">
            <section>
              <h2 className="font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text sm:text-xl">
                How agents differ from &ldquo;AI features&rdquo;
              </h2>
              <p className="mt-3 font-sx-sans text-[14.5px] leading-relaxed text-sx-text-muted">
                A feature answers prompts. An <strong className="font-semibold text-sx-text">agent</strong> is scheduled or
                event-driven, carries memory within policy, and must declare its tool calls. Outputs are diffed against
                your rules before side effects commit.
              </p>
            </section>
            <section>
              <h2 className="font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text sm:text-xl">
                Interaction patterns
              </h2>
              <ul className="mt-3 space-y-2.5 font-sx-sans text-[14.5px] leading-relaxed text-sx-text-muted">
                <li>
                  <span className="font-semibold text-sx-text">Human-in-the-loop.</span> Agents stage changes; humans
                  approve batches where stakes warrant it.
                </li>
                <li>
                  <span className="font-semibold text-sx-text">Closed-loop automation.</span> When confidence and policy
                  align, agents execute and attach receipts to the audit trail.
                </li>
                <li>
                  <span className="font-semibold text-sx-text">Escalation.</span> Unknown states route to on-call paths
                  with full context — never silent failure.
                </li>
              </ul>
            </section>
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <p className="font-sx-sans text-[14.5px] leading-relaxed text-sx-text-muted">
              Agents sit on the same contracts as the rest of the OS — see{" "}
              <Link href="/modules#agents" className="font-medium text-sx-accent hover:underline">
                Agents &amp; automation
              </Link>{" "}
              in Modules for pipeline detail.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Get started
              </a>
              <a
                href="/system"
                className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                View system
              </a>
            </div>
            <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
              Opens WhatsApp · we&apos;ll pressure-test agent scope before you over-commit
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
