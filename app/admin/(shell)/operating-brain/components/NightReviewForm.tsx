"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "./ActionButtons";
import type { DailyReviewInput } from "@/lib/owner-brain/repositories/reviews-plans";

interface Props {
  reviewDate: string;
  initial: {
    done: string | null;
    problems: string | null;
    decisions: string | null;
    communication: string | null;
    health: string | null;
    socialFamily: string | null;
    learned: string | null;
    mood: string | null;
    energy: string | null;
  } | null;
  onSave: (input: DailyReviewInput) => Promise<void>;
}

const FIELDS: Array<{ key: keyof NonNullable<Props["initial"]>; label: string }> = [
  { key: "done", label: "Done" },
  { key: "problems", label: "Problems" },
  { key: "decisions", label: "Decisions" },
  { key: "communication", label: "Communication" },
  { key: "health", label: "Health" },
  { key: "socialFamily", label: "Social / Family" },
  { key: "learned", label: "Learned" },
];

export function NightReviewForm({ reviewDate, initial, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, initial?.[f.key] ?? ""]))
  );
  const [mood, setMood] = useState(initial?.mood ?? "");
  const [energy, setEnergy] = useState(initial?.energy ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10.5px] text-sx-text-muted">
          Mood
          <input value={mood} onChange={(e) => setMood(e.target.value)} className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 py-1 text-[11.5px] text-sx-text" />
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] text-sx-text-muted">
          Energy (low / medium / high)
          <input value={energy} onChange={(e) => setEnergy(e.target.value)} className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 py-1 text-[11.5px] text-sx-text" />
        </label>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-[10.5px] text-sx-text-muted">
          {f.label}
          <textarea
            rows={2}
            value={values[f.key]}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 py-1 text-[11.5px] text-sx-text"
          />
        </label>
      ))}
      <div className="flex items-center gap-2">
        <ActionButton
          label={pending ? "Saving…" : "Save review"}
          tone="accent"
          onClick={() =>
            new Promise<void>((resolve) =>
              startTransition(() =>
                onSave({ reviewDate, ...values, moodEnergy: { mood, energy } })
                  .then(() => setSaved(true))
                  .finally(resolve)
              )
            )
          }
        />
        {saved && <span className="text-[10.5px] text-[#5BDCA7]">Saved.</span>}
      </div>
    </div>
  );
}
