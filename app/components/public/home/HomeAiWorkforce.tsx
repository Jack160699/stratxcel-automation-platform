import Link from "next/link";
import { PRODUCTS } from "@/lib/product-suite/taxonomy";
import { ProductStateBadge } from "@/app/components/public/product-suite/ProductStateBadge";
import { ScrollReveal } from "@/app/components/public/motion/ScrollReveal";
import { WorkforceFlowVisual } from "./WorkforceFlowVisual";

const workforce = PRODUCTS["ai-workforce"];

export function HomeAiWorkforce() {
  if (!workforce) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <ScrollReveal>
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
            AI Workforce
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
              Give the system an outcome, not ten disconnected tasks
            </h2>
            <ProductStateBadge availability={workforce.availability} />
          </div>
          <p className="mt-4 font-sx-sans text-sm leading-relaxed text-sx-text-muted sm:text-base">
            {workforce.outcome} Assign missions, review plans, and approve consequential actions before
            they run.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex text-sm font-semibold text-sx-accent hover:underline"
          >
            See how AI operations fit the platform →
          </Link>
        </ScrollReveal>

        <ScrollReveal delay={120}>
          <WorkforceFlowVisual />
        </ScrollReveal>
      </div>
    </div>
  );
}
