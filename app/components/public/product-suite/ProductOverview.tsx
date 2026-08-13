import Link from "next/link";
import { CUSTOMER_OUTCOME_GROUPS } from "@/lib/product-suite/customer-language";
import { CustomerOutcomeGroupSection } from "./CustomerOutcomeGroupSection";
import { CustomerOutcomePills } from "./CustomerOutcomePills";
import { CustomerValueProps } from "./CustomerValueProps";

export function ProductOverview() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">What Stratxcel helps you do</p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
          Get more customers, market your business, and stay on top of follow-up
        </h1>
        <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
          Start with the outcome you care about. Each capability shows what it helps you achieve, what Stratxcel does,
          and what you do next — with honest availability labels and no overstated promises.
        </p>

        <div className="mt-10 border-t border-sx-border pt-8">
          <CustomerValueProps />
        </div>

        <div className="mt-8">
          <CustomerOutcomePills />
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-2">
        <div className="mx-auto max-w-6xl space-y-14 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          {CUSTOMER_OUTCOME_GROUPS.map((group) => (
            <CustomerOutcomeGroupSection key={group.id} group={group} />
          ))}
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-xl font-semibold text-sx-text">Start with clarity, then choose what to activate</h2>
          <p className="mt-3 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
            The Business Growth Audit is the recommended first step. Monthly capabilities are scoped and confirmed before
            activation.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/audit"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start the Audit
            </Link>
            <Link
              href="/contact"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors hover:bg-sx-surface-2"
            >
              Talk to the team
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
