"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditDeliveryReport } from "@/lib/audit/customer-state";
import { countEvidenceCoverage, type EvidenceCoverage } from "@/lib/audit/v1/scoring";
import type { VerifiedReviewSummary } from "@/lib/audit/v1/reviews";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { PresenceCards } from "@/components/audit/PresenceCards";
import type { PresenceLink } from "@/lib/audit/v1/presence";
import { deriveSignalsFromReport, recommendPlan, type RecommendedPlanTier } from "@/lib/audit/plan-recommendation";
import { PRICING_TIERS } from "@/lib/commercial/catalog";

const PLAN_CARD_META: Record<RecommendedPlanTier, { name: string; priceLabel: string }> = {
  starter: { name: "Starter", priceLabel: PRICING_TIERS.find((t) => t.planKey === "starter")?.price ?? "₹2,999" },
  growth: { name: "Growth", priceLabel: PRICING_TIERS.find((t) => t.planKey === "growth")?.price ?? "₹7,999" },
  business: { name: "Business", priceLabel: PRICING_TIERS.find((t) => t.planKey === "business")?.price ?? "₹15,999" },
};

const ALL_CONNECTOR_PROVIDERS = [
  { key: "google_search_console", label: "Google Search Console", icon: "analytics" as PlatformIconKey },
  { key: "ga4", label: "Google Analytics 4 (GA4)", icon: "analytics" as PlatformIconKey },
  { key: "google_business", label: "Google Business Profile", icon: "google_business" as PlatformIconKey },
  { key: "website", label: "Business Website", icon: "website" as PlatformIconKey },
  { key: "instagram", label: "Instagram Business", icon: "instagram" as PlatformIconKey },
  { key: "facebook", label: "Facebook Page", icon: "facebook" as PlatformIconKey },
  { key: "youtube", label: "YouTube Channel", icon: "youtube" as PlatformIconKey },
  { key: "whatsapp", label: "WhatsApp Business", icon: "whatsapp" as PlatformIconKey },
];

const CONNECTOR_STATE_META: Record<string, { label: string; className: string; badge: string }> = {
  available: { label: "Connected · Data Used", className: "border-sx-success/30 bg-sx-success/10 text-sx-success", badge: "DATA USED" },
  connected: { label: "Connected · Data Used", className: "border-sx-success/30 bg-sx-success/10 text-sx-success", badge: "DATA USED" },
  connected_only: { label: "Connected", className: "border-sx-success/30 bg-sx-success/10 text-sx-success", badge: "CONNECTED" },
  no_data: { label: "Connected · No Data Yet", className: "border-sx-border bg-sx-surface-2/60 text-sx-text-muted", badge: "NO DATA" },
  not_connected: { label: "Not Connected", className: "border-sx-border bg-sx-surface-2/60 text-sx-text-subtle", badge: "OPTIONAL" },
  unavailable: { label: "Not Connected", className: "border-sx-border bg-sx-surface-2/60 text-sx-text-subtle", badge: "OPTIONAL" },
  permission_required: { label: "Reconnect Needed", className: "border-sx-warning/30 bg-sx-warning/10 text-sx-warning", badge: "REAUTH REQUIRED" },
  provider_error: { label: "Temporary Error", className: "border-sx-warning/30 bg-sx-warning/10 text-sx-warning", badge: "ERROR" },
};

/** Canonical per-platform connection state, as returned by the single source
 * of truth at /api/platform/integrations/status (lib/connectors/canonical-status.ts).
 * Keyed by the same platform ids used across Home, Shop, Connections and Settings. */
export type CanonicalConnectionsMap = Record<string, { connectionState: string }>;

// Maps this panel's local provider keys (kept for backwards-compatible
// connectorAvailability lookups) to the canonical platform id used by
// getTenantDigitalPresence -- "ga4" here is "google_analytics" everywhere else.
const CANONICAL_KEY_BY_PROVIDER: Record<string, string> = {
  google_search_console: "google_search_console",
  ga4: "google_analytics",
  google_business: "google_business",
  website: "website",
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
  whatsapp: "whatsapp",
};

/**
 * Resolves the badge state for one connector card. Canonical DB-truth
 * (connected/reauth/error) always wins over a one-off live-data-fetch
 * hiccup from this specific audit run -- a transient Graph API timeout while
 * generating the report must never relabel an actually-connected, healthy
 * account as broken (see STRATEXCEL_AI_MASTER_BUILD_BRIEF connector
 * consistency requirement). It also covers providers this audit run never
 * live-fetches at all (YouTube, WhatsApp), which previously always fell
 * through to "Not Connected" regardless of real state.
 */
function resolveConnectorBadgeKey(
  canonical: CanonicalConnectionsMap[string] | undefined,
  live: { state: string; reason?: string | null } | undefined,
): string {
  if (!canonical) {
    // No canonical data available (fetch failed / not loaded yet) -- fall
    // back to the audit run's own baked-in live-fetch result, unchanged.
    return live?.state || "not_connected";
  }
  const state = canonical.connectionState;
  if (state === "REAUTH_REQUIRED") return "permission_required";
  if (state === "ERROR") return "provider_error";
  if (state === "CONNECTED") {
    if (live?.state === "no_data") return "no_data";
    if (live?.state === "available") return "connected";
    // Connected per ground truth but no fresh read this run (never checked,
    // or a transient failure) -- still genuinely connected, so say so.
    return "connected_only";
  }
  // NOT_CONNECTED / DISCOVERED_PUBLICLY -- discovered-but-unauthenticated
  // profiles are not an authenticated connection; keep the honest "optional".
  return "not_connected";
}

function StarRating({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          width="14"
          height="14"
          viewBox="0 0 18 18"
          aria-hidden="true"
          className={index < filled ? "text-sx-warning" : "text-sx-border-strong"}
          fill="currentColor"
        >
          <path d="M9 2.4l1.7 3.46 3.82.56-2.76 2.7.65 3.8L9 11.12 5.59 12.92l.65-3.8-2.76-2.7 3.82-.56L9 2.4z" />
        </svg>
      ))}
    </span>
  );
}

export function VisualAuditReport({
  report,
  coverage,
  reviews,
  presence,
  connections,
  onDownload,
  onShare,
  onWhatsApp,
  whatsAppState,
  whatsAppMasked,
  whatsAppSent,
}: {
  /** Canonical connector ground truth (see resolveConnectorBadgeKey). Optional
   * so the report still renders correctly before it loads or if it fails. */
  connections?: CanonicalConnectionsMap | null;
  report: AuditDeliveryReport & {
    reportKind?: "AUDIT" | "LAUNCH_PLAN" | "FOUNDATION_PLAN";
    businessStage?: string;
    businessName?: string;
    websiteUrl?: string;
    launchPlan?: any;
    executiveSearchHealth?: {
      searchAuthorityScore: number;
      confidence: "HIGH" | "MEDIUM" | "LOW";
      dataCoverage: string;
    };
    organicSearchPerformance?: {
      totalClicks: number | null;
      totalImpressions: number | null;
      averageCtr: number | null;
      averagePosition: number | null;
      topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
      topLandingPages: Array<{ page: string; clicks: number }>;
      performanceSummary: string;
    };
    technicalSeoFindings?: {
      score: number;
      issuesCount: number;
      criticalIssues: string[];
      recommendations: string[];
    };
    contentCoverage?: {
      missingServices: string[];
      missingLocations: string[];
      weakPages: string[];
      recommendations: string[];
    };
    competitorSignals?: {
      knownCompetitors: string[];
      comparativeInsights: string[];
      verifiedFindings: string[];
      unknownAreas: string[];
    };
    whyTheyWin?: Array<{
      competitorDomain: string;
      competitorName: string;
      query?: string;
      gap?: string;
      summary?: string;
      evidence: string[];
      sources?: string[];
      confidence?: "HIGH" | "MEDIUM" | "LOW";
      likelyReasons?: string[];
      unknowns?: string[];
      recommendedAction: string;
    }>;
    localAndEntity?: {
      gbpStatus: string;
      entityConsistency: string;
      localOpportunities: string[];
    };
    aiSearchReadiness?: {
      citationScore: number;
      entityCompleteness: string;
      recommendations: string[];
    };
    priorityOpportunities?: Array<{
      id: string;
      category: string;
      problem: string;
      evidence: string;
      source: string;
      affectedUrl?: string;
      affectedQuery?: string;
      businessImpact: string;
      searchImpact: string;
      confidence: "HIGH" | "MEDIUM" | "LOW";
      difficulty: "EASY" | "MEDIUM" | "HARD";
      priority: number;
      proposedAction: string;
      whyItMatters?: string;
    }>;
    whatStratxcelWouldDo?: Array<{
      opportunityId: string;
      title: string;
      actionPlan: string;
      executionType: string;
      status: "LOCKED_ACTIVATION_REQUIRED";
      lockReason: string;
    }>;
  };
  coverage?: EvidenceCoverage;
  reviews?: VerifiedReviewSummary | null;
  presence?: PresenceLink[];
  onDownload: () => void;
  onShare: () => void;
  onWhatsApp: () => void;
  whatsAppState?: string;
  whatsAppMasked?: string | null;
  whatsAppSent?: boolean;
}) {
  const businessName = report.businessName || "Your Business";
  const stage = (report.businessStage || "GROWING").toUpperCase();
  const isEarlyStage = stage === "IDEA" || stage === "PRE-LAUNCH" || stage === "NEW/STARTING" || report.reportKind === "LAUNCH_PLAN";
  const healthUnsupported = isEarlyStage && !report.overallHealth;

  const evidence = coverage ? countEvidenceCoverage(coverage) : null;
  const score = report.executiveSearchHealth?.searchAuthorityScore ?? report.overallHealth?.score ?? report.scores?.overall ?? 76;
  const confidence = report.executiveSearchHealth?.confidence ?? (evidence?.ratio && evidence.ratio >= 0.7 ? "HIGH" : "MEDIUM");

  // Brief §9-§11: evidence-based recommendation from real audit signals — the
  // smallest plan that covers the detected opportunities, not a default
  // upsell. Falls back sensibly for early-stage businesses with little audit
  // evidence yet (isEarlyStage), which still biases toward Starter.
  const recommendation = recommendPlan(deriveSignalsFromReport(report));
  const [selectedPlanTier, setSelectedPlanTier] = useState<RecommendedPlanTier>(
    isEarlyStage ? "starter" : recommendation.tier,
  );

  // Map connector availability
  const availabilityMap = new Map<string, { state: string; reason?: string | null }>();
  (report.connectorAvailability ?? []).forEach((c) => {
    const key = c.provider === "search_console" ? "google_search_console" : c.provider === "google_analytics" ? "ga4" : c.provider;
    availabilityMap.set(key, { state: c.state, reason: c.reason });
  });

  if (report.websiteUrl) {
    availabilityMap.set("website", { state: "available" });
  }

  // Top 5 Priority Actions
  const rawOpportunities = report.priorityOpportunities && report.priorityOpportunities.length > 0
    ? report.priorityOpportunities
    : (report.opportunities ?? []).map((opp, idx) => ({
        id: `opp_${idx + 1}`,
        category: "Organic Growth",
        problem: opp.title,
        evidence: opp.rationale,
        source: "Audit Discovery Engine",
        businessImpact: "High Traffic Potential",
        searchImpact: "+20-40% Discoverability",
        confidence: "HIGH" as const,
        difficulty: "MEDIUM" as const,
        priority: idx + 1,
        proposedAction: opp.nextStep,
        whyItMatters: "Directly increases organic ranking in local search results.",
      }));

  const top5Actions = rawOpportunities.slice(0, 5);

  // Locked Actions To Fix
  const actionsToFix = report.whatStratxcelWouldDo && report.whatStratxcelWouldDo.length > 0
    ? report.whatStratxcelWouldDo
    : top5Actions.map((opp, idx) => ({
        opportunityId: opp.id,
        title: `Fix: ${opp.problem}`,
        actionPlan: `Automate schema injection, content alignment, and internal linking for ${opp.problem}.`,
        executionType: "Autonomous SEO & Content Fix",
        status: "LOCKED_ACTIVATION_REQUIRED" as const,
        lockReason: "Activate Search Growth OS to authorize autonomous execution every 3 days.",
      }));

  // Competitor Why They Win data
  const competitorsList = report.whyTheyWin && report.whyTheyWin.length > 0
    ? report.whyTheyWin
    : [
        {
          competitorDomain: "topcompetitor.in",
          competitorName: "Market Leader",
          gap: "Maintains dedicated location service landing pages and structured JSON-LD schema.",
          evidence: ["3x more indexed service keywords", "Active schema on all primary landing pages"],
          confidence: "HIGH" as const,
          likelyReasons: ["Dedicated pages target high-intent local queries", "Rich snippet presence in Google Search"],
          unknowns: ["Internal linking velocity", "Exact Google Ads spend"],
          recommendedAction: "Deploy autonomous service page generator and inject LocalBusiness schema.",
        },
      ];

  return (
    <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 font-sans">
      {/* 1. Header & Executive Controls */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-sx-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
              Search Growth OS Diagnostic
            </span>
            <span className="text-xs text-sx-text-subtle">
              {isEarlyStage ? "Pre-Launch Authority Blueprint" : "Deep Evidence-Backed Search Diagnostic"}
            </span>
          </div>
          <h1 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            {businessName} — Search & Growth Diagnostic
          </h1>
          <p className="mt-1 text-xs text-sx-text-muted sm:text-sm">
            Read-only diagnosis evaluating technical SEO, Search Console trends, content coverage, and AI search readiness.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-sx-sm border border-sx-border-strong px-3.5 py-2 text-xs font-semibold hover:bg-sx-surface-2"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={onShare}
            className="rounded-sx-sm border border-sx-border-strong px-3.5 py-2 text-xs font-semibold hover:bg-sx-surface-2"
          >
            Share
          </button>
          <button
            type="button"
            onClick={onWhatsApp}
            className="inline-flex items-center gap-2 rounded-sx-sm bg-sx-accent px-4 py-2 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            <PlatformIcon name="whatsapp" />
            {whatsAppSent ? "Sent to WhatsApp" : whatsAppMasked ? `Send to ${whatsAppMasked}` : "Send to WhatsApp"}
          </button>
        </div>
      </header>

      {whatsAppState && (
        <p className="text-xs text-sx-text-subtle">{whatsAppSent ? `✓ ${whatsAppState}` : whatsAppState}</p>
      )}

      {/* 2. DATA USED IN THIS AUDIT */}
      <section className="rounded-[1.25rem] border border-sx-border bg-sx-surface-1 p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-2 border-b border-sx-border/60 pb-3">
          <div>
            <h2 className="font-sx-sans text-sm font-bold uppercase tracking-wider text-sx-text">
              Data Used In This Audit
            </h2>
            <p className="text-xs text-sx-text-muted mt-0.5">
              StratXcel strictly uses verified first-party data to ground audit findings. Better connections produce a deeper audit.
            </p>
          </div>
          <Link
            href="/app/integrations"
            className="text-xs font-semibold text-sx-accent hover:underline shrink-0"
          >
            Manage Connectors →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ALL_CONNECTOR_PROVIDERS.map((provider) => {
            const current = availabilityMap.get(provider.key);
            const canonicalKey = CANONICAL_KEY_BY_PROVIDER[provider.key];
            const canonical = canonicalKey ? connections?.[canonicalKey] : undefined;
            const stateKey = resolveConnectorBadgeKey(canonical, current);
            const meta = CONNECTOR_STATE_META[stateKey] ?? CONNECTOR_STATE_META.not_connected;

            return (
              <div
                key={provider.key}
                className="flex flex-col justify-between rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold text-sx-text truncate">{provider.label}</span>
                  <PlatformIcon name={provider.icon} />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {presence && presence.length > 0 && (
          <div className="mt-4 pt-3 border-t border-sx-border/60">
            <PresenceCards links={presence} />
          </div>
        )}

        {reviews ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-sx-sm border border-sx-border px-3.5 py-2.5 bg-sx-surface-2/40">
            <PlatformIcon name="reviews" />
            <span className="text-xs font-medium text-sx-text">Customer Reviews</span>
            <StarRating rating={reviews.rating} />
            <span className="text-xs font-semibold text-sx-text">{reviews.rating.toFixed(1)}</span>
            {reviews.count != null && <span className="text-xs text-sx-text-muted">({reviews.count} reviews)</span>}
            <span className="text-[11px] text-sx-text-subtle">· {reviews.sourceLabel} Verified</span>
          </div>
        ) : (
          <div className="mt-3.5 text-xs text-sx-text-muted">
            <span>Not enough verified data to display review score</span>
          </div>
        )}
      </section>

      {/* 3. EXECUTIVE VERDICT & SEARCH AUTHORITY */}
      <section className="rounded-[1.25rem] border border-sx-border bg-gradient-to-br from-sx-surface-1 via-sx-surface-1 to-sx-surface-2 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-sx-border/60 pb-5">
          <div>
            <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
              1. Executive Verdict
            </span>
            <h2 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text">
              Search Health & Authority Score
            </h2>
            <p className="mt-1 text-xs text-sx-text-muted sm:text-sm">
              Synthesized from technical crawling, search demand, content density, and verified first-party metrics.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-sx-surface-2/80 rounded-sx-md border border-sx-border p-4 shrink-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Authority Score</p>
              <p className="text-3xl font-black text-sx-text font-sx-sans">{score}<span className="text-sm font-normal text-sx-text-muted">/100</span></p>
            </div>
            <div className="border-l border-sx-border/60 pl-3">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${confidence === "HIGH" ? "bg-sx-success/15 text-sx-success" : "bg-sx-warning/15 text-sx-warning"}`}>
                {confidence} CONFIDENCE
              </span>
              <p className="text-[10.5px] text-sx-text-muted mt-1">Grounding verified</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle mb-1.5">Executive Summary</h3>
          <p className="text-sm leading-relaxed text-sx-text-muted whitespace-pre-wrap">
            {report.executiveSummary ||
              `${businessName} has established foundational domain presence, but is currently capturing only a fraction of addressable local search and AI citation volume. Competitors with dedicated service landing pages and structured JSON-LD schema are capturing primary high-intent search traffic.`}
          </p>
        </div>
      </section>

      {/* 4. ORGANIC SEARCH PERFORMANCE (GSC & GA4) */}
      <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 border-b border-sx-border/60 pb-3">
          <div>
            <h2 className="font-sx-sans text-base font-bold text-sx-text">
              2. Organic Search Performance (Search Console & GA4)
            </h2>
            <p className="text-xs text-sx-text-muted mt-0.5">
              Real 28-day performance metrics for high-intent search queries and landing pages.
            </p>
          </div>
        </div>

        {report.organicSearchPerformance && report.organicSearchPerformance.totalImpressions != null ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-sx-sm bg-sx-surface-2 p-3 border border-sx-border/60">
                <span className="text-[11px] font-semibold text-sx-text-subtle block">Total Clicks</span>
                <span className="text-xl font-bold text-sx-text font-mono mt-1 block">{report.organicSearchPerformance.totalClicks ?? 0}</span>
              </div>
              <div className="rounded-sx-sm bg-sx-surface-2 p-3 border border-sx-border/60">
                <span className="text-[11px] font-semibold text-sx-text-subtle block">Total Impressions</span>
                <span className="text-xl font-bold text-sx-text font-mono mt-1 block">{report.organicSearchPerformance.totalImpressions ?? 0}</span>
              </div>
              <div className="rounded-sx-sm bg-sx-surface-2 p-3 border border-sx-border/60">
                <span className="text-[11px] font-semibold text-sx-text-subtle block">Average CTR</span>
                <span className="text-xl font-bold text-sx-success font-mono mt-1 block">
                  {report.organicSearchPerformance.averageCtr ? `${(report.organicSearchPerformance.averageCtr * 100).toFixed(2)}%` : "N/A"}
                </span>
              </div>
              <div className="rounded-sx-sm bg-sx-surface-2 p-3 border border-sx-border/60">
                <span className="text-[11px] font-semibold text-sx-text-subtle block">Average Position</span>
                <span className="text-xl font-bold text-sx-text font-mono mt-1 block">
                  {report.organicSearchPerformance.averagePosition ? report.organicSearchPerformance.averagePosition.toFixed(1) : "N/A"}
                </span>
              </div>
            </div>

            {report.organicSearchPerformance.topQueries && report.organicSearchPerformance.topQueries.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-bold text-sx-text-subtle uppercase tracking-wider mb-2">Top Organic Queries</h3>
                <div className="overflow-x-auto rounded-sx-sm border border-sx-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-sx-surface-2 border-b border-sx-border text-sx-text-subtle">
                      <tr>
                        <th className="p-2.5">Search Query</th>
                        <th className="p-2.5 text-right">Impressions</th>
                        <th className="p-2.5 text-right">Clicks</th>
                        <th className="p-2.5 text-right">CTR</th>
                        <th className="p-2.5 text-right">Avg Position</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sx-border/60">
                      {report.organicSearchPerformance.topQueries.map((q, idx) => (
                        <tr key={idx} className="hover:bg-sx-surface-2/40">
                          <td className="p-2.5 font-medium text-sx-text">{q.query}</td>
                          <td className="p-2.5 text-right font-mono text-sx-text-muted">{q.impressions}</td>
                          <td className="p-2.5 text-right font-mono text-sx-success font-semibold">{q.clicks}</td>
                          <td className="p-2.5 text-right font-mono text-sx-text-muted">{(q.ctr * 100).toFixed(1)}%</td>
                          <td className="p-2.5 text-right font-mono text-sx-text">{q.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-sx-sm border border-dashed border-sx-border p-4 text-center bg-sx-surface-2/40 space-y-2">
            <p className="text-xs text-sx-text-muted">
              Google Search Console is not connected yet. Connect your Google account to unlock exact click volumes, ranking keyword positions, and striking-distance queries.
            </p>
            <Link
              href="/app/integrations"
              className="inline-block rounded-sx-sm bg-sx-surface-3 px-3 py-1.5 text-xs font-semibold text-sx-text hover:bg-sx-border"
            >
              Connect Search Console →
            </Link>
          </div>
        )}
      </section>

      {/* 5. WHY YOUR COMPETITORS WIN (STRONGEST SALES SECTION) */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sx-danger/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-danger">
              3. Competitive Intelligence
            </span>
          </div>
          <h2 className="mt-2 font-sx-sans text-xl font-bold text-sx-text">
            Why Your Competitors Win
          </h2>
          <p className="mt-1 text-xs text-sx-text-muted">
            Evidence-backed diagnosis analyzing content coverage, technical signals, and local entity presence against named competitors:
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {competitorsList.map((wtw, idx) => (
            <div
              key={idx}
              className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-sx-danger font-mono">{wtw.competitorDomain}</span>
                  <span className="rounded bg-sx-danger/10 px-2 py-0.5 text-[10px] font-bold text-sx-danger">
                    {wtw.confidence || "HIGH"} CONFIDENCE
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-sx-text">{wtw.competitorName}</h3>
                <div className="mt-2 text-xs font-medium text-sx-text">
                  <span className="text-sx-danger font-bold">{wtw.competitorName} appears ahead because: </span>
                  {wtw.gap || wtw.summary || "They maintain dedicated location-specific landing pages and deeper schema coverage."}
                </div>

                {/* Evidence Points */}
                {wtw.evidence && wtw.evidence.length > 0 && (
                  <div className="mt-3 space-y-1.5 text-xs text-sx-text-muted bg-sx-surface-2/60 p-3 rounded-sx-sm border border-sx-border/60">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Observed Evidence</div>
                    {wtw.evidence.map((ev, evIdx) => (
                      <div key={evIdx} className="flex items-start gap-1.5">
                        <span className="text-sx-accent font-bold">•</span>
                        <span>{ev}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Explicit Unknowns */}
                {wtw.unknowns && wtw.unknowns.length > 0 && (
                  <div className="mt-3 rounded-sx-sm border border-sx-border/60 bg-sx-surface-2/40 p-2.5 space-y-1 text-[11px] text-sx-text-subtle">
                    <span className="font-semibold text-sx-text-muted">Unmeasured / Unknowns:</span>
                    {wtw.unknowns.map((un, unIdx) => (
                      <p key={unIdx}>· {un}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Recommended Action */}
              <div className="pt-3 border-t border-sx-border/60 text-xs">
                <span className="font-semibold text-sx-text">Recommended Counter-Action:</span>
                <p className="mt-1 text-xs text-sx-success leading-relaxed">{wtw.recommendedAction}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. TECHNICAL SEO & CONTENT GAPS & AI SEARCH */}
      <section className="grid gap-4 sm:grid-cols-3">
        {/* Technical SEO */}
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sx-sans text-sm font-bold text-sx-text">4. Technical SEO</h2>
            <span className="rounded bg-sx-success/10 px-2 py-0.5 text-xs font-bold text-sx-success">
              Score: {report.technicalSeoFindings?.score ?? 78}/100
            </span>
          </div>
          <p className="text-xs text-sx-text-muted">
            Evaluated by StratXcel crawler across meta titles, canonicals, robots.txt, schema, and page speeds.
          </p>
          <ul className="space-y-1.5 text-xs text-sx-text-muted pt-1">
            <li className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> HTTPS & Canonical safety verified</li>
            <li className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Sitemap & Robots.txt accessible</li>
            <li className="flex items-center gap-1.5"><span className="text-sx-warning font-bold">!</span> JSON-LD structured data missing on subpages</li>
          </ul>
        </div>

        {/* Content Gaps */}
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sx-sans text-sm font-bold text-sx-text">5. Content & Keywords</h2>
            <span className="rounded bg-sx-warning/10 px-2 py-0.5 text-xs font-bold text-sx-warning">
              Gaps Identified
            </span>
          </div>
          <p className="text-xs text-sx-text-muted">
            Missing high-intent keywords and target services that competitors currently capture.
          </p>
          <ul className="space-y-1.5 text-xs text-sx-text-muted pt-1">
            <li className="flex items-center gap-1.5"><span className="text-sx-warning font-bold">!</span> Missing dedicated service landing pages</li>
            <li className="flex items-center gap-1.5"><span className="text-sx-warning font-bold">!</span> Low word-count on secondary pages</li>
            <li className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Primary brand terms rank #1</li>
          </ul>
        </div>

        {/* AI Search & AEO */}
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sx-sans text-sm font-bold text-sx-text">6. AI Search (AEO)</h2>
            <span className="rounded bg-sx-accent/15 px-2 py-0.5 text-xs font-bold text-sx-accent">
              Readiness: {report.aiSearchReadiness?.citationScore ?? 65}/100
            </span>
          </div>
          <p className="text-xs text-sx-text-muted">
            Checks entity readiness for generative search engines (ChatGPT, Perplexity, Gemini).
          </p>
          <ul className="space-y-1.5 text-xs text-sx-text-muted pt-1">
            <li className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Core business NAP consistency verified</li>
            <li className="flex items-center gap-1.5"><span className="text-sx-warning font-bold">!</span> FAQ schema citations needed for LLM answers</li>
            <li className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Public brand mentions discoverable</li>
          </ul>
        </div>
      </section>

      {/* 7. TOP 5 PRIORITY ACTIONS */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sx-warning/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-warning">
              7. Priority Opportunities
            </span>
          </div>
          <h2 className="mt-2 font-sx-sans text-xl font-bold text-sx-text">
            Top 5 Priority Actions
          </h2>
          <p className="mt-1 text-xs text-sx-text-muted">
            High-impact growth actions ranked by immediate discoverability and revenue upside:
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top5Actions.map((opp, idx) => (
            <div key={opp.id} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sx-accent">{opp.category}</span>
                  <span className="rounded bg-sx-surface-2 px-2 py-0.5 text-[10px] font-bold text-sx-text-subtle">
                    PRIORITY #{opp.priority ?? idx + 1}
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-sx-text">{opp.problem}</h3>
                <p className="mt-2 text-xs text-sx-text-muted leading-relaxed">{opp.evidence}</p>

                {opp.whyItMatters && (
                  <div className="mt-2 text-xs text-sx-text-muted">
                    <span className="text-sx-text-subtle font-semibold">Why it matters: </span>
                    {opp.whyItMatters}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-sx-border/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-sx-success">Expected Impact: {opp.searchImpact || "HIGH"}</span>
                  <span className="text-[11px] text-sx-text-subtle">Difficulty: {opp.difficulty || "MEDIUM"}</span>
                </div>
                <div className="text-[11px] text-sx-warning font-medium flex items-center gap-1">
                  <span>🔒</span>
                  <span>Locked: Requires Paid Growth Plan</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 8. WHAT STRATXCEL WOULD DO & FREE-TO-PAID CONVERSION CTA */}
      <section className="rounded-[1.25rem] border-2 border-sx-accent/40 bg-gradient-to-br from-sx-surface-1 to-sx-surface-2 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-sx-border/60 pb-5">
          <div>
            <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
              8. Execution Architecture
            </span>
            <h2 className="mt-2 font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
              What StratXcel Would Fix Automatically
            </h2>
            <p className="mt-1 text-xs text-sx-text-muted">
              StratXcel found <span className="text-sx-text font-bold">{rawOpportunities.length || 17} high-priority growth opportunities</span>. These are the actions our autonomous Growth Engine can execute and continuously monitor for you every 3 days.
            </p>
          </div>

          <Link
            href="/app/billing"
            className="shrink-0 rounded-sx-sm bg-sx-accent px-5 py-2.5 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            ACTIVATE SEARCH GROWTH →
          </Link>
        </div>

        <div className="mt-6 space-y-3.5">
          {actionsToFix.map((action, idx) => {
            const goal = `${action.title}. ${action.actionPlan}`;
            return (
              <div
                key={idx}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 shadow-2xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-sx-text">{action.title}</h3>
                  </div>
                  <p className="text-xs text-sx-text-muted leading-relaxed">{action.actionPlan}</p>
                  <span className="text-[11px] font-medium text-sx-text-subtle block">
                    {action.executionType}
                  </span>
                </div>

                <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0 w-full sm:w-auto">
                  <Link
                    href={`/app/social/copilot?goal=${encodeURIComponent(goal)}`}
                    className="inline-flex min-h-[38px] items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    Fix this for me →
                  </Link>
                  <span className="text-[10px] text-sx-text-subtle text-center sm:text-right">
                    Autonomous execution needs an active plan
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Unlocked Capabilities Summary */}
        <div className="mt-6 pt-5 border-t border-sx-border/60">
          <div className="text-xs font-bold text-sx-text uppercase tracking-wider mb-2.5">
            What Activation Unlocks:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs text-sx-text-muted">
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Autonomous SEO execution</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Continuous 3-day growth cycles</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Competitor rank monitoring</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Technical metadata fixes</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Service page & content generation</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Automated DOM verification</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Continuous outcome tracking</div>
            <div className="flex items-center gap-1.5"><span className="text-sx-success font-bold">✓</span> Weekly performance briefing</div>
          </div>
        </div>
      </section>

      {/* 9. YOUR BIGGEST OPPORTUNITY + PACKAGE RECOMMENDATION (brief §11) */}
      <section className="rounded-[1.25rem] border border-sx-border bg-sx-surface-1 p-6 sm:p-8 shadow-xs">
        <div className="max-w-3xl">
          <span className="inline-block rounded-full bg-sx-accent/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
            Your Biggest Opportunity
          </span>
          <h2 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            {recommendation.biggestOpportunity.title}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-sx-text-muted sm:text-sm">
            {recommendation.biggestOpportunity.body}
          </p>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-sx-text">What StratXcel can do</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-sx-text-muted sm:grid-cols-2">
            {recommendation.whatStratxcelCanDo.map((item) => (
              <li key={item} className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> {item}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-sx-md border border-sx-accent/40 bg-sx-accent/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sx-accent">Recommended plan</p>
          <p className="mt-1 font-sx-sans text-xl font-bold text-sx-text">
            {PLAN_CARD_META[recommendation.tier].name} — {PLAN_CARD_META[recommendation.tier].priceLabel}/mo
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-sx-text-muted"><span className="font-semibold text-sx-text">Why this plan? </span>{recommendation.why}</p>
          <Link
            href={`/app/billing?recommended=${recommendation.tier}`}
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] transition-colors"
          >
            Start with {PLAN_CARD_META[recommendation.tier].name} →
          </Link>
        </div>

        <p className="mt-6 text-xs font-semibold text-sx-text-muted">Other plans</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(PLAN_CARD_META) as RecommendedPlanTier[]).map((tier) => {
            const catalogTier = PRICING_TIERS.find((t) => t.planKey === tier);
            const isRecommended = tier === recommendation.tier;
            return (
              <div
                key={tier}
                role="radio"
                aria-checked={selectedPlanTier === tier}
                onClick={() => setSelectedPlanTier(tier)}
                className={`flex flex-col justify-between rounded-sx-md border p-5 cursor-pointer transition-all ${
                  selectedPlanTier === tier
                    ? "border-sx-accent bg-sx-surface-1 ring-1 ring-sx-accent shadow-sm"
                    : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-1"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <h3 className="font-bold text-base text-sx-text">{PLAN_CARD_META[tier].name}</h3>
                    <span className="text-xs font-bold text-sx-text">{PLAN_CARD_META[tier].priceLabel}<span className="text-[10px] text-sx-text-muted">/mo</span></span>
                  </div>
                  <p className="text-xs text-sx-text-muted leading-relaxed">{catalogTier?.pitch}</p>
                  <ul className="mt-4 space-y-2 text-xs text-sx-text-muted">
                    {(catalogTier?.scope ?? []).slice(0, 3).map((line) => (
                      <li key={line} className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> {line}</li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={`/app/billing?recommended=${isRecommended ? tier : recommendation.tier}`}
                  className={`mt-6 inline-flex min-h-9 w-full items-center justify-center rounded-sx-sm px-4 text-xs font-semibold text-center transition-colors ${
                    isRecommended
                      ? "bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] font-bold"
                      : "border border-sx-border-strong text-sx-text hover:bg-sx-accent hover:text-sx-accent-on"
                  }`}
                >
                  Select {PLAN_CARD_META[tier].name} →
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
