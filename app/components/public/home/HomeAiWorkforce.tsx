import Link from "next/link";
import { PRODUCTS } from "@/lib/product-suite/taxonomy";
import { ProductStateBadge } from "@/app/components/public/product-suite/ProductStateBadge";

const workforce = PRODUCTS["ai-workforce"];

export function HomeAiWorkforce() {
  if (!workforce) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">AI Workforce</p>
          <div className="mt-3 flex items-center gap-3">
            <h2 className="font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
              Give the system an outcome, not ten disconnected tasks
            </h2>
            <ProductStateBadge availability={workforce.availability} />
          </div>
          <p className="mt-4 font-sx-sans text-sm leading-relaxed text-sx-text-muted sm:text-base">
            {workforce.outcome} Assign missions, review plans, and approve consequential actions before they run.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex text-sm font-semibold text-sx-accent hover:underline"
          >
            See how AI operations fit the platform →
          </Link>
        </div>

        <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6">
          <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-text-subtle">
            BUSINESS → BRAIN → ACTION → RESULTS
          </p>
          <ol className="mt-5 space-y-4">
            {[
              { step: "Business", body: "Define the outcome and constraints in plain language." },
              { step: "Brain", body: "Brand Brain and workspace context shape the plan." },
              { step: "Action", body: "Missions and automations prepare work behind approval gates." },
              { step: "Results", body: "Review outputs, publish, and measure what changed." },
            ].map((item) => (
              <li key={item.step} className="flex gap-3">
                <span className="font-sx-mono text-xs font-bold text-sx-accent">{item.step}</span>
                <span className="text-sm text-sx-text-muted">{item.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
