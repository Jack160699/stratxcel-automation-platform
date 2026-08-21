"use client";

import type { OnboardingDraft } from "../types";

export interface GoalOption {
  key: string;
  title: string;
  description: string;
  icon: string;
}

const BUSINESS_GOALS: GoalOption[] = [
  {
    key: "local_customers",
    title: "Get more local customers",
    description: "Drive foot-traffic, walk-ins, and local nearby inquiries.",
    icon: "📍",
  },
  {
    key: "google_visibility",
    title: "Improve Google visibility",
    description: "Rank higher on Google Search and Google Maps local packs.",
    icon: "🔍",
  },
  {
    key: "whatsapp_leads",
    title: "Get more leads from WhatsApp",
    description: "Capture, qualify, and answer customer chats 24/7 automatically.",
    icon: "💬",
  },
  {
    key: "social_presence",
    title: "Stay active on social media",
    description: "Maintain daily high-quality publishing across Instagram, Facebook, and YouTube.",
    icon: "📱",
  },
  {
    key: "website_conversion",
    title: "Improve website performance",
    description: "Turn more website visitors into booked appointments and calls.",
    icon: "⚡",
  },
  {
    key: "lead_followup",
    title: "Follow up with leads automatically",
    description: "Never lose a customer lead with instant automated SMS/WhatsApp reminders.",
    icon: "🎯",
  },
];

export function StepGoals({
  draft,
  selected = [],
  onToggle,
}: {
  draft: OnboardingDraft;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const industryLabel = draft.business.industry?.trim() || "business";
  const recommendedKeys = draft.recommendedGoals?.length
    ? draft.recommendedGoals
    : ["google_visibility", "whatsapp_leads", "social_presence"];

  return (
    <div className="flex w-full flex-col gap-1">
      <h2 className="font-sx-sans text-xl font-bold text-sx-text">What matters most to your business?</h2>
      <p className="mb-1.5 text-sm leading-relaxed text-sx-text-muted">Pick the goals you care about — we&rsquo;ll focus on these first.</p>
      <p className="mb-5 text-xs font-semibold text-sx-accent">Recommended for {industryLabel} businesses</p>

      <div role="group" aria-label="Business Goals" className="flex flex-col gap-2.5">
        {BUSINESS_GOALS.map((goal) => {
          const isSelected = selected.includes(goal.key);
          const isRecommended = recommendedKeys.includes(goal.key);

          return (
            <button
              key={goal.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(goal.key)}
              className={`flex items-center gap-3 rounded-sx-md border-[1.5px] p-3.5 text-left transition-colors ${
                isSelected ? "border-sx-accent bg-sx-accent-muted" : "border-sx-border bg-sx-surface-1"
              }`}
            >
              <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sx-xs border-[1.5px] transition-colors ${
                  isSelected ? "border-sx-accent bg-sx-accent" : "border-sx-border-strong bg-sx-surface-1"
                }`}
              >
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-sx-text">{goal.title}</p>
                <p className="mt-0.5 text-xs text-sx-text-subtle">{goal.description}</p>
              </div>
              {isRecommended && (
                <span className="shrink-0 rounded-sx-xs bg-sx-accent/10 px-2 py-1 text-[10px] font-bold tracking-wide text-sx-accent">REC</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
