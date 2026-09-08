"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const V2_PATH_PREFIXES = ["/admin/operating-brain", "/admin/hermes"];

export function AdminChannelSelector({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(enabled);
  const isBeta = pending ? optimistic : enabled;

  async function setMode(nextBeta: boolean) {
    if (nextBeta === isBeta) return;
    setOptimistic(nextBeta);
    startTransition(async () => {
      const res = await fetch("/api/admin/release-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextBeta ? "beta" : "stable" }),
      });
      if (!res.ok) {
        setOptimistic(enabled);
        return;
      }
      const onV2 = V2_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (!nextBeta && onV2) {
        router.replace("/admin");
      }
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Release channel"
      className="hidden sm:inline-flex h-8 items-center rounded-lg border border-sx-border/80 bg-sx-surface-2 p-0.5 text-xs text-sx-text-muted"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!isBeta}
        disabled={pending}
        onClick={() => setMode(false)}
        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent ${
          !isBeta
            ? "bg-sx-surface-1 text-sx-text shadow-sm"
            : "text-sx-text-subtle hover:text-sx-text"
        }`}
      >
        Stable
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isBeta}
        disabled={pending}
        onClick={() => setMode(true)}
        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent ${
          isBeta
            ? "bg-sx-surface-1 text-sx-ai shadow-sm font-semibold"
            : "text-sx-text-subtle hover:text-sx-text"
        }`}
      >
        Beta
      </button>
    </div>
  );
}
