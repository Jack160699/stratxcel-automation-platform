"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { fetchPreferences, type ArchetypeCatalogEntry } from "./VisualStyleOnboarding";

interface CandidateRow {
  id: string;
  status: string;
  preview_url?: string | null;
}
interface JobDetail {
  job: { id: string; status: string; creative_treatment: Record<string, unknown> | null; safe_error: string | null };
  candidates: CandidateRow[];
}

/**
 * ₹7,999 (Growth/Business) manual/on-demand Social Autopilot generation
 * (Subscription-Gated Visual Archetypes brief Section 3 Rule C, Section
 * 14): "Choose a visual style" -- picks ONLY from this tenant's own saved
 * preferences (never the full 12), submits requestedArchetype, and shows
 * the SERVER-CONFIRMED final archetype from the completed job's own
 * creative_treatment -- never merely echoing back what the user clicked,
 * since the server is free to reject the request outright.
 *
 * Renders nothing at all for Starter/free (Section 14: "no manual
 * generation tool access at all" -- not a disabled button, an absent
 * one) and prompts to finish the Visual style picker first when this
 * tenant has premium selection but no saved preferences yet, since Rule C
 * would reject every request in that state anyway.
 */
export function ManualArchetypeGeneration({ tenantId }: { tenantId: string }) {
  const [catalog, setCatalog] = useState<ArchetypeCatalogEntry[] | null>(null);
  const [premiumSelectionAvailable, setPremiumSelectionAvailable] = useState<boolean | null>(null);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  const [chosenArchetype, setChosenArchetype] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A transient fetch failure (network blip, momentary auth hiccup) must
  // never be silently reinterpreted as "this tier doesn't have manual
  // generation" -- that conflation was a real bug found live: any failed
  // load permanently hid the whole card with no visible error and no way
  // to recover short of reloading the page. Tracked separately so a real
  // failure shows a real, retriable error instead of quietly vanishing.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const pollRun = useRef(0);

  const loadPreferences = useCallback(() => {
    setLoadError(null);
    fetchPreferences(tenantId)
      .then((result) => {
        setPremiumSelectionAvailable(result.premiumSelectionAvailable);
        setPreferred(result.preferredArchetypes);
        setCatalog(result.catalog);
        setChosenArchetype((current) => current ?? result.preferredArchetypes[0] ?? null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load your visual style preferences."));
  }, [tenantId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const loadDetail = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/platform/image-generations/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Generation could not be loaded");
    setDetail(result as JobDetail);
    return result as JobDetail;
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    const run = ++pollRun.current;
    for (let attempt = 0; attempt < 60 && pollRun.current === run; attempt += 1) {
      const next = await loadDetail(jobId);
      if (next.job.status === "READY" || next.job.status === "FAILED") {
        setBusy(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (pollRun.current === run) setBusy(false);
  }, [loadDetail]);

  const generate = async () => {
    setError(null);
    if (!brief.trim()) return setError("Describe what this post should be about.");
    if (!chosenArchetype) return setError("Choose a visual style.");
    setBusy(true);
    setDetail(null);
    try {
      const response = await fetch("/api/platform/social/autopilot/manual-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, requestedArchetype: chosenArchetype }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Generation could not be started");
      await loadDetail(result.job.id);
      if (result.job.status !== "READY" && result.job.status !== "FAILED") {
        void pollJob(result.job.id);
      } else {
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation could not be started");
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Card variant="panel">
        <CardHeading>Manual generation</CardHeading>
        <div className="mt-3">
          <ErrorState message={loadError} onRetry={loadPreferences} />
        </div>
      </Card>
    );
  }
  if (premiumSelectionAvailable === null) return null; // still loading -- render nothing rather than a flash of the wrong state
  if (!premiumSelectionAvailable) return null; // Starter/free: no manual generation surface at all

  if (preferred.length === 0) {
    return (
      <Card variant="panel">
        <CardHeading>Manual generation</CardHeading>
        <div className="mt-3">
          <EmptyState title="Choose your visual styles first" subtitle="Manual generation only offers the visual styles you've saved above." />
        </div>
      </Card>
    );
  }

  const byId = new Map((catalog ?? []).map((entry) => [entry.id, entry]));
  const finalArchetype = detail?.job.creative_treatment && typeof detail.job.creative_treatment.layoutArchetype === "string" ? detail.job.creative_treatment.layoutArchetype : null;
  const readyCandidate = detail?.candidates.find((c) => c.preview_url);

  return (
    <Card variant="panel">
      <CardHeading>Manual generation</CardHeading>
      <p className="mt-1 text-[12px] text-sx-text-muted">Generate one post on demand, choosing exactly which of your saved visual styles to use.</p>
      <div className="mt-3 flex flex-col gap-3">
        <textarea
          className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2 text-sm text-sx-text"
          rows={3}
          placeholder="What should this post be about?"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {preferred.map((id) => {
            const entry = byId.get(id);
            const selected = chosenArchetype === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setChosenArchetype(id)}
                className={`flex items-center gap-2 rounded-sx-sm border py-1 pl-1 pr-3 transition-colors duration-150 ${selected ? "border-sx-accent ring-2 ring-sx-accent" : "border-sx-border hover:border-sx-border-strong"}`}
              >
                <div className="relative h-8 w-8 overflow-hidden rounded-[4px]">
                  <Image src={`/api/platform/social/autopilot/archetype-previews/${id}`} alt="" fill unoptimized className="object-cover" />
                </div>
                <span className="text-[12px] font-medium text-sx-text">{entry?.name ?? id}</span>
              </button>
            );
          })}
        </div>
        {error && <ErrorState message={error} />}
        <div>
          <Button variant="primary" disabled={busy} onClick={() => void generate()}>
            {busy ? "Generating…" : "Generate post"}
          </Button>
        </div>
        {detail && (
          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <StatusChip state={detail.job.status === "READY" ? "success" : detail.job.status === "FAILED" ? "danger" : "accent"}>{detail.job.status}</StatusChip>
              {finalArchetype && <span className="text-[11.5px] text-sx-text-muted">Style used: <span className="font-medium text-sx-text">{byId.get(finalArchetype)?.name ?? finalArchetype}</span></span>}
            </div>
            {detail.job.status === "FAILED" && detail.job.safe_error && <p className="mt-2 text-[12px] text-[#FF8A90]">{detail.job.safe_error}</p>}
            {readyCandidate?.preview_url && (
              <div className="relative mt-3 aspect-square w-full max-w-[280px] overflow-hidden rounded-sx-sm">
                <Image src={readyCandidate.preview_url} alt="Generated post" fill unoptimized className="object-cover" />
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
