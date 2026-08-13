import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { StageRail } from "@/app/components/public/StageRail";
import { TrustChips } from "@/app/components/public/TrustChips";
import { whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "System — Stratxcel AI OS",
  description:
    "Architecture of the Stratxcel AI operating system: ingest, orchestration, execution, and observability for business systems.",
  robots: { index: false, follow: false },
};

export default async function SystemPage() {
  const { gatePublicTechnicalPage } = await import("@/lib/release/public-technical-gate");
  await gatePublicTechnicalPage("/modules");
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">System</p>
        <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
          The AI operating system your business actually runs on
        </h1>
        <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
          A control plane for signals, modules, and automation — designed so execution stays traceable and humans stay
          in command.
        </p>

        <div className="mt-10 border-t border-sx-border pt-8" id="architecture">
          <TrustChips
            items={[
              "Design reviews with engineers who ship pipelines",
              "Readable runbooks — not black-box automation",
              "Escalation paths that default safe",
            ]}
          />
          <div className="mt-10 max-w-3xl">
            <h2 className="font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text sm:text-xl">
              Architecture at a glance
            </h2>
            <p className="mt-3 font-sx-sans text-[14.5px] leading-relaxed text-sx-text-muted">
              Everything enters as a <strong className="font-semibold text-sx-text">signal</strong> — form fills,
              messages, webhooks, scheduled jobs. The orchestration layer normalizes schema, applies policy, and hands
              work to the right <strong className="font-semibold text-sx-text">modules</strong>. Execution writes back to
              your systems of record; observability closes the loop with SLOs, replay, and escalation paths.
            </p>
            <div className="mt-8 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-5">
              <StageRail stages={["Ingress", "Policy & graph", "Module fan-out", "Execution", "Telemetry"]} />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1" id="model">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-lg font-semibold tracking-[-0.02em] text-sx-text sm:text-xl">
            Operating model
          </h2>
          <ul className="mt-5 space-y-3.5 font-sx-sans text-[14.5px] leading-relaxed text-sx-text-muted">
            <li>
              <span className="font-semibold text-sx-text">Systems first.</span> We scope engagements around production
              pipelines and integration surfaces — not headcount.
            </li>
            <li>
              <span className="font-semibold text-sx-text">Contracts between modules.</span> Each module exposes typed
              inputs and outputs so agents can compose safely.
            </li>
            <li>
              <span className="font-semibold text-sx-text">Progressive autonomy.</span> High-stakes steps keep human
              checkpoints; everything else is measured for drift before we widen the blast radius.
            </li>
          </ul>
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
              href="/modules"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
            >
              Explore modules
            </a>
          </div>
          <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
            Opens WhatsApp · we&apos;ll confirm fit before any formal paperwork
          </p>
          <p className="mt-8 font-sx-sans text-[13px] leading-relaxed text-sx-text-subtle">
            Prefer reading end-to-end?{" "}
            <Link href="/agents" className="font-medium text-sx-accent hover:underline">
              Continue to Agents
            </Link>
            .
          </p>
        </div>
      </section>
    </PublicPageShell>
  );
}
