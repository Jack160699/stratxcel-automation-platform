"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { DisconnectedState, ActionUnavailableNotice } from "../components/DisconnectedState";
import { IntegrationStatus } from "../components/IntegrationStatus";
import { MissionSummaryCard, type MissionSummary } from "../components/MissionSummaryCard";
import { ApprovalSummary, type ApprovalSummaryItem } from "../components/ApprovalSummary";
import { ArtifactCard, type ArtifactSummary } from "../components/ArtifactCard";
import { EmptyModuleState } from "../components/EmptyModuleState";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";

const WEBSITE_SERVICE_KEYS = new Set(["website_landing_page"]);
const SEO_SERVICE_KEYS = new Set(["seo_audit"]);

/**
 * Website & SEO is a specialized view over the same real missions/approvals/
 * artifacts data every other module reads — genuinely new capability
 * (no Vercel/GitHub/Search Console connection exists yet, per
 * CLIENT_APP_INFORMATION_ARCHITECTURE.md §5), so domain/deployment state is
 * always shown as honestly disconnected rather than fabricated.
 */
export default function WebsitePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalSummaryItem[] | null | "forbidden">(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null | "unavailable">(null);
  const [changeText, setChangeText] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

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
      const res = await fetch(`/api/platform/artifacts?tenantId=${encodeURIComponent(tenantId)}&folderCategory=website`);
      if (!res.ok) return setArtifacts("unavailable");
      const body = await res.json();
      setArtifacts(body.artifacts);
    } catch {
      setArtifacts("unavailable");
    }
  }

  useEffect(() => {
    loadMissions();
    loadApprovals();
    loadArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function startMission(goalText: string, key: string) {
    if (!tenantId) return;
    setSubmitting(key);
    setError(null);
    try {
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to create mission (HTTP ${res.status})`);
        return;
      }
      setChangeText("");
      await loadMissions();
    } finally {
      setSubmitting(null);
    }
  }

  const websiteMissions = (missions ?? []).filter((m) => WEBSITE_SERVICE_KEYS.has(m.service_key ?? ""));
  const seoMissions = (missions ?? []).filter((m) => SEO_SERVICE_KEYS.has(m.service_key ?? ""));
  const currentProject = websiteMissions[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader
        title="Website & SEO"
        tenantName={active?.name}
        description="Requests here compile into real missions. Deployment stays in Preview until you approve production."
        actions={
          <Button variant="primary" size="sm" onClick={() => startMission("Create a website", "create")} disabled={submitting !== null || !tenantId}>
            {submitting === "create" ? "Starting…" : "Start website mission"}
          </Button>
        }
      />

      {error && <ErrorState message={error} onRetry={loadMissions} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Current website</h2>
        {tenantId && missions === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {missions && !currentProject && <EmptyModuleState resource="website project" subtitle="Start one above to begin." />}
        {currentProject && <MissionSummaryCard mission={currentProject} href={`/app/missions/${currentProject.id}`} />}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <IntegrationStatus name="Domain" state="disconnected" detail="No domain connected yet." />
        <IntegrationStatus name="Website publishing" state="not_supported" detail="Publishing is not connected for this workspace yet." />
      </section>

      <DisconnectedState
        title="Preview deployments"
        reason="A live preview will appear after website publishing is connected."
        cta={<ActionUnavailableNotice reason="Preview creation is not available for this workspace yet." />}
      />

      <Card variant="alert">
        <CardHeading>Production promotion requires approval</CardHeading>
        <p className="mt-1 text-xs text-sx-text-muted">
          Publishing a website always requires your explicit approval and is not available for this workspace yet.
        </p>
      </Card>

      <Card>
        <CardHeading>Request a website change</CardHeading>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (changeText.trim()) startMission(changeText.trim(), "change");
          }}
          className="mt-2 flex flex-col gap-3 sm:flex-row"
        >
          <Input value={changeText} onChange={(e) => setChangeText(e.target.value)} placeholder="e.g. Update the homepage hero copy" className="flex-1" />
          <Button type="submit" disabled={submitting !== null || !tenantId || !changeText.trim()}>
            {submitting === "change" ? "Sending…" : "Request change"}
          </Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">SEO findings & recent audits</h2>
          <Button variant="secondary" size="sm" onClick={() => startMission("Audit my SEO", "seo")} disabled={submitting !== null || !tenantId}>
            {submitting === "seo" ? "Starting…" : "Request SEO audit"}
          </Button>
        </div>
        {missions && seoMissions.length === 0 && <EmptyModuleState resource="SEO audits" subtitle="Recommended actions appear here once an audit mission completes." />}
        {seoMissions.length > 0 && (
          <div className="flex flex-col gap-2">
            {seoMissions.map((m) => (
              <MissionSummaryCard key={m.id} mission={m} href={`/app/missions/${m.id}`} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Website artifacts</h2>
        {artifacts === "unavailable" && <EmptyModuleState resource="website artifacts" subtitle="Not available in this environment." />}
        {artifacts && artifacts !== "unavailable" && artifacts.length === 0 && <EmptyModuleState resource="website artifacts" />}
        {artifacts && artifacts !== "unavailable" && artifacts.length > 0 && (
          <div className="flex flex-col gap-2">
            {artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Pending approvals</h2>
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
