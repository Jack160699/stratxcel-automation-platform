"use client";

import { useState } from "react";

const QUICK_ACTIONS = ["Plan next week", "Analyze this month's performance", "Find our biggest opportunity", "Check why anything failed"];

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
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Autopilot — e.g. “Plan next week” or “Why did engagement fall?”"
          className="saut-input flex-1"
        />
        <button type="submit" className="saut-btn saut-btn-primary">
          Ask
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((qa) => (
          <button key={qa} onClick={() => ask(qa)} className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">
            {qa}
          </button>
        ))}
      </div>
    </div>
  );
}
