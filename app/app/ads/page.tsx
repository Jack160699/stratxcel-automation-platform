"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader, ModuleStatusSummary } from "../components/ModulePageHeader";
import { IntegrationStatus } from "../components/IntegrationStatus";
import { MetricUnavailable } from "../components/MetricUnavailable";
import { MissionSummaryCard, type MissionSummary } from "../components/MissionSummaryCard";
import { ApprovalSummary, type ApprovalSummaryItem } from "../components/ApprovalSummary";
import { ArtifactCard, type ArtifactSummary } from "../components/ArtifactCard";
import { EmptyModuleState } from "../components/EmptyModuleState";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";

const AD_KEYWORDS = ["ad", "campaign", "advertis"];

/**
 * Ads is a pure planning surface: no ad account is ever connected here, no
 * spend is ever real, and nothing marked "active" without genuine backend
 * data. Campaign-planning requests are real missions (filtered by keyword,
 * since the service catalogue has no dedicated ads entry yet — an
 * unmatched goal routes to custom_mission honestly rather than being
 * mis-labelled).
 */
export default function AdsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalSummaryItem[] | null | "forbidden">(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null | "unavailable">(null);
  const [starting, setStarting] = useState(false);

  async function loadMissions() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load missions (HTTP ${res.status})`);
      return;
    }
    setMissions(body.missions);
  }

  async function loadApprovals() {
    if (!tenantId) return;
    const res = await fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`);
    if (res.status === 403) return setApprovals("forbidden");
    const body = await res.json();
    if (res.ok) setApprovals(body.approvals);
  }

  async function loadArtifacts() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/platform/artifacts?tenantId=${encodeURIComponent(tenantId)}&folderCategory=campaigns`);
      if (!res.ok) return setArtifacts("unavailable");
      const body = await res.json();
      setArtifacts(body.artifacts);
    } catch {
      setArtifacts("unavailable");
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    void Promise.all([loadMissions(), loadApprovals(), loadArtifacts()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function startCampaignPlanning() {
    if (!tenantId) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText: "Build an advertising plan" }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to create mission (HTTP ${res.status})`);
        return;
      }
      await loadMissions();
    } finally {
      setStarting(false);
    }
  }

  const adMissions = (missions ?? []).filter((m) => AD_KEYWORDS.some((k) => m.goal_text.toLowerCase().includes(k)));

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader
        title="Ads"
        tenantName={active?.name}
        description="Planning only — no ad account is connected, nothing here spends real money, and every publish/spend action requires approval."
        actions={
          <Button variant="primary" size="sm" onClick={startCampaignPlanning} disabled={starting || !tenantId}>
            {starting ? "Starting…" : "Start campaign-planning mission"}
          </Button>
        }
      />

      {error && <ErrorState message={error} onRetry={loadMissions} />}

      <Card variant="alert">
        <CardHeading>Spend safety</CardHeading>
        <p className="mt-1 text-xs text-sx-text-muted">
          No advertising account is connected in this environment, so no spend can occur. Even once accounts are connected, budget commitment and
          publishing will always require an explicit approval — never automatic.
        </p>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2">
        <IntegrationStatus name="Meta Ads account" state="disconnected" detail="Not connected." />
        <IntegrationStatus name="Google Ads account" state="disconnected" detail="Not connected." />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Performance</h2>
        <ModuleStatusSummary>
          <MetricUnavailable label="Impressions" reason="No ad account connected." />
          <MetricUnavailable label="Clicks" reason="No ad account connected." />
          <MetricUnavailable label="Spend" reason="No ad account connected." />
          <MetricUnavailable label="Conversions" reason="No ad account connected." />
        </ModuleStatusSummary>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Campaign-planning requests</h2>
        {tenantId && missions === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {missions && adMissions.length === 0 && <EmptyModuleState resource="campaign-planning requests" subtitle="Start one above." />}
        {adMissions.length > 0 && (
          <div className="flex flex-col gap-2">
            {adMissions.map((m) => (
              <MissionSummaryCard key={m.id} mission={m} href={`/app/missions/${m.id}`} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">Audience proposals</h2>
          <EmptyModuleState resource="audience proposals" subtitle="Structured audience proposals aren't produced yet — they'll appear as mission artifacts once available." />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">Budget proposals</h2>
          <EmptyModuleState resource="budget proposals" subtitle="Structured budget proposals aren't produced yet — they'll appear as mission artifacts once available." />
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Creative artifacts</h2>
        {artifacts === "unavailable" && <EmptyModuleState resource="creative artifacts" subtitle="Not available in this environment." />}
        {artifacts && artifacts !== "unavailable" && artifacts.length === 0 && <EmptyModuleState resource="creative artifacts" />}
        {artifacts && artifacts !== "unavailable" && artifacts.length > 0 && (
          <div className="flex flex-col gap-2">
            {artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Approvals required</h2>
        {approvals === "forbidden" && <p className="text-xs text-sx-text-subtle">No access for your role.</p>}
        {approvals && approvals !== "forbidden" && approvals.length === 0 && <EmptyModuleState resource="pending approvals" />}
        {approvals && approvals !== "forbidden" && approvals.length > 0 && (
          <div className="flex flex-col gap-2">
            {approvals.map((a) => (
              <ApprovalSummary key={a.id} approval={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
