"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PUBLISHED_LOCAL_BUSINESS_VERTICALS } from "@/lib/solutions/local-business-verticals";
import { BusinessJourneyVisual } from "./BusinessJourneyVisual";

export function BuiltAroundYourBusinessSection() {
  const [activeSlug, setActiveSlug] = useState(PUBLISHED_LOCAL_BUSINESS_VERTICALS[0]?.slug ?? "");
  const active = PUBLISHED_LOCAL_BUSINESS_VERTICALS.find((v) => v.slug === activeSlug) ?? PUBLISHED_LOCAL_BUSINESS_VERTICALS[0];

  return (
    <section id="built-around-your-business" className="border-b border-sx-border bg-sx-surface-2">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Local businesses</p>
          <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
            Built around businesses like yours
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-sx-text-muted sm:text-base">
            Pick your business type to see a practical journey from discovery to follow-up—mapped to Stratxcel outcomes.
          </p>
        </div>

        <ul className="mt-10 flex flex-wrap justify-center gap-2">
          {PUBLISHED_LOCAL_BUSINESS_VERTICALS.map((vertical) => {
            const selected = vertical.slug === active?.slug;
            return (
              <li key={vertical.slug}>
                <button
                  type="button"
                  onClick={() => setActiveSlug(vertical.slug)}
                  className={`rounded-sx-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-sx-accent/40 bg-sx-accent-muted text-sx-accent"
                      : "border-sx-border bg-sx-surface-1 text-sx-text-muted hover:border-sx-border-strong"
                  }`}
                >
                  {vertical.title}
                </button>
              </li>
            );
          })}
        </ul>

        {active && (
          <div className="mt-8">
            <Card variant="panel" className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-xl">
                  <h3 className="font-sx-sans text-lg font-semibold text-sx-text">{active.headline}</h3>
                  <p className="mt-2 text-sm text-sx-text-muted">{active.description}</p>
                </div>
                <Link
                  href={`/solutions/${active.slug}`}
                  className="inline-flex shrink-0 items-center text-sm font-semibold text-sx-accent hover:underline"
                >
                  View journey →
                </Link>
              </div>
              <BusinessJourneyVisual steps={active.journeySteps} className="mt-8" />
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
