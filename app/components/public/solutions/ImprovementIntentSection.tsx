"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CUSTOMER_INTENTS } from "@/lib/solutions/customer-intents";
import { PRODUCTS } from "@/lib/product-suite/taxonomy";
import { getOutcomeById } from "@/lib/solutions/outcomes";

export function ImprovementIntentSection() {
  return (
    <section id="what-to-improve" className="border-b border-sx-border">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Start here</p>
          <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
            What do you want to improve?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-sx-text-muted sm:text-base">
            Choose an intent to see the outcome and products Stratxcel connects for local businesses.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOMER_INTENTS.map((intent) => {
            const outcome = getOutcomeById(intent.outcomeId);
            const products = intent.productIds.map((id) => PRODUCTS[id]).filter(Boolean);
            return (
              <li key={intent.id}>
                <Card variant="panel" className="flex h-full flex-col p-5">
                  <h3 className="font-sx-sans text-base font-semibold text-sx-text">{intent.title}</h3>
                  <p className="mt-2 text-sm text-sx-text-muted">{intent.summary}</p>
                  {outcome && (
                    <p className="mt-3 text-xs font-medium text-sx-accent">Outcome: {outcome.title}</p>
                  )}
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {products.map((product) => (
                      <li
                        key={product.id}
                        className="rounded-sx-pill border border-sx-border bg-sx-surface-2 px-2 py-0.5 text-[10px] font-semibold text-sx-text-muted"
                      >
                        {product.name}
                      </li>
                    ))}
                  </ul>
                  <Link href="/audit" className="mt-4 text-sm font-semibold text-sx-accent hover:underline">
                    Start with a growth audit →
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
