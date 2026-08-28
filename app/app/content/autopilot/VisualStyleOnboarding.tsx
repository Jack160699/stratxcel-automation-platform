"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";

interface ArchetypeCatalogEntry {
  id: string;
  name: string;
  description: string;
  bestUseHint: string;
  styleLabel: string;
  allowedForTier: boolean;
}
interface PreferencesResponse {
  tier: string;
  premiumSelectionAvailable: boolean;
  preferredArchetypes: string[];
  onboardingCompleted: boolean;
  catalog: ArchetypeCatalogEntry[];
}

const MAX_SELECTION = 3;

async function fetchPreferences(tenantId: string): Promise<PreferencesResponse> {
  const response = await fetch(`/api/platform/social/autopilot/visual-preferences?tenantId=${encodeURIComponent(tenantId)}`);
  if (!response.ok) throw new Error("Could not load visual style preferences.");
  return response.json();
}

/** One archetype's gallery card -- its preview image is the REAL production
 * renderer's own output (rendered on demand by the archetype-previews
 * API), never a mock. Selecting toggles membership in the parent's
 * ordered pick list, up to MAX_SELECTION; the numbered badge reflects
 * pick order, not archetype order, so users see their own ranking. */
function ArchetypeCard({ entry, rank, onToggle }: { entry: ArchetypeCatalogEntry; rank: number | null; onToggle: () => void }) {
  const selected = rank !== null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`group relative flex flex-col overflow-hidden rounded-sx-md border text-left transition-colors duration-150 ${
        selected ? "border-sx-accent ring-2 ring-sx-accent" : "border-sx-border hover:border-sx-border-strong"
      }`}
    >
      <div className="relative aspect-square w-full bg-sx-surface-2">
        <Image src={`/api/platform/social/autopilot/archetype-previews/${entry.id}`} alt={`${entry.name} preview`} fill unoptimized className="object-cover" />
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-sx-accent text-[12px] font-bold text-sx-accent-on shadow">
            {rank}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-sx-sans text-[13px] font-semibold text-sx-text">{entry.name}</span>
          <StatusChip state="neutral" dot={false} className="shrink-0">{entry.styleLabel}</StatusChip>
        </div>
        <p className="text-[11.5px] text-sx-text-muted">{entry.bestUseHint}</p>
      </div>
    </button>
  );
}

/** Spotify-style "pick your visual taste" onboarding gallery (Subscription-
 * Gated Visual Archetypes brief Section 4/13): select 1-3 archetypes, the
 * automated Growth/Business engine will only ever cycle through these.
 * Reopens with saved state already selected, in saved rank order, so
 * editing later feels like adjusting a choice, not starting over. */
function ArchetypeGallery({ tenantId, catalog, initialSelection, onSaved, onCancel }: { tenantId: string; catalog: ArchetypeCatalogEntry[]; initialSelection: string[]; onSaved: (selected: string[]) => void; onCancel?: () => void }) {
  const [selected, setSelected] = useState<string[]>(initialSelection);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((v) => v !== id);
      if (current.length >= MAX_SELECTION) return current;
      return [...current, id];
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/social/autopilot/visual-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, preferredArchetypes: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save.");
      onSaved(result.preferredArchetypes as string[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save visual style preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-sx-text">Pick your visual style</p>
          <p className="mt-0.5 text-[12px] text-sx-text-muted">Choose 1–3. Your automated posts will rotate only through the styles you pick here.</p>
        </div>
        <StatusChip state={selected.length >= 1 ? "success" : "neutral"}>{selected.length}/{MAX_SELECTION} selected</StatusChip>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {catalog.map((entry) => (
          <ArchetypeCard key={entry.id} entry={entry} rank={selected.includes(entry.id) ? selected.indexOf(entry.id) + 1 : null} onToggle={() => toggle(entry.id)} />
        ))}
      </div>
      {error && <ErrorState message={error} />}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" disabled={saving || selected.length < 1} onClick={() => void save()}>
          {saving ? "Saving…" : "Save visual style"}
        </Button>
      </div>
    </div>
  );
}

/** Compact "your visual style" summary shown once onboarding is complete --
 * the reopened, saved state, not the full gallery, per brief Section 13
 * ("re-open with saved state"). */
function VisualStyleSummary({ selected, catalog, onEdit }: { selected: string[]; catalog: ArchetypeCatalogEntry[]; onEdit: () => void }) {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-sx-text">Your visual style</p>
        <Button size="sm" onClick={onEdit}>Change</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        {selected.map((id) => {
          const entry = byId.get(id);
          return (
            <div key={id} className="flex items-center gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-2 py-1.5 pl-1.5 pr-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-[4px]">
                <Image src={`/api/platform/social/autopilot/archetype-previews/${id}`} alt="" fill unoptimized className="object-cover" />
              </div>
              <span className="text-[12.5px] font-medium text-sx-text">{entry?.name ?? id}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11.5px] text-sx-text-muted">Automated posts rotate through these {selected.length === 1 ? "style" : "styles"} only.</p>
    </div>
  );
}

export function VisualStyleOnboarding({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<PreferencesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    fetchPreferences(tenantId)
      .then((result) => {
        setData(result);
        setError(null);
        setEditing(!result.onboardingCompleted);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load visual style preferences."));
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
      </div>
    );
  }

  // Starter (and any tier without premium selection): a fixed, non-
  // configurable message. No gallery, no picker -- there is nothing to
  // choose here, by design (Section 14).
  if (!data.premiumSelectionAvailable) {
    return <p className="text-[12.5px] text-sx-text-muted">Your automated posts use StratXcel&apos;s Basic Essential visual system.</p>;
  }

  if (editing) {
    return (
      <ArchetypeGallery
        tenantId={tenantId}
        catalog={data.catalog.filter((entry) => entry.allowedForTier)}
        initialSelection={data.preferredArchetypes}
        onSaved={(selected) => {
          setData((current) => (current ? { ...current, preferredArchetypes: selected, onboardingCompleted: true } : current));
          setEditing(false);
        }}
        onCancel={data.onboardingCompleted ? () => setEditing(false) : undefined}
      />
    );
  }

  return <VisualStyleSummary selected={data.preferredArchetypes} catalog={data.catalog} onEdit={() => setEditing(true)} />;
}

export function VisualStyleCard({ tenantId }: { tenantId: string }) {
  return (
    <Card variant="panel">
      <CardHeading>Visual style</CardHeading>
      <div className="mt-3">
        <VisualStyleOnboarding tenantId={tenantId} />
      </div>
    </Card>
  );
}

// Exported for the manual-generation picker, which needs the same tier +
// saved-preference data without re-rendering the gallery UI.
export { fetchPreferences };
export type { PreferencesResponse, ArchetypeCatalogEntry };
