import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PUBLISHED_LOCAL_BUSINESS_VERTICALS } from "@/lib/solutions/local-business-verticals";
import { LOCAL_BUSINESS_JOURNEY_STAGES } from "@/lib/solutions/journey-model";

const PREVIEW_SLUGS = ["restaurants-cafes", "salon-beauty", "retail", "coaching-education"] as const;

export function HomeLocalBusinessJourneys() {
  const featured = PREVIEW_SLUGS.map((slug) => PUBLISHED_LOCAL_BUSINESS_VERTICALS.find((v) => v.slug === slug)).filter(
    Boolean,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Local journeys</p>
            <h3 className="mt-2 font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
              From get found to follow-up—in five steps
            </h3>
            <p className="mt-2 text-sm text-sx-text-muted">
              {LOCAL_BUSINESS_JOURNEY_STAGES.map((s) => s.title).join(" → ")}. See how it maps for your business type.
            </p>
          </div>
          <Link href="/solutions#built-around-your-business" className="text-sm font-semibold text-sx-accent hover:underline">
            Explore all business types →
          </Link>
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map(
            (vertical) =>
              vertical && (
                <li key={vertical.slug}>
                  <Card variant="panel" className="h-full p-4">
                    <h4 className="text-sm font-semibold text-sx-text">{vertical.title}</h4>
                    <p className="mt-1 text-xs text-sx-text-muted line-clamp-2">{vertical.headline}</p>
                    <Link href={`/solutions/${vertical.slug}`} className="mt-3 inline-block text-xs font-semibold text-sx-accent">
                      View journey →
                    </Link>
                  </Card>
                </li>
              ),
          )}
        </ul>
      </div>
    </div>
  );
}
