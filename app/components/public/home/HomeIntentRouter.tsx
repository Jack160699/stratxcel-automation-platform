"use client";

import Link from "next/link";
import { useState } from "react";
import { trackFunnel } from "@/lib/analytics/events";
import { CUSTOMER_INTENTS, type CustomerIntentId } from "@/lib/solutions/customer-intents";
import { getCustomerPresentation } from "@/lib/product-suite/customer-language";
import { PRODUCTS, getProductHref } from "@/lib/product-suite/taxonomy";

/** Plain-language sequence shown for each intent — how the work actually moves. */
const INTENT_WORKFLOW: Record<CustomerIntentId, string[]> = {
  "more-customers": ["Enquiry arrives", "Owner assigned", "You approve the reply", "Outcome recorded"],
  "grow-on-social": ["Plan the week", "Draft prepared", "You approve", "Published"],
  "found-on-google": ["Your listings reviewed", "Improvements prioritised", "You choose what to fix", "Changes tracked"],
  "follow-up-leads": ["Message received", "Reply suggested", "You approve", "Thread stays with an owner"],
  "improve-website": ["Pages reviewed", "Changes proposed", "You approve", "Site updated"],
  "save-time-with-ai": ["Task described", "Work prepared", "You approve", "It runs on schedule"],
};

const CTA_HREF: Record<CustomerIntentId, string> = {
  "more-customers": "/solutions",
  "grow-on-social": "/social-autopilot",
  "found-on-google": "/products",
  "follow-up-leads": "/products",
  "improve-website": "/products",
  "save-time-with-ai": "/products",
};

export function HomeIntentRouter() {
  const [activeId, setActiveId] = useState<CustomerIntentId>(CUSTOMER_INTENTS[0].id);
  const active = CUSTOMER_INTENTS.find((i) => i.id === activeId)!;
  const products = active.productIds.map((id) => PRODUCTS[id]).filter(Boolean);

  const select = (id: CustomerIntentId) => {
    setActiveId(id);
    trackFunnel("intent_selected", { surface: "home_intent_router", choice: id });
  };

  return (
    <section
      id="what-to-improve"
      data-home-section="intent-router"
      className="border-t border-sx-border bg-sx-surface-1"
    >
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
            What do you want to improve?
          </h2>
          <p className="mt-3 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Pick the thing that matters most right now. We will show you the part of Stratxcel that handles it.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <div role="tablist" aria-label="What do you want to improve?" className="flex flex-col">
            {CUSTOMER_INTENTS.map((intent) => {
              const selected = intent.id === activeId;
              return (
                <button
                  key={intent.id}
                  type="button"
                  role="tab"
                  id={`intent-tab-${intent.id}`}
                  aria-selected={selected}
                  aria-controls="intent-panel"
                  onClick={() => select(intent.id)}
                  className={`group border-t border-sx-border py-4 text-left transition-colors duration-200 last:border-b motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                    selected ? "" : "hover:bg-sx-surface-2/60"
                  }`}
                >
                  <span className="flex items-baseline gap-3">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 translate-y-[-0.2em] rounded-full transition-colors duration-200 motion-reduce:transition-none ${
                        selected ? "bg-sx-accent" : "bg-sx-border-strong"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span
                        className={`block font-sx-sans text-[17px] font-semibold tracking-[-0.01em] transition-colors duration-200 motion-reduce:transition-none sm:text-[19px] ${
                          selected ? "text-sx-text" : "text-sx-text-subtle group-hover:text-sx-text"
                        }`}
                      >
                        {intent.title}
                      </span>
                      {selected ? (
                        <span className="mt-1.5 block font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                          {intent.summary}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}

            <div className="mt-7 rounded-sx-md border border-sx-border bg-sx-surface-2 p-5">
              <p className="font-sx-sans text-[15px] font-semibold text-sx-text">Not sure what to fix first?</p>
              <p className="mt-1.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                Start with a Business Growth Audit and get a written view of where to begin.
              </p>
              <Link
                href="#start-with-clarity"
                className="mt-3 inline-flex items-center gap-1 font-sx-sans text-[13.5px] font-semibold text-sx-accent hover:underline"
              >
                See what the audit covers <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <div
            id="intent-panel"
            role="tabpanel"
            aria-labelledby={`intent-tab-${active.id}`}
            className="lg:pt-1"
            key={active.id}
          >
            <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.2em] text-sx-text-subtle">
              What handles this
            </p>

            <ul className="mt-4 space-y-3">
              {products.map((product) => {
                const presentation = getCustomerPresentation(product.id);
                return (
                  <li key={product.id}>
                    <Link
                      href={getProductHref(product)}
                      className="block rounded-sx-md border border-sx-border bg-sx-bg p-5 transition-colors duration-200 hover:border-sx-border-strong motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
                    >
                      <p className="font-sx-sans text-[15.5px] font-semibold leading-snug text-sx-text">
                        {presentation?.headline ?? product.outcome}
                      </p>
                      <p className="mt-1 font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-accent">
                        {product.name}
                      </p>
                      <p className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                        {presentation?.capability ?? product.userAction}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 rounded-sx-md border border-sx-border bg-sx-surface-2 px-5 py-4">
              <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.2em] text-sx-text-subtle">How it runs</p>
              <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
                {INTENT_WORKFLOW[active.id].map((step, i, all) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="font-sx-sans text-[13px] text-sx-text">{step}</span>
                    {i < all.length - 1 ? (
                      <span className="text-sx-text-subtle" aria-hidden>
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>

            <Link
              href={CTA_HREF[active.id]}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-3 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)] motion-reduce:transition-none"
            >
              {active.title.startsWith("Get") || active.title.startsWith("Grow")
                ? `${active.title} with Stratxcel`
                : `See how Stratxcel does this`}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
