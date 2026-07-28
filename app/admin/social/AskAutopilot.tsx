"use client";

import { useState } from "react";

const QUICK_ACTIONS: Array<{ label: string; icon: React.ReactNode }> = [
  { label: "Plan next week", icon: <CalendarIcon /> },
  { label: "Analyze this month's performance", icon: <ChartIcon /> },
  { label: "Find our biggest opportunity", icon: <TargetIcon /> },
  { label: "Check why anything failed", icon: <AlertIcon /> },
];

function ask(text: string) {
  window.dispatchEvent(new CustomEvent("saut:ask-agent", { detail: text }));
}

export default function AskAutopilot() {
  const [value, setValue] = useState("");
  return (
    <div className="saut-card-ai p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          ask(value.trim());
          setValue("");
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Autopilot — e.g. “Plan next week” or “Why did engagement fall?”"
          aria-label="Ask Autopilot"
          className="saut-input saut-ask-input flex-1"
        />
        <button type="submit" className="saut-btn saut-btn-primary saut-ask-btn">
          Ask
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.label}
            onClick={() => ask(qa.label)}
            className="saut-btn saut-btn-secondary !h-7 !gap-1.5 !px-2.5 text-[11px]"
          >
            {qa.icon}
            {qa.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8h14M6.5 3v3M13.5 3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 16V9M10 16V4M16 16v-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.5 17.5 16h-15L10 3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 8.3v3.2M10 13.8h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
