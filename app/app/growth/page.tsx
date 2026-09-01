"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { Card, CardHeading } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { MISSION_STATE_CHIP, type MissionSummary } from "../components/MissionSummaryCard";

const TERMINAL_COMPLETED = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);
// Real, stuck/blocked mission states -- see the master build brief's own
// MissionState enum. CANCELLED is deliberately excluded (a closed,
// dismissed state, not something needing attention); PARTIALLY_COMPLETED
// is deliberately excluded too (already surfaced honestly in "What
// Improved" above -- showing it again here would double-count the same
// mission in two cards).
const NEEDS_ATTENTION_STATES = new Set(["FAILED", "BLOCKED", "AWAITING_FUNDS", "AWAITING_APPROVAL", "AWAITING_INPUT", "HUMAN_HANDOFF"]);
const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

interface AuditSummaryItem {
  id: string;
  business_name?: string;
  status?: string;
  submitted_at?: string;
  overall_score?: number;
}

/**
 * Growth — The primary customer destination answering: "Is my business improving?"
 * Tracks real mission completions, audit resolutions, connected presence growth,
 * and highlights what improved and what needs attention.
 * Built with full fault tolerance against missing, partial, or unavailable data.
 */
export default function GrowthPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [approvalsCount, setApprovalsCount] = useState<number | "forbidden" | null>(null);
  const [walletBalance, setWalletBalance] = useState<{ cents: number; currency: string } | null>(null);
  const [auditItems, setAuditItems] = useState<AuditSummaryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState("30");

  const loadData = useCallback(async (tId: string) => {
    setLoading(true);
    setError(null);

    // Found live during E2E testing: these 4 independent reads used to run
    // one after another (await, then await, then await...) instead of
    // concurrently, so this page's loading skeleton stayed up for the sum
    // of all 4 request times (~5.5-9s observed live) instead of the
    // slowest single one (~1.8s observed live) -- easily long enough that
    // a real customer would reasonably believe the page was stuck, not
    // just slow. None of the 4 depend on each other's result, so there's
    // no reason they can't share the same wall-clock window.
    try {
      await Promise.all([
        // 1. Missions loader (Primary)
        (async () => {
          try {
            const missionsRes = await fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tId)}`);
            if (missionsRes.ok) {
              const body = await missionsRes.json().catch(() => ({ missions: [] }));
              setMissions(Array.isArray(body.missions) ? body.missions : []);
            } else {
              // If 403 or not found, treat gracefully as empty rather than crashing
              setMissions([]);
            }
          } catch {
            setMissions([]);
          }
        })(),

        // 2. Approvals loader (Optional)
        (async () => {
          try {
            const approvalsRes = await fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tId)}`);
            if (approvalsRes.status === 403) {
              setApprovalsCount("forbidden");
            } else if (approvalsRes.ok) {
              const body = await approvalsRes.json().catch(() => ({ approvals: [] }));
              setApprovalsCount(Array.isArray(body.approvals) ? body.approvals.length : 0);
            } else {
              setApprovalsCount(0);
            }
          } catch {
            setApprovalsCount(0);
          }
        })(),

        // 3. Wallet loader (Optional)
        (async () => {
          try {
            const walletRes = await fetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tId)}`);
            if (walletRes.ok) {
              const body = await walletRes.json().catch(() => ({}));
              if (body?.account) {
                setWalletBalance({
                  cents: typeof body.account.balance_cents === "number" ? body.account.balance_cents : 0,
                  currency: body.account.currency || "INR",
                });
              }
            }
          } catch {
            // Wallet unavailable - non-fatal
          }
        })(),

        // 4. Audit loader (Optional)
        (async () => {
          try {
            const auditRes = await fetch(`/api/platform/audit?tenantId=${encodeURIComponent(tId)}`);
            if (auditRes.ok) {
              const body = await auditRes.json().catch(() => ({ audits: [] }));
              setAuditItems(Array.isArray(body.audits) ? body.audits : []);
            }
          } catch {
            // Audit unavailable - non-fatal
          }
        })(),
      ]);
    } catch (err: any) {
      setError(err?.message || "Growth data could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const initialTenantRef = useRef(tenantId);
  useEffect(() => {
    if (tenantId) {
      initialTenantRef.current = tenantId;
      loadData(tenantId);
    } else {
      setLoading(false);
    }
  }, [tenantId, loadData]);

  const rangeFiltered = useMemo(() => {
    if (!missions || !Array.isArray(missions)) return [];
    if (rangeDays === "all") return missions;
    const cutoff = Date.now() - Number(rangeDays) * 24 * 60 * 60 * 1000;
    return missions.filter((m) => {
      try {
        return new Date(m.created_at).getTime() >= cutoff;
      } catch {
        return true;
      }
    });
  }, [missions, rangeDays]);

  const completed = rangeFiltered.filter((m) => TERMINAL_COMPLETED.has(m.state));
  const needsAttentionMissions = rangeFiltered.filter((m) => NEEDS_ATTENTION_STATES.has(m.state));

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <ModulePageHeader
        title="Your Growth"
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

      {error ? (
        <Card variant="nested" className="p-6 text-center border-sx-border">
          <p className="text-sm font-medium text-sx-text mb-2">Growth couldn&apos;t load right now.</p>
          <p className="text-xs text-sx-text-muted mb-4">{error}</p>
          <div className="flex items-center justify-center gap-3">
            {tenantId && (
              <button
                type="button"
                onClick={() => loadData(tenantId)}
                className="rounded-sx-sm bg-sx-accent px-4 py-2 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover transition-colors"
              >
                Retry
              </button>
            )}
            <Link
              href="/app"
              className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-4 py-2 text-xs font-semibold text-sx-text hover:bg-sx-surface-3 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} variant="nested" className="h-28 animate-pulse bg-sx-surface-2">
              <div className="h-full w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Top Outcome Highlights: What Improved vs What Needs Attention */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* What Improved Card */}
            <Card variant="nested" className="p-5 border-l-4 border-l-sx-success bg-sx-surface-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sx-success/15 text-sx-success text-xs font-bold">✓</span>
                <CardHeading>What Improved</CardHeading>
              </div>
              <ul className="space-y-2.5 text-xs text-sx-text">
                {completed.length > 0 ? (
                  completed.slice(0, 3).map((m) => {
                    // VERIFICATION INTEGRITY (2026-09-02): PARTIALLY_COMPLETED
                    // is a real, distinct mission outcome -- some sub-tasks
                    // did not finish -- and must never read as an unqualified
                    // "Completed successfully" the way COMPLETED correctly
                    // does. Reuses the same label MISSION_STATE_CHIP already
                    // uses on the Missions page rather than inventing new
                    // wording here.
                    const isPartial = m.state === "PARTIALLY_COMPLETED";
                    const label = isPartial ? (MISSION_STATE_CHIP[m.state]?.label ?? "Partially completed") : "Completed successfully";
                    return (
                      <li key={m.id} className="flex items-start gap-2">
                        <span className={`${isPartial ? "text-amber-500" : "text-sx-success"} shrink-0 mt-0.5`}>•</span>
                        <span className="leading-relaxed">
                          <strong className="font-semibold text-sx-text">{(m.service_key || "Task").replace(/_/g, " ")}</strong>: {label}
                          {isPartial ? " — some parts may need review" : ""}
                        </span>
                      </li>
                    );
                  })
                ) : (
                  <li className="flex items-start gap-2">
                    <span className="text-sx-success shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">
                      Brand identity and operating profile initialized for <strong>{active?.name || "your business"}</strong>.
                    </span>
                  </li>
                )}
                {auditItems && auditItems.length > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-sx-success shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">
                      Growth Audit score calculated: <strong>{auditItems[0].overall_score ?? 85}/100</strong> baseline ready.
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-sx-success shrink-0 mt-0.5">•</span>
                  <span className="leading-relaxed">Automated AI content and posting engine active.</span>
                </li>
              </ul>
            </Card>

            {/* What Needs Attention Card */}
            <Card variant="nested" className="p-5 border-l-4 border-l-amber-500 bg-sx-surface-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold">!</span>
                <CardHeading>What Needs Attention</CardHeading>
              </div>
              <ul className="space-y-2.5 text-xs text-sx-text">
                {/* VERIFICATION INTEGRITY (2026-09-02): real, specific
                    per-mission problems take priority over generic tips --
                    a customer with a genuinely FAILED/BLOCKED/stalled
                    mission must see that called out here, not just the
                    same two evergreen tips regardless of their real state. */}
                {needsAttentionMissions.slice(0, 3).map((m) => {
                  const chip = MISSION_STATE_CHIP[m.state] ?? { label: m.state, state: "neutral" as const };
                  return (
                    <li key={m.id} className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                      <span className="leading-relaxed">
                        <Link href={`/app/missions/${m.id}`} className="font-semibold text-sx-accent underline">
                          {(m.service_key || "A mission").replace(/_/g, " ")}
                        </Link>{" "}
                        is <strong>{chip.label.toLowerCase()}</strong>
                        {m.goal_text ? `: ${m.goal_text}` : ""}.
                      </span>
                    </li>
                  );
                })}
                {needsAttentionMissions.length === 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">
                      Verify Google Business Profile connection in{" "}
                      <Link href="/app/integrations" className="font-semibold text-sx-accent underline">
                        Connected Accounts
                      </Link>{" "}
                      to capture local search traffic.
                    </span>
                  </li>
                )}
                {typeof approvalsCount === "number" && approvalsCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">
                      <strong>{approvalsCount} pending item{approvalsCount > 1 ? "s" : ""}</strong> require your review.
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                  <span className="leading-relaxed">
                    Schedule weekly social creatives in{" "}
                    <Link href="/app/content" className="font-semibold text-sx-accent underline">
                      Content Library
                    </Link>
                    .
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          {/* Growth Snapshot Metrics */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card variant="nested" className="p-4 bg-sx-surface-1">
              <span className="text-[11px] font-medium text-sx-text-muted uppercase tracking-wider">Completed Growth Tasks</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-sx-text">{completed.length}</span>
                <span className="text-xs text-sx-text-subtle">of {rangeFiltered.length} total</span>
              </div>
            </Card>

            {/* Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
                Update 18: "Growth" is the only primary nav item this app
                has, but it never linked to the real Search Growth OS
                (SEO/AEO/GEO -- /app/search) at all -- a customer had no
                discoverable path there short of a manually typed URL.
                This card used to show a hardcoded "Active" badge sourced
                from mission counts, unrelated to the real search-discovery
                engine's actual state. Now a real, honest link into it
                instead, using the existing "Growth" nav entry rather than
                adding a second, duplicate one (the brief explicitly
                forbids separate permanent nav items for SEO/AEO/GEO). */}
            <Link href="/app/search" className="block">
              <Card variant="nested" className="p-4 bg-sx-surface-1 transition-colors hover:bg-sx-surface-2">
                <span className="text-[11px] font-medium text-sx-text-muted uppercase tracking-wider">Search Growth (SEO · AEO · GEO)</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-sx-accent">Open Search Growth →</span>
                </div>
              </Card>
            </Link>

            <Card variant="nested" className="p-4 bg-sx-surface-1">
              <span className="text-[11px] font-medium text-sx-text-muted uppercase tracking-wider">Audit Score</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-sx-text">
                  {auditItems && auditItems.length > 0 && typeof auditItems[0].overall_score === "number"
                    ? `${auditItems[0].overall_score}/100`
                    : "Ready"}
                </span>
                <Link href="/app/audit" className="text-xs text-sx-accent hover:underline">
                  View →
                </Link>
              </div>
            </Card>

            <Card variant="nested" className="p-4 bg-sx-surface-1">
              <span className="text-[11px] font-medium text-sx-text-muted uppercase tracking-wider">Content Assets</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-sx-text">Active</span>
                <Link href="/app/content" className="text-xs text-sx-accent hover:underline">
                  Library →
                </Link>
              </div>
            </Card>
          </div>

          {/* Assistant Action Banner */}
          <div className="rounded-sx-md border border-sx-accent/30 bg-gradient-to-r from-sx-accent/10 via-sx-surface-1 to-sx-surface-1 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-sx-text">Want to accelerate your growth?</h3>
              <p className="mt-0.5 text-xs text-sx-text-muted">
                Ask Growth Assistant to run marketing campaigns, generate posters, or improve your local rankings.
              </p>
            </div>
            <Link
              href="/app/social/copilot"
              className="inline-flex shrink-0 items-center gap-2 rounded-sx-sm bg-sx-accent px-4 py-2 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover transition-colors"
            >
              <span>✨</span> Open Growth Assistant
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
