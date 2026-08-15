"use client";

import Link from "next/link";
import { useState } from "react";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import {
  AnalyticsChapterVisual,
  CrmChapterVisual,
  SearchChapterVisual,
  SocialChapterVisual,
} from "@/app/components/public/home/chapters/chapter-visuals";
import { DEMO_DISCLAIMER } from "@/app/components/public/showcase/fixtures/showcase-data";

type TourStep = {
  id: string;
  stage: string;
  title: string;
  explanation: string;
  control: string;
  visual: React.ReactNode;
};

const STEPS: TourStep[] = [
  {
    id: "get-found",
    stage: "Get found",
    title: "See what is stopping customers from finding you.",
    explanation:
      "Stratxcel reads your listings, pages, and search presence and tells you what is incomplete, duplicated, or missing — in the order worth fixing.",
    control: "Nothing on your website or listings changes until you say so.",
    visual: <SearchChapterVisual />,
  },
  {
    id: "get-attention",
    stage: "Get attention",
    title: "A week of content, prepared for you to approve.",
    explanation:
      "The plan and the drafts are written from your brand context, so the words sound like your business rather than a generic template.",
    control: "Nothing publishes until you approve it.",
    visual: <SocialChapterVisual />,
  },
  {
    id: "follow-up",
    stage: "Enquiries & follow-up",
    title: "One inbox for everything a customer sends you.",
    explanation:
      "Website forms, WhatsApp messages, and social enquiries arrive in the same place, with a reply prepared and an owner attached.",
    control: "You send the reply, or rewrite it first. Your call, every time.",
    visual: <CrmChapterVisual />,
  },
  {
    id: "understand",
    stage: "Understand",
    title: "A plain-language summary of what actually happened.",
    explanation:
      "One view across your connected channels, plus a short list of the things that look like they deserve a decision this week.",
    control: "Nothing is inferred about your business that you cannot trace back.",
    visual: <AnalyticsChapterVisual />,
  },
];

export default function InteractiveExperiencePage() {
  const [stepIndex, setStepIndex] = useState(0);
  const current = STEPS[stepIndex]!;

  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.2em] text-sx-text-subtle">Guided tour</p>
          <h1 className="mt-3 font-sx-sans text-[clamp(1.7rem,3.4vw+0.4rem,2.7rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
            Walk through Stratxcel before you sign up.
          </h1>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
            Four steps, in the order your business actually works. These are the real screens, filled with sample data.
          </p>
        </div>

        <div
          className="mt-10 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Tour steps"
        >
          {STEPS.map((step, i) => {
            const selected = i === stepIndex;
            return (
              <button
                key={step.id}
                type="button"
                role="tab"
                id={`tour-tab-${step.id}`}
                aria-selected={selected}
                aria-controls="tour-panel"
                onClick={() => setStepIndex(i)}
                className={`min-h-11 rounded-sx-pill border px-4 py-2.5 font-sx-sans text-[13.5px] font-medium transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                  selected
                    ? "border-sx-accent bg-sx-accent text-sx-accent-on"
                    : "border-sx-border bg-sx-surface-1 text-sx-text-muted hover:border-sx-border-strong hover:text-sx-text"
                }`}
              >
                <span className="font-sx-mono text-[10px] opacity-70">{i + 1}</span> {step.stage}
              </button>
            );
          })}
        </div>

        <div
          id="tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-tab-${current.id}`}
          key={current.id}
          className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14"
        >
          <div>
            <h2 className="font-sx-sans text-[clamp(1.3rem,2.2vw+0.4rem,1.85rem)] font-semibold leading-snug tracking-[-0.025em] text-sx-text">
              {current.title}
            </h2>
            <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">{current.explanation}</p>
            <p className="mt-5 rounded-sx-md border border-sx-border bg-sx-surface-1 px-4 py-3.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text">
              <span className="font-semibold">You stay in control.</span> {current.control}
            </p>
          </div>

          <div>{current.visual}</div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-sx-border pt-6">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            className="min-h-11 rounded-sx-sm border border-sx-border-strong px-5 py-2.5 font-sx-sans text-[13.5px] font-semibold text-sx-text transition-colors hover:bg-sx-surface-2 disabled:opacity-40 motion-reduce:transition-none"
          >
            ← Previous
          </button>

          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1))}
              className="min-h-11 rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-[13.5px] font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)] motion-reduce:transition-none"
            >
              Next step →
            </button>
          ) : (
            <Link
              href="/audit"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-[13.5px] font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)] motion-reduce:transition-none"
            >
              Start the Free Audit →
            </Link>
          )}
        </div>

        <p className="mt-6 font-sx-sans text-[12px] text-sx-text-subtle">{DEMO_DISCLAIMER}</p>
      </section>
    </PublicPageShell>
  );
}
