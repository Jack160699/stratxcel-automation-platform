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

  useEffect(() => {
    if (data && !data.hasProject) {
      setSite((current) => current || data.detectedWebsiteUrl || "https://www.stratxcel.in");
    }
  }, [data]);

  useEffect(() => {
    if (data) setViewMode(data.viewMode);
  }, [data]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

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

  async function toggleGrowth(next: boolean) {
    if (!tenantId || toggling) return;
    setToggling(true);
    const previous = data;
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

  if (loading) return null;

  return (
    <EntitlementGate tenantId={tenantId} requiredCapability="seo_execution" featureName="Google SEO workflows">
      {error || !data ? (
        <ErrorState message={error ?? "SEARCH_DASHBOARD_UNAVAILABLE"} onRetry={load} />
      ) : !data.hasProject ? (
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
            <Input type="text" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://www.stratxcel.in" className="flex-1" />
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
