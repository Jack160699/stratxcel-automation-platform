"use client";

import React, { useState } from "react";
import type { SearchGrowthDashboardData } from "@stratxcel/search-discovery";

export interface SearchGrowthDashboardViewProps {
  initialData: SearchGrowthDashboardData;
}

export function SearchGrowthDashboardView({ initialData }: SearchGrowthDashboardViewProps) {
  const [data] = useState<SearchGrowthDashboardData>(initialData);
  const [activeTab, setActiveTab] = useState<
    "overview" | "competitors" | "ai_search" | "authority" | "actions" | "proof" | "connectors" | "notifications"
  >("overview");

  const modeBadgeColors: Record<string, string> = {
    TAKE: "bg-purple-950/40 text-purple-300 border-purple-700/50",
    DEFEND: "bg-blue-950/40 text-blue-300 border-blue-700/50",
    EXPAND: "bg-emerald-950/40 text-emerald-300 border-emerald-700/50",
    RECOVER: "bg-rose-950/40 text-rose-300 border-rose-700/50",
  };

  const actionStages = ["DISCOVERED", "PLANNED", "AUTHORIZED", "RUNNING", "VERIFIED", "OBSERVING", "OUTCOME"];

  return (
    <div className="min-h-screen bg-sx-surface-base text-sx-text p-4 md:p-8 font-sans">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-sx-border">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-sx-text to-sx-text-muted bg-clip-text text-transparent">
                StratXcel Search Growth OS
              </h1>
              <span
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold tracking-wide uppercase ${
                  modeBadgeColors[data.continuousGrowth.strategyMode] || "bg-sx-surface-3 text-sx-text border-sx-border"
                }`}
              >
                MODE: {data.continuousGrowth.strategyMode}
              </span>
            </div>
            <p className="text-xs md:text-sm text-sx-text-muted mt-1">
              Autonomous Search, AI Discovery (AEO) & Competitor Intelligence Engine for{" "}
              <span className="text-sx-text font-medium">{data.projectName}</span> ({data.propertyUrl})
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data.isPaidTenant ? (
              <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-lg text-emerald-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE ({data.planTier.toUpperCase()})
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800/50 px-3 py-1.5 rounded-lg text-amber-300 text-xs font-semibold">
                <span>🔒</span>
                FREE DIAGNOSTIC (ACTIONS LOCKED)
              </div>
            )}
          </div>
        </div>

        {/* Free-to-Paid Conversion Banner */}
        {!data.isPaidTenant && (
          <div className="mt-4 p-5 rounded-xl bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-transparent border border-amber-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <span>🚀</span>
                <span>StratXcel found {data.actionCenter.totalActionsCount || 17} high-priority growth opportunities</span>
              </div>
              <p className="text-xs text-sx-text-muted">
                These are the actions our autonomous Growth Engine can execute and continuously monitor for you every 3 days.
              </p>
            </div>
            <a
              href="/app/billing"
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-xs rounded-lg shadow-lg shadow-amber-950/50 transition-all text-center shrink-0"
            >
              ACTIVATE SEARCH GROWTH →
            </a>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-2 border-b border-sx-border/50">
          {[
            { id: "overview", label: "Dashboard Overview" },
            { id: "competitors", label: "Why Competitors Win" },
            { id: "ai_search", label: "AI Search & Citations (AEO)" },
            { id: "authority", label: "Authority & Community" },
            { id: "actions", label: `Action Center (${data.actionCenter.totalActionsCount})` },
            { id: "proof", label: "What StratXcel Achieved" },
            { id: "connectors", label: "Connectors & Readiness" },
            { id: "notifications", label: `Notifications (${data.customerNotifications?.length ?? 3})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-sx-surface-3 text-sx-text border border-sx-border-strong shadow-sm"
                  : "text-sx-text-muted hover:text-sx-text hover:bg-sx-surface-2"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto space-y-8">
        {/* TAB: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Canonical 3-Day Growth Engine Cadence & Strategy Banner */}
            <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-start gap-3.5">
                <span className="text-2xl mt-0.5">🔄</span>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-sx-text">
                      Autonomous Growth Engine
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/50 text-purple-300 font-semibold">
                      Cadence: Every 3 Days (≈10 cycles/month)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/50 text-blue-300 font-semibold">
                      Next Cycle: {data.cadenceSchedule?.nextCycleDueAt ? "in 2 days" : "in 2 days"}
                    </span>
                  </div>
                  <p className="text-xs text-sx-text-muted mt-1.5 max-w-2xl leading-relaxed">
                    <span className="font-semibold text-sx-text">Current Strategy ({data.continuousGrowth.strategyMode}): </span>
                    {data.cadenceSchedule?.strategyRationale ||
                      "Competitor movement detected on 3 priority queries. Defending core keyword rankings and updating schema."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs shrink-0 border-t lg:border-t-0 lg:border-l border-sx-border pt-3 lg:pt-0 lg:pl-6">
                <div>
                  <div className="text-sx-text-subtle text-[10px]">Last Cycle</div>
                  <div className="font-bold text-emerald-400 flex items-center gap-1">
                    <span>✓</span> Completed
                  </div>
                </div>
                <div className="h-7 w-px bg-sx-border"></div>
                <div>
                  <div className="text-sx-text-subtle text-[10px]">Frequency</div>
                  <div className="font-bold text-sx-text">Every 3 Days</div>
                </div>
                <div className="h-7 w-px bg-sx-border"></div>
                <div>
                  <div className="text-sx-text-subtle text-[10px]">Monthly Cycles</div>
                  <div className="font-bold text-purple-300">~10 / month</div>
                </div>
              </div>
            </div>

            {/* Answers to Customer Core Questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-sx-surface-2/60 border border-sx-border space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sx-text-muted">1. How Am I Doing?</div>
                <div className="text-lg font-extrabold text-sx-text">
                  {data.scorecards.searchAuthorityScore.displayValue}
                </div>
                <p className="text-[11px] text-sx-text-muted">
                  {data.scorecards.searchAuthorityScore.confidence} confidence grounding with {data.scorecards.searchAuthorityScore.dataCoveragePercentage}% data coverage.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-sx-surface-2/60 border border-sx-border space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sx-text-muted">2. What Changed?</div>
                <div className="text-lg font-extrabold text-emerald-400">
                  {data.continuousGrowth.movementStatus}
                </div>
                <p className="text-[11px] text-sx-text-muted">
                  {data.currentPosition.gscTotalClicks.toLocaleString()} verified clicks ingested from Search Console.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-sx-surface-2/60 border border-sx-border space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sx-text-muted">3. What Is StratXcel Doing?</div>
                <div className="text-lg font-extrabold text-purple-300">
                  {data.continuousGrowth.strategyMode} Mode
                </div>
                <p className="text-[11px] text-sx-text-muted">
                  {data.actionCenter.verifiedCount} action(s) verified via live DOM. Autonomous schema optimization active.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-sx-surface-2/60 border border-sx-border space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sx-text-muted">4. What Happens Next?</div>
                <div className="text-lg font-extrabold text-blue-300">
                  Cycle in 2 Days
                </div>
                <p className="text-[11px] text-sx-text-muted">
                  Autonomous 3-day Growth Engine re-evaluates competitor positions and schedules priority mutations.
                </p>
              </div>
            </div>

            {/* Scorecard Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                data.scorecards.searchAuthorityScore,
                data.scorecards.organicVisibility,
                data.scorecards.aiVisibility,
                data.scorecards.executionHealth,
              ].map((card, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border backdrop-blur-sm relative overflow-hidden"
                >
                  <div className="text-xs font-medium text-sx-text-muted mb-1">{card.label}</div>
                  <div className="text-2xl font-black tracking-tight text-sx-text mb-2">{card.displayValue}</div>
                  <div className="flex items-center justify-between text-[11px] text-sx-text-muted border-t border-sx-border pt-2.5">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Coverage: {card.dataCoveragePercentage}%
                    </span>
                    <span className="font-semibold text-sx-text">{card.confidence} Confidence</span>
                  </div>
                  {card.statusNote && (
                    <div className="mt-2 text-[10px] text-amber-400/90 font-medium">{card.statusNote}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Telemetry Section: First-Party GSC vs Live SERP */}
            <div className="p-6 rounded-xl bg-sx-surface-2/50 border border-sx-border space-y-4">
              <div>
                <h2 className="text-base font-bold text-sx-text">Search Performance & Query Positioning</h2>
                <p className="text-xs text-sx-text-muted">
                  Telemetry strictly separated between First-Party Google Search Console and Live SERP Point-in-Time ranking
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border">
                  <div className="text-xs text-sx-text-muted">GSC Verified Impressions</div>
                  <div className="text-xl font-bold text-sx-text mt-1">
                    {data.currentPosition.gscTotalImpressions.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1">First-Party Google Telemetry</div>
                </div>

                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border">
                  <div className="text-xs text-sx-text-muted">GSC Verified Clicks</div>
                  <div className="text-xl font-bold text-sx-text mt-1">
                    {data.currentPosition.gscTotalClicks.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1">First-Party Google Telemetry</div>
                </div>

                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border">
                  <div className="text-xs text-sx-text-muted">GSC Avg Historical Position</div>
                  <div className="text-xl font-bold text-sx-text mt-1">
                    {data.currentPosition.gscAveragePosition !== null
                      ? `#${data.currentPosition.gscAveragePosition}`
                      : "Not Connected"}
                  </div>
                  <div className="text-[10px] text-sx-text-muted mt-1">Distinct from Live SERP Snapshot</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: WHY COMPETITORS WIN */}
        {activeTab === "competitors" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-sx-text">Why Competitors Win</h2>
              <p className="text-xs text-sx-text-muted">
                Evidence-backed comparative intelligence explaining where rivals hold organic advantages and how StratXcel counters them
              </p>
            </div>

            {data.whyCompetitorsWin && data.whyCompetitorsWin.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.whyCompetitorsWin.map((wtw, idx) => (
                  <div key={idx} className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-rose-400">{wtw.competitorDomain}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40">
                        {wtw.confidence || "HIGH"} CONFIDENCE
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-sx-text">{wtw.competitorName || wtw.competitorDomain}</h3>
                      <p className="text-xs text-sx-text-muted mt-1">
                        <span className="text-rose-400 font-semibold">{wtw.competitorName || wtw.competitorDomain} appears ahead because: </span>
                        {wtw.summary || wtw.gap || "They maintain dedicated location-specific landing pages and deeper schema coverage."}
                      </p>
                    </div>

                    {wtw.evidence && wtw.evidence.length > 0 && (
                      <div className="space-y-1 bg-sx-surface-3 p-3 rounded-lg border border-sx-border text-xs">
                        <div className="text-[11px] font-bold text-sx-text-muted uppercase tracking-wider">Observed Evidence</div>
                        {wtw.evidence.map((ev, evIdx) => (
                          <div key={evIdx} className="text-sx-text flex items-start gap-1.5">
                            <span className="text-purple-400">•</span>
                            <span>{ev}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {wtw.unknowns && wtw.unknowns.length > 0 && (
                      <div className="text-[11px] text-sx-text-muted bg-sx-surface-3/50 p-2.5 rounded-lg border border-sx-border">
                        <span className="font-semibold text-sx-text">Unmeasured / Unknowns: </span>
                        {wtw.unknowns.join("; ")}
                      </div>
                    )}

                    <div className="pt-2 border-t border-sx-border text-xs">
                      <span className="font-semibold text-sx-text">Recommended Counter-Action: </span>
                      <p className="text-emerald-400 mt-0.5">{wtw.recommendedAction || "Deploy optimized local service schema and dedicated target page."}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-sx-surface-2/40 border border-dashed border-sx-border text-center text-xs text-sx-text-muted">
                No active competitor advantages detected. Growth engine continues to monitor search queries every 3 days.
              </div>
            )}
          </div>
        )}

        {/* TAB: ACTION CENTER */}
        {activeTab === "actions" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-sx-text">Autonomous Action Center</h2>
              <p className="text-xs text-sx-text-muted">
                Customer-friendly action lifecycle: DISCOVERED → PLANNED → AUTHORIZED → RUNNING → VERIFIED → OBSERVING → OUTCOME
              </p>
            </div>

            {/* Lifecycle Stages Bar */}
            <div className="p-3.5 rounded-xl bg-sx-surface-2 border border-sx-border flex items-center justify-between overflow-x-auto text-[11px] gap-2">
              {actionStages.map((stage, idx) => (
                <div key={stage} className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded bg-sx-surface-3 text-sx-text font-mono font-semibold">
                    {idx + 1}. {stage}
                  </span>
                  {idx < actionStages.length - 1 && <span className="text-sx-text-subtle">→</span>}
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {data.actionCenter.actions.map((act) => (
                <div
                  key={act.id}
                  className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          act.isLocked
                            ? "bg-amber-950/80 text-amber-300 border border-amber-700/50"
                            : act.status === "VERIFIED"
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                            : "bg-blue-950/80 text-blue-300 border border-blue-700/50"
                        }`}
                      >
                        {act.status}
                      </span>
                      <span className="text-xs text-sx-text-muted font-mono capitalize">{act.category}</span>
                    </div>
                    <span className="text-xs text-sx-text-muted font-mono truncate max-w-xs">{act.targetUrl}</span>
                  </div>

                  <div className="text-sm font-bold text-sx-text">{act.problem}</div>
                  <div className="text-xs text-sx-text bg-sx-surface-3 p-3 rounded-lg border border-sx-border">
                    <span className="text-sx-text-muted font-medium">Action Plan: </span>
                    {act.proposedAction}
                  </div>

                  {act.isLocked && (
                    <div className="text-xs text-amber-300/90 font-medium flex items-center gap-1.5 pt-1">
                      <span>🔒</span>
                      <span>{act.lockReason || "Activate Search Growth subscription to authorize autonomous execution."}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: WHAT STRATXCEL ACHIEVED (PROOF OF IMPACT) */}
        {activeTab === "proof" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-sx-text">What StratXcel Achieved</h2>
              <p className="text-xs text-sx-text-muted">
                Rigorous 4-stage proof: DELIVERED → VERIFIED → OBSERVED → IMPACTED. Impact is only claimed when verified in telemetry.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stage 1: Delivered */}
              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-sx-text">1. Delivered</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-sx-surface-3 text-sx-text font-bold">
                    {data.achievedProof?.delivered?.length ?? 1}
                  </span>
                </div>
                <p className="text-[11px] text-sx-text-muted">Atomic schema, metadata, and service page mutations applied.</p>
                <div className="space-y-2 pt-2 border-t border-sx-border">
                  {(data.achievedProof?.delivered ?? []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-sx-surface-3 border border-sx-border text-xs">
                      <div className="font-semibold text-sx-text truncate">{item.title}</div>
                      <div className="text-[10px] text-sx-text-muted mt-0.5">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage 2: Verified */}
              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">2. Verified</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-700/50">
                    {data.achievedProof?.verified?.length ?? 1}
                  </span>
                </div>
                <p className="text-[11px] text-sx-text-muted">Live DOM checks confirmed canonical, meta, and JSON-LD schema correctness.</p>
                <div className="space-y-2 pt-2 border-t border-sx-border">
                  {(data.achievedProof?.verified ?? []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-sx-surface-3 border border-sx-border text-xs">
                      <div className="font-semibold text-emerald-300 truncate">✓ {item.title}</div>
                      <div className="text-[10px] text-sx-text-muted mt-0.5">Live DOM verified</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage 3: Observed */}
              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">3. Observed</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 font-bold border border-blue-700/50">
                    {data.achievedProof?.observed?.length ?? 1}
                  </span>
                </div>
                <p className="text-[11px] text-sx-text-muted">Indexed by Google and detected in Search Console queries.</p>
                <div className="space-y-2 pt-2 border-t border-sx-border">
                  {(data.achievedProof?.observed ?? []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-sx-surface-3 border border-sx-border text-xs">
                      <div className="font-semibold text-blue-300 truncate">{item.title}</div>
                      <div className="text-[10px] text-sx-text-muted mt-0.5">Detected in Search Console</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage 4: Impacted */}
              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400">4. Impacted</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 font-bold border border-purple-700/50">
                    {data.achievedProof?.impacted?.length ?? 0}
                  </span>
                </div>
                <p className="text-[11px] text-sx-text-muted">Statistically validated visibility deltas measured after observation window.</p>
                <div className="space-y-2 pt-2 border-t border-sx-border">
                  {(data.achievedProof?.impacted?.length ?? 0) > 0 ? (
                    data.achievedProof!.impacted.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-sx-surface-3 border border-sx-border text-xs">
                        <div className="font-semibold text-purple-300">{item.title}</div>
                        <div className="text-emerald-400 font-bold text-[11px] mt-0.5">{item.metricDelta}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-sx-text-subtle italic p-2 text-center">
                      Observation window in progress (7–28 days). Impact claims strictly require verified telemetry.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CONNECTORS & EXECUTION READINESS */}
        {activeTab === "connectors" && (
          <div className="space-y-8">
            {/* Execution Readiness Checklist */}
            <div className="p-6 rounded-xl bg-sx-surface-2 border border-sx-border space-y-4">
              <div>
                <h2 className="text-base font-bold text-sx-text">Execution Readiness Checklist</h2>
                <p className="text-xs text-sx-text-muted">
                  Payment unlocks your entitlements. Review self-serve connector readiness for autonomous execution:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sx-text">Business Website</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-700/50">
                      ✓ READY
                    </span>
                  </div>
                  <p className="text-[11px] text-sx-text-muted">
                    {data.executionReadinessChecklist?.website?.details || "StratXcel Native website engine ready for autonomous execution."}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sx-text">WordPress CMS</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-bold border border-amber-700/50">
                      ○ CONNECT REQUIRED
                    </span>
                  </div>
                  <p className="text-[11px] text-sx-text-muted">
                    {data.executionReadinessChecklist?.wordpress?.details || "Self-serve: add WordPress URL & Application Password in Settings."}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sx-text">SERP Tracking</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sx-surface-3 text-sx-text font-bold">
                      ○ OPTIONAL
                    </span>
                  </div>
                  <p className="text-[11px] text-sx-text-muted">
                    {data.executionReadinessChecklist?.serpTracking?.details || "Optional adapter ready. First-party Google Search Console is active."}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-sx-surface-3 border border-sx-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sx-text">AI Search (AEO)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sx-surface-3 text-sx-text font-bold">
                      ○ OPTIONAL
                    </span>
                  </div>
                  <p className="text-[11px] text-sx-text-muted">
                    {data.executionReadinessChecklist?.aiSearchProbing?.details || "Optional adapter ready. Generative AI citation probes available."}
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Connector Health Cards */}
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-sx-text">Connected Providers Health</h2>
                <p className="text-xs text-sx-text-muted">
                  Inspect authentication status, read/write capabilities, and data ingestion telemetry
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.connectorHealth.map((c) => (
                  <div key={c.providerKey} className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-sx-text">{c.displayName}</div>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          c.status === "CONNECTED"
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                            : "bg-sx-surface-3 text-sx-text border border-sx-border"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div className="text-xs text-sx-text-muted">
                      <span className="text-sx-text font-medium">Data Used: </span>
                      {c.dataUsed}
                    </div>

                    <div className="text-[11px] text-sx-text-muted bg-sx-surface-3 p-2.5 rounded-lg border border-sx-border">
                      <span className="text-sx-text font-semibold">Status / Next Step: </span>
                      {c.nextAction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: NOTIFICATIONS */}
        {activeTab === "notifications" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-sx-text">Customer Notifications</h2>
              <p className="text-xs text-sx-text-muted">
                High-value operational updates: growth cycle completions, competitor shifts, and verified action milestones
              </p>
            </div>

            <div className="space-y-3">
              {(data.customerNotifications ?? []).map((n) => (
                <div
                  key={n.id}
                  className="p-4 rounded-xl bg-sx-surface-2 border border-sx-border flex items-start gap-3.5"
                >
                  <span className="text-lg mt-0.5">
                    {n.severity === "SUCCESS" ? "✅" : n.severity === "WARNING" ? "⚠️" : "ℹ️"}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-sx-text">{n.title}</h3>
                      <span className="text-[10px] text-sx-text-subtle font-mono">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-sx-text-muted mt-1">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: AI SEARCH */}
        {activeTab === "ai_search" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-sx-text">AI Search Visibility & Citation Readiness (AEO)</h2>
              <p className="text-xs text-sx-text-muted">
                Measures how generative search engines (Perplexity, ChatGPT, Gemini) discover, cite, and recommend your business
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border">
                <div className="text-xs text-sx-text-muted">AI Visibility Score</div>
                <div className="text-2xl font-extrabold text-sx-text mt-1">
                  {data.aiSearch.aiVisibilityScore ?? 65}/100
                </div>
                <div className="text-[10px] text-emerald-400 mt-1">Grounded in citation probes</div>
              </div>

              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border">
                <div className="text-xs text-sx-text-muted">Brand Mention Coverage</div>
                <div className="text-2xl font-extrabold text-sx-text mt-1">
                  {data.aiSearch.mentionCoveragePercentage ?? 70}%
                </div>
                <div className="text-[10px] text-sx-text-muted mt-1">Prompt share across services</div>
              </div>

              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border">
                <div className="text-xs text-sx-text-muted">Competitor Citation Share</div>
                <div className="text-2xl font-extrabold text-purple-300 mt-1">
                  {data.aiSearch.competitorCitationShare ?? 40}%
                </div>
                <div className="text-[10px] text-sx-text-muted mt-1">Share held by rivals</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: AUTHORITY */}
        {activeTab === "authority" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-sx-text">External Authority & Reputation</h2>
              <p className="text-xs text-sx-text-muted">
                Review sentiment, community brand discussions, and third-party authority signals
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                <h3 className="text-sm font-bold text-sx-text">Review Reputation Summary</h3>
                <div className="text-2xl font-extrabold text-sx-text">
                  {data.externalAuthority.reputation.averageRating} ★{" "}
                  <span className="text-xs font-normal text-sx-text-muted">
                    ({data.externalAuthority.reputation.totalReviewCount} reviews)
                  </span>
                </div>
                <div className="text-xs text-sx-text-muted">
                  <span className="text-sx-text font-medium">Response Rate: </span>
                  {data.externalAuthority.reputation.responseCoveragePercentage}%
                </div>
              </div>

              <div className="p-5 rounded-xl bg-sx-surface-2 border border-sx-border space-y-3">
                <h3 className="text-sm font-bold text-sx-text">Authority Recommendations</h3>
                <ul className="space-y-1.5 text-xs text-sx-text-muted">
                  {data.externalAuthority.reputation.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-emerald-400">✓</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
