import Link from "next/link";
import { PageHero } from "@/app/components/PageHero";
import { ArchitectureMesh } from "@/app/components/visuals/ArchitectureMesh";
import { PipelineRail } from "@/app/components/visuals/PipelineRail";
import {
  PrimaryButton,
  GhostButton,
  CTARow,
  CTAMicrocopy,
  TrustChips,
} from "@/app/components/marketing-ui";
import { COLORS, whatsappHref } from "@/lib/constants";

export const metadata = {
  title: "System — Stratxcel AI OS",
  description:
    "Architecture of the Stratxcel AI operating system: ingest, orchestration, execution, and observability for business systems.",
};

const { surface } = COLORS;

export default function SystemPage() {
  return (
    <>
      <PageHero
        eyebrow="System"
        title="The AI operating system your business actually runs on"
        description="A control plane for signals, modules, and automation — designed so execution stays traceable and humans stay in command."
      >
        <ArchitectureMesh className="mx-auto h-auto w-full max-w-2xl drop-shadow-sm" />
      </PageHero>

      <div className="border-b border-slate-200/45 bg-white py-12 sm:py-16 lg:py-20" id="architecture">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 border-b border-slate-100 pb-8 sm:mb-10 sm:pb-9">
            <TrustChips
              items={[
                "Design reviews with engineers who ship pipelines",
                "Readable runbooks — not black-box automation",
                "Escalation paths that default safe",
              ]}
            />
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#0B1220] sm:text-xl md:text-2xl">
            Architecture at a glance
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:mt-4 sm:text-[16px]">
            Everything enters as a <strong className="font-semibold text-slate-800">signal</strong>{" "}
            — form fills, messages, webhooks, scheduled jobs. The orchestration layer normalizes
            schema, applies policy, and hands work to the right{" "}
            <strong className="font-semibold text-slate-800">modules</strong>. Execution writes
            back to your systems of record; observability closes the loop with SLOs, replay, and
            escalation paths.
          </p>
          <div className="mt-8 sm:mt-9">
            <PipelineRail
              stages={["Ingress", "Policy & graph", "Module fan-out", "Execution", "Telemetry"]}
            />
          </div>
        </div>
      </div>

      <div className="py-12 sm:py-16 lg:py-20" style={{ backgroundColor: surface }} id="model">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#0B1220] sm:text-xl md:text-2xl">
            Operating model
          </h2>
          <ul className="mt-5 space-y-3.5 text-[15px] leading-relaxed text-slate-600 sm:mt-6 sm:space-y-4 sm:text-[16px]">
            <li>
              <span className="font-semibold text-slate-800">Systems first.</span> We scope
              engagements around production pipelines and integration surfaces — not headcount.
            </li>
            <li>
              <span className="font-semibold text-slate-800">Contracts between modules.</span> Each
              module exposes typed inputs and outputs so agents can compose safely.
            </li>
            <li>
              <span className="font-semibold text-slate-800">Progressive autonomy.</span> High-stakes
              steps keep human checkpoints; everything else is measured for drift before we widen
              the blast radius.
            </li>
          </ul>
          <CTARow className="mt-8 sm:mt-9">
            <PrimaryButton href={whatsappHref} external>
              Get started
            </PrimaryButton>
            <GhostButton href="/modules">Explore modules</GhostButton>
          </CTARow>
          <CTAMicrocopy>
            Opens WhatsApp · we&apos;ll confirm fit before any formal paperwork
          </CTAMicrocopy>
          <p className="mt-8 text-[13px] leading-relaxed text-slate-500 sm:text-sm">
            Prefer reading end-to-end?{" "}
            <Link href="/agents" className="font-medium text-blue-700 underline-offset-4 hover:underline">
              Continue to Agents
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
