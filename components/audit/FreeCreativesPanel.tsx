"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Final Customer Experience Repair mission, Section 2 (Three Free Branded
 * Creatives). Shown on the audit report (right after the score-first
 * summary) and reused inside Content ("My Free Content") -- one real,
 * shared surface, not two. Backed entirely by /api/platform/audit/
 * free-creatives, which reuses Creative Studio's own canonical generation
 * pipeline (see lib/audit/free-creatives.ts's own header comment) -- this
 * component only ever displays real job state, never a fabricated
 * "success" while a job is still QUEUED/RUNNING.
 */

interface FreeCreativeCard {
  jobId: string;
  status: string;
  brief: string;
  previewUrl: string | null;
  createdAt: string;
}

type PanelState = "loading" | "idle" | "generating" | "ready" | "error";

export function FreeCreativesPanel({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PanelState>("loading");
  const [cards, setCards] = useState<FreeCreativeCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/audit/free-creatives", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not load your free creatives.");
        setState("error");
        return;
      }
      const jobs: FreeCreativeCard[] = body.jobs ?? [];
      setCards(jobs);
      if (jobs.length === 0) {
        setState("idle");
      } else if (jobs.every((j) => j.status === "READY" || j.status === "FAILED")) {
        setState("ready");
      } else {
        setState("generating");
      }
    } catch {
      setError("Network error — please try again.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    // react-hooks/set-state-in-effect: real fetch-on-mount data loading
    // (this panel's whole state comes from the server, never invented
    // client-side), same documented pattern as app/app/settings/page.tsx
    // and app/app/website/create/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Poll only while genuinely in-flight -- never while idle or fully done.
  useEffect(() => {
    if (state !== "generating") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => void load(), 4_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, load]);

  async function startGeneration() {
    setState("generating");
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/free-creatives", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not start your free creatives.");
        setState("error");
        return;
      }
      await load();
    } catch {
      setError("Network error — please try again.");
      setState("error");
    }
  }

  if (state === "loading") return null;

  return (
    <div className={`rounded-[1.25rem] border border-sx-border bg-sx-surface-1 ${compact ? "p-4" : "p-5 sm:p-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-sx-accent">Free demonstration</p>
          <h3 className="mt-0.5 font-sx-sans text-lg font-bold text-sx-text">3 free branded creatives for your business</h3>
        </div>
      </div>

      {state === "idle" && (
        <div className="mt-3">
          <p className="text-xs text-sx-text-muted">
            See what StratXcel can create for your business — using your real name, services, and brand — before you connect or pay anything.
          </p>
          <button
            type="button"
            onClick={() => void startGeneration()}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] transition-colors"
          >
            Generate my 3 free creatives →
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-sx-danger">{error}</p>}

      {(state === "generating" || state === "ready") && cards.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <div key={card.jobId} className="flex flex-col overflow-hidden rounded-sx-md border border-sx-border bg-sx-surface-2/40">
              <div className="flex aspect-square items-center justify-center bg-sx-surface-2">
                {card.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a real Supabase Storage URL, no benefit from next/image here
                  <img src={card.previewUrl} alt="Generated creative preview" className="h-full w-full object-cover" />
                ) : card.status === "FAILED" ? (
                  <span className="px-3 text-center text-xs text-sx-danger">Couldn&apos;t generate this one — try again from Content.</span>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-xs text-sx-text-subtle">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-sx-border-strong border-t-sx-accent" />
                    Generating…
                  </div>
                )}
              </div>
              {card.previewUrl && (
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <a
                    href={card.previewUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-sx-accent hover:underline"
                  >
                    Download
                  </a>
                  <Link href="/app/integrations" className="text-[11px] font-semibold text-sx-text-muted hover:text-sx-text">
                    Connect &amp; auto-post →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {state === "ready" && (
        <p className="mt-3 text-[11px] text-sx-text-subtle">
          Want more like this? <Link href="/app/content" className="font-semibold text-sx-accent hover:underline">See it in Content →</Link>
        </p>
      )}
    </div>
  );
}
