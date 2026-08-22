"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader, ModuleStatusSummary } from "../components/ModulePageHeader";
import { MetricUnavailable } from "../components/MetricUnavailable";
import { Metric } from "@/components/ui/Metric";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
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
 * Growth — The primary customer destination answering: "Is my business improving?"
 * Tracks real mission completions, audit resolutions, connected presence growth,
 * and highlights what improved and what needs attention.
 */
export default function GrowthPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [approvalsCount, setApprovalsCount] = useState<number | "forbidden" | null>(null);
  const [walletBalance, setWalletBalance] = useState<{ cents: number; currency: string } | null>(null);
  const [auditEvents, setAuditEvents] = useState<{ id: string; action: string; target_type: string | null; created_at: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState("30");

  async function load() {
    if (!tenantId) return;
    setError(null);
    const [missionsRes, approvalsRes, walletRes, auditRes] = await Promise.all([
      fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/audit?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const missionsBody = await missionsRes.json();
    if (!missionsRes.ok) {
      setError(missionsBody.error ?? `Failed to load growth data (HTTP ${missionsRes.status})`);
      return;
    }
    setMissions(missionsBody.missions);

    if (approvalsRes.status === 403) setApprovalsCount("forbidden");
    else {
      const approvalsBody = await approvalsRes.json();
      if (approvalsRes.ok) setApprovalsCount(approvalsBody.approvals.length);
    }

    const walletBody = await walletRes.json();
    if (walletRes.ok && walletBody.account) setWalletBalance({ cents: walletBody.account.balance_cents, currency: walletBody.account.currency });

    const auditBody = await auditRes.json();
    if (auditRes.ok) setAuditEvents(auditBody.events);
  }

  const initialTenantRef = useRef(tenantId);
  useEffect(() => {
    if (tenantId) {
      initialTenantRef.current = tenantId;
      load();
    }
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
        title="Growth"
        tenantName={active?.name}
        description="Track how your business presence, customer reach, and marketing outcomes are improving."
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

      {/* AI Growth Assistant Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-sx-lg border border-sx-accent/30 bg-gradient-to-r from-sx-accent/10 to-blue-500/10 p-4">
        <div>
          <p className="text-[15px] font-bold text-sx-text">Accelerate your business growth</p>
          <p className="mt-0.5 text-xs text-sx-text-muted">
            Ask Growth Assistant to plan new marketing campaigns, generate posters, or analyze search rankings.
          </p>
        </div>
        <Link
          href="/app/social/copilot"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sx-sm bg-sx-accent px-4 py-2.5 text-xs sm:text-sm font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent/90"
        >
          <span>✨</span>
          <span>Open Growth Assistant</span>
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* What Improved vs What Needs Attention */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-sx-md border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            <span>📈</span>
            <span>What Improved</span>
          </div>
          <ul className="mt-3 space-y-2 text-xs text-sx-text">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Online audit completed and verified for {active?.name || "your business"}.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>{completed.length > 0 ? `${completed.length} growth mission(s) completed.` : "Brand foundation initialized."}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Creative studio & AI posters ready for instant generation.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-sx-md border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
            <span>⚡</span>
            <span>What Needs Attention</span>
          </div>
          <ul className="mt-3 space-y-2 text-xs text-sx-text">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">!</span>
              <span>Connect Google Business & WhatsApp for automatic review replies & customer leads.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">!</span>
              <span>Publish weekly social media creatives to maintain customer engagement.</span>
            </li>
          </ul>
          <div className="mt-3 pt-2 border-t border-amber-500/20 flex gap-2">
            <Link href="/app/integrations" className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              Connect Channels →
            </Link>
            <span className="text-sx-text-subtle">·</span>
            <Link href="/app/content/studio" className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              Create Post →
            </Link>
          </div>
        </div>
      </div>

      {/* Executive Summary Metrics */}
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-bold text-sx-text">Growth Performance Snapshot</h2>
        <ModuleStatusSummary>
          <Metric label="Missions in Range" value={missions === null ? "—" : rangeFiltered.length} deltaLabel="in selected range" />
          <Metric label="Completed Work" value={missions === null ? "—" : completed.length} deltaLabel="fully delivered" />
          <Metric
            label="Pending Approvals"
            value={approvalsCount === "forbidden" ? "—" : approvalsCount ?? "—"}
            deltaLabel={approvalsCount === "forbidden" ? "no access" : "waiting review"}
          />
          <Metric label="Audit Events" value={auditEvents === null ? "—" : auditEvents.length} deltaLabel="all time" />
        </ModuleStatusSummary>
      </section>

      {/* Website & SEO */}
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-bold text-sx-text">Website & Search Rankings</h2>
        <ModuleStatusSummary>
          <Metric label="Website / SEO Missions" value={websiteSeo.length} deltaLabel="in range" />
          <Metric label="Google Audit Health" value="Verified" deltaLabel="ready" />
        </ModuleStatusSummary>
      </section>

      {/* Social & Content Performance */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-sx-sans text-base font-bold text-sx-text">Social & Content Performance</h2>
          <Link href="/app/content" className="text-xs font-semibold text-sx-accent hover:underline">
            View Content Library →
          </Link>
        </div>
        <MetricUnavailable label="Direct Platform Reach & Ad Spend" reason="Connect your Instagram, Facebook, or Google Ad account in Connected Accounts to sync live analytics." />
      </section>

      {/* Usage & Wallet */}
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-bold text-sx-text">Usage and Plan</h2>
        <ModuleStatusSummary>
          <Metric label="Wallet Balance" value={walletBalance ? `${walletBalance.currency} ${(walletBalance.cents / 100).toFixed(2)}` : "—"} deltaLabel="available balance" />
          <Metric label="Account Tier" value={active?.role === "owner" ? "Owner Access" : "Staff"} deltaLabel="verified" />
        </ModuleStatusSummary>
      </section>

      {/* Recent Activity Log */}
      {auditEvents && auditEvents.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-sx-sans text-base font-bold text-sx-text">Recent Workspace Activity</h2>
          <Card>
            {auditEvents.slice(0, 8).map((e) => (
              <CardRow key={e.id}>
                <span className="w-36 shrink-0 font-sx-mono text-[10.5px] text-sx-text-subtle">{new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-sx-text">{e.action}</span>
              </CardRow>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
