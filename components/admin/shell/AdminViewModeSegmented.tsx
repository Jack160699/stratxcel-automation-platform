"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminViewModeSegmented({ technical }: { technical: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(technical);
  const isTechnical = pending ? optimistic : technical;

  async function setMode(nextTechnical: boolean) {
    if (nextTechnical === isTechnical) return;
    setOptimistic(nextTechnical);
    startTransition(async () => {
      const res = await fetch("/api/admin/view-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextTechnical ? "technical" : "normal" }),
      });
      if (!res.ok) {
        setOptimistic(technical);
        return;
      }
      if (!nextTechnical) {
        router.push("/admin");
      }
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Admin presentation mode"
      className="inline-flex h-8 items-center rounded-lg border border-sx-border/80 bg-sx-surface-2 p-0.5 text-xs text-sx-text-muted"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!isTechnical}
        disabled={pending}
        onClick={() => setMode(false)}
        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent ${
          !isTechnical
            ? "bg-sx-surface-1 text-sx-text shadow-sm"
            : "text-sx-text-subtle hover:text-sx-text"
        }`}
      >
        NORMAL
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isTechnical}
        disabled={pending}
        onClick={() => setMode(true)}
        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent ${
          isTechnical
            ? "bg-sx-surface-1 text-sx-ai shadow-sm font-semibold"
            : "text-sx-text-subtle hover:text-sx-text"
        }`}
      >
        TECHNICAL
      </button>
    </div>
  );
}
