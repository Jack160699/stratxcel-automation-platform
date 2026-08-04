"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { RuntimeStatus } from "../components/RuntimeStatus";
import { ActionUnavailableNotice } from "../components/DisconnectedState";
import { MissionSummaryCard, type MissionSummary } from "../components/MissionSummaryCard";
import { ApprovalSummary, type ApprovalSummaryItem } from "../components/ApprovalSummary";
import { ArtifactCard, type ArtifactSummary } from "../components/ArtifactCard";
import { EmptyModuleState } from "../components/EmptyModuleState";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";

interface BrandBrainSummary {
  business_name?: string;
  industry?: string;
  tone_of_voice?: string;
  [key: string]: unknown;
}

const TEMPLATES = [
  "Create a website",
  "Audit my SEO",
  "Plan this month's content",
  "Research competitors",
  "Prepare a proposal",
  "Analyse leads",
  "Build an advertising plan",
  "Create a report",
];

const NON_TERMINAL_STATES = new Set(["DRAFT", "ESTIMATING", "AWAITING_FUNDS", "READY", "QUEUED", "RUNNING", "AWAITING_INPUT", "AWAITING_APPROVAL", "HUMAN_HANDOFF", "RESUMED"]);

/**
 * Client-facing mission composer over the same real, tenant-scoped mission
 * API the Missions page uses (createAndEstimateMission via
 * POST /api/platform/missions) — no separate Copilot backend. Templates
 * only pre-fill the goal text; the real service match and cost estimate
 * come back from the server after submission, never guessed client-side.
 * Hermes execution itself is not connected in this build phase, so
 * whatever mission state the API returns (including QUEUED/RUNNING) is
 * shown as-is — this page never overrides or fabricates a "running" state.
 */
export default function CopilotPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [goalText, setGoalText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<MissionSummary | null>(null);

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [missionsError, setMissionsError] = useState<string | null>(null);

  const [approvals, setApprovals] = useState<ApprovalSummaryItem[] | null | "forbidden">(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null | "unavailable">(null);
  const [brand, setBrand] = useState<BrandBrainSummary | null | "unavailable">(null);

  async function loadMissions() {
    if (!tenantId) return;
    setMissionsError(null);
    const res = await fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setMissionsError(body.error ?? `Failed to load missions (HTTP ${res.status})`);
      return;
    }
    setMissions(body.missions);
  }

  async function loadApprovals() {
    if (!tenantId) return;
    const res = await fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`);
    if (res.status === 403) {
      setApprovals("forbidden");
      return;
    }
    const body = await res.json();
    if (!res.ok) return;
    setApprovals(body.approvals);
  }

  async function loadArtifacts() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/platform/artifacts?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) {
        setArtifacts("unavailable");
        return;
      }
      const body = await res.json();
      setArtifacts(body.artifacts);
    } catch {
      setArtifacts("unavailable");
    }
  }

  async function loadBrand() {
    if (!tenantId) return;
    const res = await fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`);
    if (!res.ok) {
      setBrand("unavailable");
      return;
    }
    const body = await res.json();
    setBrand(body.brandBrain?.content ?? null);
  }

  useEffect(() => {
    loadMissions();
    loadApprovals();
    loadArtifacts();
    loadBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !goalText.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText: goalText.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? `Failed to create mission (HTTP ${res.status})`);
        return;
      }
      setLastCreated(body.mission);
      setGoalText("");
      await loadMissions();
    } finally {
      setSubmitting(false);
    }
  }

  const activeMission = (missions ?? []).find((m) => NON_TERMINAL_STATES.has(m.state)) ?? null;
  const recentMissions = (missions ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader
        title="Copilot"
        tenantName={active?.name}
        description="Tell Stratxcel what you need. It compiles your request into a mission with a real cost estimate before anything runs."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <CardHeading>New mission</CardHeading>

            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setGoalText(t)}
                  className="rounded-sx-pill border border-sx-border-strong bg-sx-surface-2 px-2.5 py-1 text-[11.5px] text-sx-text-muted transition-colors hover:bg-sx-elevated hover:text-sx-text"
                >
                  {t}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                required
                placeholder="Describe what you want done — e.g. Run an Instagram campaign for our spring sale"
                className="min-h-[110px]"
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled
                    aria-label="Attach a file"
                    title="Attachments require a connected storage provider"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-3 text-sx-text-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    📎
                  </button>
                  <ActionUnavailableNotice reason="Attachments require a connected storage provider — not available in this environment yet." />
                </div>
                <Button type="submit" variant="primary" disabled={submitting || !tenantId}>
                  {submitting ? "Compiling…" : "Send to Copilot"}
                </Button>
              </div>
              {submitError && <ErrorState message={submitError} />}
            </form>

            {lastCreated && (
              <Card variant="ai" className="flex flex-col gap-1">
                <p className="text-[13px] text-sx-text">Mission compiled: {lastCreated.service_key ?? "unmatched — routed for scoping"}</p>
                <p className="text-xs text-sx-text-muted">
                  {lastCreated.estimated_cost_cents != null ? `Estimated cost: ₹${(lastCreated.estimated_cost_cents / 100).toFixed(2)}` : "Cost estimate not available."}{" "}
                  · State: {lastCreated.state}
                </p>
              </Card>
            )}
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Active mission</h2>
            {missionsError && <ErrorState message={missionsError} onRetry={loadMissions} />}
            {tenantId && missions === null && !missionsError && <p className="text-sm text-sx-text-subtle">Loading…</p>}
            {missions && !activeMission && <EmptyModuleState resource="active missions" subtitle="Missions you start will show up here while they're in progress." />}
            {activeMission && <MissionSummaryCard mission={activeMission} href={`/app/missions/${activeMission.id}`} />}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Recent missions</h2>
            {missions && missions.length === 0 && <EmptyModuleState resource="missions" subtitle="Start one above, or from the Missions page." />}
            {recentMissions.length > 0 && (
              <div className="flex flex-col gap-2">
                {recentMissions.map((m) => (
                  <MissionSummaryCard key={m.id} mission={m} href={`/app/missions/${m.id}`} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <RuntimeStatus />

          <Card>
            <CardHeading>Business context</CardHeading>
            {brand === null && <p className="mt-2 text-xs text-sx-text-subtle">Loading…</p>}
            {brand === "unavailable" && <p className="mt-2 text-xs text-sx-text-subtle">Not available.</p>}
            {brand && brand !== "unavailable" && (
              <div className="mt-2 flex flex-col gap-1 text-xs text-sx-text-muted">
                <p>{brand.business_name || "No business name set."}</p>
                <p>{brand.industry || "No industry set."}</p>
                <a href="/app/brand" className="mt-1 text-sx-accent hover:underline">
                  Edit Brand Brain →
                </a>
              </div>
            )}
          </Card>

          <Card>
            <CardHeading>Pending approvals</CardHeading>
            {approvals === "forbidden" && <p className="mt-2 text-xs text-sx-text-subtle">No access for your role.</p>}
            {approvals && approvals !== "forbidden" && approvals.length === 0 && <p className="mt-2 text-xs text-sx-text-subtle">Nothing pending.</p>}
            {approvals && approvals !== "forbidden" && approvals.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {approvals.slice(0, 3).map((a) => (
                  <ApprovalSummary key={a.id} approval={a} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeading>Latest artifacts</CardHeading>
            {artifacts === "unavailable" && <p className="mt-2 text-xs text-sx-text-subtle">Not available.</p>}
            {artifacts && artifacts !== "unavailable" && artifacts.length === 0 && <p className="mt-2 text-xs text-sx-text-subtle">No artifacts yet.</p>}
            {artifacts && artifacts !== "unavailable" && artifacts.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {artifacts.slice(0, 3).map((a) => (
                  <ArtifactCard key={a.id} artifact={a} />
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
