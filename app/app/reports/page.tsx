"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader, ModuleStatusSummary } from "../components/ModulePageHeader";
import { MetricUnavailable } from "../components/MetricUnavailable";
import { ActionUnavailableNotice } from "../components/DisconnectedState";
import { Metric } from "@/components/ui/Metric";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import type { MissionSummary } from "../components/MissionSummaryCard";

const TERMINAL_COMPLETED = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);
const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/**
 * Reports over real data only: missions, approvals, leads, wallet balance.
 * Anything without a real source (ad performance, historical usage/cost
 * ledger, content/social metrics) renders MetricUnavailable — never a
 * fabricated 0 or invented delta. Export and scheduling stay disabled;
 * neither has a backing model yet.
 */
export default function ReportsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [approvalsCount, setApprovalsCount] = useState<number | "forbidden" | null>(null);
  const [leadsCount, setLeadsCount] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<{ cents: number; currency: string } | null>(null);
  const [auditEvents, setAuditEvents] = useState<{ id: string; action: string; target_type: string | null; created_at: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState("30");

  async function load() {
    if (!tenantId) return;
    setError(null);
    const [missionsRes, approvalsRes, leadsRes, walletRes, auditRes] = await Promise.all([
      fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/leads?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/audit?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const missionsBody = await missionsRes.json();
    if (!missionsRes.ok) {
      setError(missionsBody.error ?? `Failed to load report data (HTTP ${missionsRes.status})`);
      return;
    }
    setMissions(missionsBody.missions);

    if (approvalsRes.status === 403) setApprovalsCount("forbidden");
    else {
      const approvalsBody = await approvalsRes.json();
      if (approvalsRes.ok) setApprovalsCount(approvalsBody.approvals.length);
    }

    const leadsBody = await leadsRes.json();
    if (leadsRes.ok) setLeadsCount(leadsBody.leads.length);

    const walletBody = await walletRes.json();
    if (walletRes.ok && walletBody.account) setWalletBalance({ cents: walletBody.account.balance_cents, currency: walletBody.account.currency });

    const auditBody = await auditRes.json();
    if (auditRes.ok) setAuditEvents(auditBody.events);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const rangeFiltered = useMemo(() => {
    if (!missions) return [];
    if (rangeDays === "all") return missions;
    const cutoff = Date.now() - Number(rangeDays) * 24 * 60 * 60 * 1000;
    return missions.filter((m) => new Date(m.created_at).getTime() >= cutoff);
  }, [missions, rangeDays]);

  const completed = rangeFiltered.filter((m) => TERMINAL_COMPLETED.has(m.state));
  const websiteSeo = rangeFiltered.filter((m) => m.service_key === "website_landing_page" || m.service_key === "seo_audit");

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader
        title="Reports"
        tenantName={active?.name}
        description="Real activity for this workspace. Metrics with no data source show as Not available, never a fabricated zero."
        actions={
          <Select value={rangeDays} onChange={(e) => setRangeDays(e.target.value)} className="w-40">
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Executive summary</h2>
        <ModuleStatusSummary>
          <Metric label="Missions" value={missions === null ? "—" : rangeFiltered.length} deltaLabel="in range" />
          <Metric label="Completed" value={missions === null ? "—" : completed.length} deltaLabel="in range" />
          <Metric
            label="Pending approvals"
            value={approvalsCount === "forbidden" ? "—" : approvalsCount ?? "—"}
            deltaLabel={approvalsCount === "forbidden" ? "no access for your role" : "current"}
          />
          <Metric label="Leads" value={leadsCount ?? "—"} deltaLabel="all time" />
        </ModuleStatusSummary>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Mission activity & completed work</h2>
        <p className="text-xs text-sx-text-subtle">
          {missions === null ? "Loading…" : `${rangeFiltered.length} missions in range, ${completed.length} completed.`}
        </p>
        {auditEvents && auditEvents.length > 0 && (
          <Card>
            {auditEvents.slice(0, 10).map((e) => (
              <CardRow key={e.id}>
                <span className="w-40 shrink-0 font-sx-mono text-[10.5px] text-sx-text-subtle">{new Date(e.created_at).toLocaleString()}</span>
                <span className="min-w-0 flex-1 truncate text-sx-text-muted">{e.action}</span>
              </CardRow>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Content and social</h2>
        <MetricUnavailable label="Content and social performance" reason="No customer-owned social reporting source is connected." />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Website and SEO</h2>
        <Metric label="Website / SEO missions" value={websiteSeo.length} deltaLabel="in range" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Leads and CRM</h2>
        <Metric label="Leads received" value={leadsCount ?? "—"} deltaLabel="all time" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Advertising</h2>
        <ModuleStatusSummary>
          <MetricUnavailable label="Ad spend" reason="No ad account connected." />
          <MetricUnavailable label="Ad performance" reason="No ad account connected." />
        </ModuleStatusSummary>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Usage and cost</h2>
        <ModuleStatusSummary>
          <Metric label="Wallet balance" value={walletBalance ? `${walletBalance.currency} ${(walletBalance.cents / 100).toFixed(2)}` : "—"} deltaLabel="current" />
          <MetricUnavailable label="Spend over range" reason="Historical spend reporting is not available yet." />
        </ModuleStatusSummary>
      </section>

      <Card>
        <CardHeading>Export & scheduled reports</CardHeading>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="secondary" size="sm" disabled>
            Export report
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Schedule report
          </Button>
          <ActionUnavailableNotice reason="Export and scheduled delivery are not available yet." />
        </div>
      </Card>
    </div>
  );
}
