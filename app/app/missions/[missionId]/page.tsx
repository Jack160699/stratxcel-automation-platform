"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { MISSION_STATE_CHIP, type Mission } from "../page";
import type { MissionEventRow } from "@stratxcel/missions";

/**
 * No dedicated single-mission GET route exists yet — reuses the same
 * tenant-scoped list endpoint as /app/missions and filters client-side,
 * rather than adding a new API surface for one field of that list.
 * Events reuse /api/platform/missions/[missionId]/events unchanged.
 */
export default function MissionDetailPage() {
  const params = useParams<{ missionId: string }>();
  const missionId = params.missionId;
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [mission, setMission] = useState<Mission | null | undefined>(undefined);
  const [events, setEvents] = useState<MissionEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setError(null);
    setMission(undefined);
    setEvents(null);

    const [missionsRes, eventsRes] = await Promise.all([
      fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/missions/${missionId}/events?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const missionsBody = await missionsRes.json();
    if (!missionsRes.ok) {
      setError(missionsBody.error ?? `Failed to load mission (HTTP ${missionsRes.status})`);
      return;
    }
    const found: Mission | null = (missionsBody.missions as Mission[]).find((m) => m.id === missionId) ?? null;
    setMission(found);

    const eventsBody = await eventsRes.json();
    if (!eventsRes.ok) {
      setError(eventsBody.error ?? `Failed to load mission events (HTTP ${eventsRes.status})`);
      return;
    }
    setEvents(eventsBody.events);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, missionId]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/app/missions" className="text-xs text-sx-text-muted hover:text-sx-text">
          ← Missions
        </Link>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Mission</h1>
      </header>

      {error && <ErrorState message={error} />}

      {mission === undefined && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
      {mission === null && !error && <EmptyState title="Mission not found." subtitle="It may belong to a different workspace or no longer exist." />}

      {mission && (
        <Card>
          <CardHeading>{mission.goal_text}</CardHeading>
          <CardRow>
            <span className="text-sx-text-muted">State</span>
            {(() => {
              const chip = MISSION_STATE_CHIP[mission.state] ?? { label: mission.state, state: "neutral" as const };
              return (
                <StatusChip state={chip.state} pulse={chip.state === "ai"}>
                  {chip.label}
                </StatusChip>
              );
            })()}
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Service</span>
            <span>{mission.service_key ?? "—"}</span>
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Estimated cost</span>
            <span>{mission.estimated_cost_cents != null ? `₹${(mission.estimated_cost_cents / 100).toFixed(2)}` : "—"}</span>
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Created</span>
            <span>{new Date(mission.created_at).toLocaleString()}</span>
          </CardRow>
        </Card>
      )}

      {mission && (
        <section className="flex flex-col gap-3">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">Timeline</h2>
          {events === null && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
          {events?.length === 0 && <EmptyState title="No events yet." />}
          {events && events.length > 0 && (
            <Card>
              {events.map((e) => (
                <CardRow key={e.id} className="items-start">
                  <span className="w-40 shrink-0 font-sx-mono text-[11px] text-sx-text-muted">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="text-sx-text">{e.event_type}</span>
                </CardRow>
              ))}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
