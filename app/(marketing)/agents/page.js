import Link from "next/link";
import { PageHero } from "@/app/components/PageHero";
import { AgentOrbit } from "@/app/components/visuals/AgentOrbit";
import { PrimaryButton, GhostButton, CTARow, CTAMicrocopy, TrustChips } from "@/app/components/marketing-ui";
import { COLORS, whatsappHref } from "@/lib/constants";

export const metadata = {
  title: "Agents — Stratxcel AI OS",
  description:
    "How AI agents operate inside the Stratxcel system: reasoning, tool use, human checkpoints, and module APIs — not chatbots bolted on the side.",
};

const { surface } = COLORS;

export default function AgentsPage() {
  return (
    <>
      <PageHero
        eyebrow="Agents"
        title="Operators on your graph — not another chat window"
        description="Agents read structured state, propose actions, and call module APIs. They default to narrow missions so reliability stays ahead of novelty."
      >
        <AgentOrbit className="mx-auto h-auto w-full max-w-md" />
      </PageHero>

      <div className="border-b border-slate-200/45 bg-white py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl space-y-8 px-4 sm:space-y-10 sm:px-6 lg:px-8">
          <div className="border-b border-slate-100 pb-8 sm:pb-9">
            <TrustChips
              items={[
                "Policy envelopes — agents can’t exceed what you sign off",
                "Tool calls are logged — replay and audit stay first-class",
                "Humans stay in the loop where stakes demand it",
              ]}
            />
          </div>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#0B1220] sm:text-xl md:text-2xl">
              How agents differ from “AI features”
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:mt-4 sm:text-[16px]">
              A feature answers prompts. An <strong className="font-semibold text-slate-800">agent</strong>{" "}
              is scheduled or event-driven, carries memory within policy, and must declare its tool
              calls. Outputs are diffed against your rules before side effects commit.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#0B1220] sm:text-xl md:text-2xl">
              Interaction patterns
            </h2>
            <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-slate-600 sm:mt-4 sm:space-y-3 sm:text-[16px]">
              <li>
                <span className="font-semibold text-slate-800">Human-in-the-loop.</span> Agents
                stage changes; humans approve batches where stakes warrant it.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Closed-loop automation.</span> When
                confidence and policy align, agents execute and attach receipts to the audit trail.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Escalation.</span> Unknown states route
                to on-call paths with full context — never silent failure.
              </li>
            </ul>
          </section>
        </div>
      </div>

      <div className="py-12 sm:py-16" style={{ backgroundColor: surface }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">
            Agents sit on the same contracts as the rest of the OS — see{" "}
            <Link href="/modules#agents" className="font-medium text-blue-700 underline-offset-4 hover:underline">
              Agents & automation
            </Link>{" "}
            in Modules for pipeline detail.
          </p>
          <CTARow className="mt-8 sm:mt-9">
            <PrimaryButton href={whatsappHref} external>
              Get started
            </PrimaryButton>
            <GhostButton href="/system">View system</GhostButton>
          </CTARow>
          <CTAMicrocopy>
            Opens WhatsApp · we&apos;ll pressure-test agent scope before you over-commit
          </CTAMicrocopy>
        </div>
      </div>
    </>
  );
}
