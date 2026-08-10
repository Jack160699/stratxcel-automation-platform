"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const V2_PATH_PREFIXES = ["/admin/operating-brain", "/admin/hermes"];

/**
 * Compact Stable / Beta switch for the admin top bar.
 * Persists via server-owned httpOnly cookie (POST /api/admin/release-mode).
 */
export function AdminBetaModeToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(enabled);
  const checked = pending ? optimistic : enabled;

  async function setMode(next: boolean) {
    setOptimistic(next);
    startTransition(async () => {
      const res = await fetch("/api/admin/release-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next ? "beta" : "stable" }),
      });
      if (!res.ok) {
        setOptimistic(enabled);
        return;
      }
      const onV2 = V2_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (!next && onV2) {
        router.replace("/admin");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {checked && (
        <span className="hidden rounded-[5px] border border-[rgb(79_220_229_/_0.28)] bg-[rgb(79_220_229_/_0.1)] px-1.5 py-0.5 font-sx-mono text-[9px] uppercase tracking-[0.1em] text-sx-ai sm:inline">
          Beta
        </span>
      )}
      <div className="flex items-center gap-1.5 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-2 py-1">
        <span
          className={`font-sx-mono text-[10px] uppercase tracking-[0.06em] ${
            checked ? "text-sx-text-subtle" : "text-sx-text"
          }`}
        >
          Stable
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={checked ? "Disable Beta mode" : "Enable Beta mode"}
          disabled={pending}
          onClick={() => setMode(!checked)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent disabled:opacity-60 ${
            checked ? "bg-sx-ai" : "bg-sx-border-strong"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-sx-bg shadow transition-transform ${
              checked ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span
          className={`font-sx-mono text-[10px] uppercase tracking-[0.06em] ${
            checked ? "text-sx-ai" : "text-sx-text-subtle"
          }`}
        >
          Beta
        </span>
      </div>
    </div>
  );
}
