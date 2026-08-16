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
    description: "Maintain daily high-quality publishing across Instagram, Facebook, and LinkedIn.",
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
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">What do you want StratXcel to help you improve?</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          Pick your top priorities. We will focus your audit analysis and recommendations around these goals.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-sx-md bg-sx-accent/10 border border-sx-accent/20 px-3.5 py-2.5 text-xs text-sx-accent font-medium">
        <span>✨</span>
        <span>
          Recommended goals highlighted for your <strong>{industryLabel}</strong> profile. You can change them anytime.
        </span>
      </div>

      <div role="group" aria-label="Business Goals" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BUSINESS_GOALS.map((goal) => {
          const isSelected = selected.includes(goal.key);
          const isRecommended = recommendedKeys.includes(goal.key);

          return (
            <button
              key={goal.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(goal.key)}
              className={`flex items-start gap-3.5 p-4 rounded-sx-md border text-left transition-all ${
                isSelected
                  ? "border-sx-accent bg-sx-accent/10 shadow-xs ring-1 ring-sx-accent/40"
                  : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-2"
              }`}
            >
              <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">
                {goal.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-sx-sans text-sm font-semibold text-sx-text">{goal.title}</span>
                  {isRecommended && (
                    <span className="rounded-full bg-sx-accent/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-sx-accent shrink-0">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="font-sx-sans text-xs text-sx-text-muted mt-1 leading-relaxed">{goal.description}</p>
              </div>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sx-sm border transition-colors mt-0.5 ${
                  isSelected
                    ? "border-sx-accent bg-sx-accent text-sx-accent-on"
                    : "border-sx-border-strong bg-sx-surface-1 text-transparent"
                }`}
              >
                ✓
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
