import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SOLUTION_OUTCOMES } from "@/lib/solutions/outcomes";

const FEATURED_OUTCOME_IDS = ["more-leads", "grow-social", "automate-work"] as const;

export function HomeSolutionsPreview() {
  const featured = FEATURED_OUTCOME_IDS.map((id) => SOLUTION_OUTCOMES.find((o) => o.id === id)).filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Solutions</p>
        <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
          Start with the outcome you need
        </h2>
        <p className="mt-3 font-sx-sans text-sm leading-relaxed text-sx-text-muted sm:text-base">
          Products explain what Stratxcel provides. Solutions explain what you want to accomplish.
        </p>
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map(
          (outcome) =>
            outcome && (
              <li key={outcome.id}>
                <Card variant="panel" className="h-full p-5">
                  <h3 className="font-sx-sans text-base font-semibold text-sx-text">{outcome.title}</h3>
                  <p className="mt-1 text-sm font-medium text-sx-accent">{outcome.tagline}</p>
                  <p className="mt-2 text-sm text-sx-text-muted">{outcome.description}</p>
                </Card>
              </li>
            )
        )}
      </ul>

      <div className="mt-8 text-center">
        <Link href="/solutions" className="text-sm font-semibold text-sx-accent hover:underline">
          Explore all business outcomes →
        </Link>
      </div>
    </div>
  );
}
