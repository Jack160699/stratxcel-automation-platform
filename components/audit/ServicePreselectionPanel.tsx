"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BUSINESS_GOAL_OPTIONS } from "@/lib/audit/business-goal-keys";

/**
 * Final Customer Experience Repair mission, Section 4 (Audit Service
 * Auto-Preselection). "What do you need help with?" -- pre-checked based
 * on the audit's own real category scores (server-computed, see
 * lib/audit/service-preselection.ts), never a generic industry
 * assumption. The customer can deselect or add anything; nothing is
 * forced. Backed by /api/platform/audit/report/interested-services,
 * persisted into the existing audit_orders.goals_answers.
 */
export function ServicePreselectionPanel() {
  const [loaded, setLoaded] = useState(false);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/audit/report/interested-services", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setRecommended(Array.isArray(body.recommended) ? body.recommended : []);
      setSelected(Array.isArray(body.selected) ? body.selected : []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: string) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    setSelected(next);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/platform/audit/report/interested-services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected: next }),
        });
      } finally {
        setSaving(false);
      }
    }, 500);
  }

  if (!loaded) return null;

  return (
    <div className="rounded-[1.25rem] border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-sx-sans text-lg font-bold text-sx-text">What do you need help with?</h3>
        {saving && <span className="text-[11px] text-sx-text-subtle">Saving…</span>}
      </div>
      <p className="mt-1 text-xs text-sx-text-muted">
        Pre-selected based on what your audit actually found — deselect anything, or add more.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {BUSINESS_GOAL_OPTIONS.map((goal) => {
          const isSelected = selected.includes(goal.key);
          const isRecommended = recommended.includes(goal.key);
          return (
            <button
              key={goal.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(goal.key)}
              className={`flex items-start gap-2.5 rounded-sx-md border-[1.5px] p-3 text-left transition-colors ${
                isSelected ? "border-sx-accent bg-sx-accent-muted" : "border-sx-border bg-sx-surface-2/40"
              }`}
            >
              <span
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors ${
                  isSelected ? "border-sx-accent bg-sx-accent" : "border-sx-border-strong bg-sx-surface-1"
                }`}
              >
                {isSelected && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-sx-text">
                  <span aria-hidden="true">{goal.icon}</span>
                  {goal.title}
                  {isRecommended && (
                    <span className="rounded-full bg-sx-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sx-warning">Recommended</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-sx-text-subtle">{goal.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
