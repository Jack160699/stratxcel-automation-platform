"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { SearchGrowthDashboardView } from "@/components/search-growth/SearchGrowthDashboardView";
import { SimpleGrowthSummary } from "@/components/search-growth/SimpleGrowthSummary";
import type { SearchGrowthDashboardData } from "@stratxcel/search-discovery";
import { ErrorState } from "@/components/ui/Feedback";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EntitlementGate } from "@/components/ui/EntitlementGate";

/**
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: two
 * real implementations of this page existed -- this simpler tab-based one
 * (calling /api/platform/search + /api/platform/search/run) and
 * SearchGrowthDashboardView (backed by the more mature
 * dashboard/aggregator.ts, surfacing real strategy mode, competitor
 * intelligence, AI-search visibility, and the real readiness
 * certification this session hardened) -- with no caller ever rendering
 * the richer one.
 *
 * Decision, made per the requested priority (existing mature
 * implementation > lowest friction > lowest operational complexity):
 * SearchGrowthDashboardView is canonical, wired in here.
 *
 * Update 14 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): this route
 * was previously unreachable -- layout.tsx rendered `NotV1CustomerRoute`,
 * an unconditional redirect gating it as an "unfinished engineering
 * surface." Root-caused what was actually unfinished: 13 real fabrication
 * defects in SearchGrowthDashboardView.tsx (fake AI-visibility numbers, a
 * date ternary that always said "in 2 days", fabricated competitor
 * claims). Fixed and covered by
 * components/search-growth/__tests__/no-fabrication.test.ts; the gate is
 * now lifted in layout.tsx, with real auth/tenant/entitlement protection
 * unchanged (app/app/layout.tsx + the EntitlementGate below). Authenticated
 * UI rendering could not be visually verified in the environment this
 * change was made in (no viable automated-login path existed) -- if this
 * page looks visually inconsistent with the rest of the live app, that is
 * the one remaining open item, not a functional/data-honesty one.
 */
export default function SearchPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [data, setData] = useState<SearchGrowthDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState("");
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [analyzeState, setAnalyzeState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [analyzeErrorMessage, setAnalyzeErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"simple" | "detailed">("simple");
  const [viewModeSaving, setViewModeSaving] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/platform/search/dashboard?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "SEARCH_DASHBOARD_FAILED");
        return;
      }
      setData(body as SearchGrowthDashboardData);
    } catch {
      setError("SEARCH_DASHBOARD_NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Update 17 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): a tenant
  // who already connected Google Search Console but never ran a Search
  // Growth analysis was always shown an empty website field, even though
  // the platform genuinely already knows their website. Pre-fill from the
  // real, already-connected source (detectedWebsiteUrl) instead of forcing
  // re-entry -- still fully editable, since a customer may legitimately
  // want to analyze a different site than their Search Console property.
  useEffect(() => {
    if (data && !data.hasProject && data.detectedWebsiteUrl) setSite((current) => current || data.detectedWebsiteUrl!);
  }, [data]);

  // Update 23: viewMode is a real, persisted per-tenant field
  // (search_projects.view_mode) -- sync local UI state from it whenever a
  // fresh dashboard load returns, so a refresh or a second device always
  // reflects the real stored preference rather than a hardcoded default.
  useEffect(() => {
    if (data) setViewMode(data.viewMode);
  }, [data]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  // Update 23 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): once a
  // project exists, there was no way to trigger a fresh analysis outside
  // onboarding -- reuses the exact same /api/platform/search/run endpoint
  // as runFirstAnalysis above (the real analysis engine, crawl, and
  // scheduler are never duplicated), passing the project's own already-known
  // propertyUrl so nothing needs re-entering.
  async function analyzeNow() {
    if (!tenantId || !data?.propertyUrl || analyzeState === "running") return;
    setAnalyzeState("running");
    setAnalyzeErrorMessage(null);
    try {
      const response = await fetch("/api/platform/search/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, propertyUrl: data.propertyUrl, propertyName: active?.name ?? data.projectName }),
      });
      const body = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        setAnalyzeState("error");
        setAnalyzeErrorMessage(
          response.status === 429
            ? "You've reached the analysis limit for now. Please try again in a few minutes."
            : "We couldn't complete the analysis."
        );
        return;
      }
      await load();
      setAnalyzeState("success");
      successTimeoutRef.current = setTimeout(() => setAnalyzeState("idle"), 4000);
    } catch {
      setAnalyzeState("error");
      setAnalyzeErrorMessage("We couldn't complete the analysis.");
    }
  }

  // Update 23: purely a UI-presentation switch over the SAME
  // SearchGrowthDashboardData already loaded -- deliberately calls a
  // different endpoint (/api/platform/search/view-mode) than the Growth
  // automation toggle below, so it can never affect scheduler eligibility,
  // entitlement, the website connection, or billing.
  async function changeViewMode(next: "simple" | "detailed") {
    if (!tenantId || viewModeSaving || next === viewMode) return;
    setViewModeSaving(true);
    const previous = viewMode;
    setViewMode(next);
    try {
      const response = await fetch("/api/platform/search/view-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, viewMode: next }),
      });
      if (!response.ok) setViewMode(previous);
    } catch {
      setViewMode(previous);
    } finally {
      setViewModeSaving(false);
    }
  }

  async function runFirstAnalysis() {
    if (!tenantId || !site.trim()) return;
    setRunning(true);
    try {
      const response = await fetch("/api/platform/search/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, propertyUrl: site.trim(), propertyName: active?.name ?? "Website" }),
      });
      if (response.ok) await load();
    } finally {
      setRunning(false);
    }
  }

  // Update 22 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): the real
  // scheduler-eligibility flag (search_projects.enabled) already existed
  // and was already the live gate the daily continuous-growth cron
  // filters on -- nothing anywhere let a customer actually control it.
  // This is the one missing write path, not a new growth-state system.
  async function toggleGrowth(next: boolean) {
    if (!tenantId || toggling) return;
    setToggling(true);
    const previous = data;
    // Optimistic update -- reverted on failure below.
    setData((current) => (current ? { ...current, growthEnabled: next } : current));
    try {
      const response = await fetch("/api/platform/search/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, enabled: next }),
      });
      if (!response.ok) setData(previous);
    } catch {
      setData(previous);
    } finally {
      setToggling(false);
    }
  }

  if (loading) return null; // app/app/search/loading.tsx covers the route-transition skeleton

  // This SEO/search feature's own paid-tier gate is a separate, real
  // access-control decision from which dashboard component renders inside
  // it (a dedicated regression test,
  // packages/payments-and-wallet/src/__tests__/autopilot-universal-unlock.test.ts,
  // exists specifically to catch this feature's EntitlementGate usage
  // being removed as a side effect of unrelated work).
  //
  // Update 15 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): this used
  // to pass minTier="growth" -- a legacy tier name not present anywhere in
  // the real, currently-sold v3 catalog, which silently locked out every
  // real customer regardless of plan (confirmed live against the real
  // StratXcel tenant's active `advanced_growth` subscription). Now gated
  // on the actual capability the catalog defines for this feature:
  // PLAN_CAPABILITIES[tier].seo_execution.
  return (
    <EntitlementGate tenantId={tenantId} requiredCapability="seo_execution" featureName="Google SEO workflows">
      {error || !data ? (
        <ErrorState message={error ?? "SEARCH_DASHBOARD_UNAVAILABLE"} onRetry={load} />
      ) : !data.hasProject ? (
        // Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
        // getSearchGrowthDashboardData previously handed every caller
        // fabricated placeholder data ("Local Business" /
        // "https://example.com") for a tenant with no real project yet,
        // indistinguishable from a real one. hasProject makes that honest
        // -- a genuine "connect your website" prompt instead of a
        // dashboard full of fake data.
        <Card className="p-6">
          {data.detectedWebsiteUrl ? (
            <>
              <CardHeading>Website detected</CardHeading>
              <p className="mt-2 text-xs text-sx-text-muted">
                We found <span className="font-semibold text-sx-text">{data.detectedWebsiteUrl}</span> from your connected Google Search Console. Run the first real SEO/AEO/GEO analysis on it, or enter a different website below. Nothing is published or changed without your approval.
              </p>
            </>
          ) : (
            <>
              <CardHeading>Connect your website to start</CardHeading>
              <p className="mt-2 text-xs text-sx-text-muted">Enter your website to run the first real SEO/AEO/GEO analysis. Nothing is published or changed without your approval. Missing provider data stays visibly unavailable — never shown as if it were real.</p>
            </>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input type="text" value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourbusiness.in" className="flex-1" />
            <Button onClick={runFirstAnalysis} disabled={running || !site.trim()}>{running ? "Running…" : "Run Search Analysis"}</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-sx-text">Growth</p>
              <p className="mt-0.5 text-[13px] text-sx-text-muted">
                {data.growthEnabled ? "StratXcel continuously analyzes and improves your search visibility." : "Paused — StratXcel will not run scheduled growth cycles until you turn this back on."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={data.growthEnabled ?? false}
              aria-label="Growth"
              disabled={toggling}
              onClick={() => toggleGrowth(!data.growthEnabled)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                data.growthEnabled ? "bg-sx-accent" : "bg-sx-surface-2 border border-sx-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  data.growthEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </Card>

          {/* Update 23: manual "Analyze Now" -- reuses the same
             /api/platform/search/run endpoint runFirstAnalysis above
             already calls; this is not a second analysis engine. */}
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-sx-text">Manual analysis</p>
              <p className="mt-0.5 text-[13px] text-sx-text-muted">
                {analyzeState === "error"
                  ? analyzeErrorMessage ?? "We couldn't complete the analysis."
                  : data.lastAnalysisCompletedAt
                  ? `Last analyzed: ${new Date(data.lastAnalysisCompletedAt).toLocaleString()}`
                  : "Run a fresh SEO/AEO/GEO analysis any time, outside the automatic schedule."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {analyzeState === "error" && (
                <Button variant="ghost" size="sm" onClick={analyzeNow}>
                  Retry
                </Button>
              )}
              <Button onClick={analyzeNow} disabled={analyzeState === "running"}>
                {analyzeState === "running" ? "Analyzing…" : analyzeState === "success" ? "Analysis complete" : "Analyze Now"}
              </Button>
            </div>
          </Card>

          {/* Update 23: Simple / Detailed is a UI-presentation switch only
             (search_projects.view_mode) -- deliberately not labeled
             "Growth ON/OFF" or wired to growthEnabled above, since it never
             touches automation, entitlement, or the website connection. */}
          <div className="flex items-center gap-2 self-start rounded-sx-sm border border-sx-border bg-sx-surface-2 p-1" role="tablist" aria-label="Dashboard detail level">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "simple"}
              disabled={viewModeSaving}
              onClick={() => changeViewMode("simple")}
              className={`rounded-sx-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                viewMode === "simple" ? "bg-sx-accent text-sx-accent-on" : "text-sx-text-muted hover:text-sx-text"
              }`}
            >
              Simple view
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "detailed"}
              disabled={viewModeSaving}
              onClick={() => changeViewMode("detailed")}
              className={`rounded-sx-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                viewMode === "detailed" ? "bg-sx-accent text-sx-accent-on" : "text-sx-text-muted hover:text-sx-text"
              }`}
            >
              Detailed view
            </button>
          </div>

          {viewMode === "detailed" ? <SearchGrowthDashboardView initialData={data} /> : <SimpleGrowthSummary data={data} />}
        </div>
      )}
    </EntitlementGate>
  );
}
