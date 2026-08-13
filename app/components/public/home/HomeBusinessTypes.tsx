"use client";

import Link from "next/link";
import { useState } from "react";
import { trackFunnel } from "@/lib/analytics/events";
import { LOCAL_BUSINESS_JOURNEY_STAGES } from "@/lib/solutions/journey-model";
import { getLocalBusinessVerticalBySlug } from "@/lib/solutions/local-business-verticals";

type CategoryId = "places" | "services" | "considered" | "online";

type Category = {
  id: CategoryId;
  label: string;
  blurb: string;
  slugs: readonly string[];
};

/**
 * The homepage shows four ways of grouping the ten supported business types.
 * The full per-vertical system stays on /solutions.
 */
const CATEGORIES: Category[] = [
  {
    id: "places",
    label: "Places people visit",
    blurb: "Getting found nearby matters more than anything else, and enquiries arrive at all hours.",
    slugs: ["restaurants-cafes", "salon-beauty", "retail", "hotels-hospitality"],
  },
  {
    id: "services",
    label: "Services people book",
    blurb: "People read about you before they call, and the first reply decides whether they continue.",
    slugs: ["clinics-healthcare", "coaching-education", "professional-services"],
  },
  {
    id: "considered",
    label: "High-value enquiries",
    blurb: "Fewer enquiries, each worth a lot. Losing one to slow follow-up is expensive.",
    slugs: ["real-estate", "local-manufacturers"],
  },
  {
    id: "online",
    label: "Selling online",
    blurb: "Attention is the whole game, and interest fades fast without a follow-up.",
    slugs: ["d2c-ecommerce"],
  },
];

export function HomeBusinessTypes() {
  const [activeId, setActiveId] = useState<CategoryId>("places");
  const active = CATEGORIES.find((c) => c.id === activeId)!;
  const verticals = active.slugs.map(getLocalBusinessVerticalBySlug).filter(Boolean);

  const select = (id: CategoryId) => {
    setActiveId(id);
    trackFunnel("business_type_selected", { surface: "home_business_types", choice: id });
  };

  return (
    <section data-home-section="business-types" className="border-t border-sx-border bg-sx-surface-1">
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
            Businesses like yours.
          </h2>
          <p className="mt-3 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            The work is the same everywhere — get found, get noticed, get enquiries, follow up, understand what
            happened. What changes is where the pressure sits.
          </p>
        </div>

        <div className="mt-9 flex flex-wrap gap-2" role="tablist" aria-label="Types of business">
          {CATEGORIES.map((category) => {
            const selected = category.id === activeId;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                id={`business-tab-${category.id}`}
                aria-selected={selected}
                aria-controls="business-panel"
                onClick={() => select(category.id)}
                className={`min-h-11 rounded-sx-pill border px-4 py-2.5 font-sx-sans text-[13.5px] font-medium transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                  selected
                    ? "border-sx-accent bg-sx-accent text-sx-accent-on"
                    : "border-sx-border bg-sx-bg text-sx-text-muted hover:border-sx-border-strong hover:text-sx-text"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <div
          id="business-panel"
          role="tabpanel"
          aria-labelledby={`business-tab-${active.id}`}
          key={active.id}
          className="mt-8 rounded-sx-lg border border-sx-border bg-sx-bg p-6 sm:p-8"
        >
          <p className="max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text">{active.blurb}</p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {verticals.map((vertical) => (
              <li key={vertical!.slug}>
                <Link
                  href={`/solutions/${vertical!.slug}`}
                  className="block h-full rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 transition-colors duration-200 hover:border-sx-border-strong motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
                >
                  <p className="font-sx-sans text-[15px] font-semibold text-sx-text">{vertical!.title}</p>
                  <p className="mt-1.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                    {vertical!.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-7 border-t border-sx-border pt-6">
            <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.2em] text-sx-text-subtle">
              The same five steps, every time
            </p>
            <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
              {LOCAL_BUSINESS_JOURNEY_STAGES.map((stage, i, all) => (
                <li key={stage.id} className="flex items-center gap-2">
                  <span className="font-sx-sans text-[13.5px] text-sx-text">{stage.title}</span>
                  {i < all.length - 1 ? (
                    <span className="text-sx-text-subtle" aria-hidden>
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <Link
          href="/solutions#built-around-your-business"
          className="mt-7 inline-flex items-center gap-1.5 font-sx-sans text-[14.5px] font-semibold text-sx-accent hover:underline"
        >
          See all business types <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
