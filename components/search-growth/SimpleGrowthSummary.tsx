"use client";

import type { ReactNode } from "react";
import type { SearchGrowthDashboardData, DashboardScorecardMetric } from "@stratxcel/search-discovery";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";

export interface SimpleGrowthSummaryProps {
  data: SearchGrowthDashboardData;
}

/**
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
 * 23: the only Search Growth view ever built (SearchGrowthDashboardView)
 * surfaces every real internal signal at once -- provider/adapter health,
 * dozens of scorecards, strategy-mode internals, crawl/scheduler detail.
 * Most customers want three plain-language questions answered instead: is
 * my search presence okay, what did StratXcel do, and what's next. This
 * component answers exactly that using ONLY fields already present on
 * SearchGrowthDashboardData -- it computes zero new metrics, calls no new
 * API, and stores nothing of its own. It is strictly a simpler
 * presentation of the same real data SearchGrowthDashboardView already
 * renders in full detail.
 *
 * SEO / AEO / GEO mapping below is an editorial labeling choice over
 * EXISTING scorecard fields, not a new metric or invented number:
 *   SEO -> scorecards.organicVisibility (classic organic search ranking)
 *   AEO -> scorecards.aiVisibility      (AI / answer-engine visibility)
 *   GEO -> scorecards.localPresence     (this engine's own local-presence signal)
 */

type Tone = "good" | "attention" | "unknown";

function statusWord(metric: DashboardScorecardMetric): { word: string; tone: Tone } {
  if (metric.trend === "INSUFFICIENT_DATA" || metric.value === null || metric.confidence === "LOW") {
    return { word: "Not enough data yet", tone: "unknown" };
  }
  if (metric.trend === "DECLINING") return { word: "Needs attention", tone: "attention" };
  return { word: "Good", tone: "good" };
}

const TONE_CLASSES: Record<Tone, string> = {
  good: "bg-emerald-950/40 text-emerald-300 border-emerald-700/50",
  attention: "bg-amber-950/40 text-amber-300 border-amber-700/50",
  unknown: "bg-sx-surface-3 text-sx-text-muted border-sx-border",
};

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

export function SimpleGrowthSummary({ data }: SimpleGrowthSummaryProps) {
  const seo = statusWord(data.scorecards.organicVisibility);
  const aeo = statusWord(data.scorecards.aiVisibility);
  const geo = statusWord(data.scorecards.localPresence);

  const { verifiedCount, inProgressCount } = data.actionCenter;

  const topAlert = data.continuousGrowth.activeAlerts[0];
  const disconnectedConnector = data.connectorHealth.find((connector) => connector.status !== "CONNECTED");
  const nextAction = data.actionCenter.actions.find((action) => action.status === "READY" || action.status === "QUEUED");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeading>Search status</CardHeading>
        <div className="mt-1 flex flex-col">
          <CardRow>
            <span className="text-sx-text">SEO — general search</span>
            <StatusPill tone={seo.tone}>{seo.word}</StatusPill>
          </CardRow>
          <CardRow>
            <span className="text-sx-text">AEO — AI answers</span>
            <StatusPill tone={aeo.tone}>{aeo.word}</StatusPill>
          </CardRow>
          <CardRow>
            <span className="text-sx-text">GEO — local presence</span>
            <StatusPill tone={geo.tone}>{geo.word}</StatusPill>
          </CardRow>
        </div>
      </Card>

      <Card>
        <CardHeading>What StratXcel did</CardHeading>
        <p className="mt-2 text-[13px] text-sx-text-muted">
          {verifiedCount > 0
            ? `${verifiedCount} improvement${verifiedCount === 1 ? "" : "s"} completed and verified.${
                inProgressCount > 0 ? ` ${inProgressCount} more in progress.` : ""
              }`
            : inProgressCount > 0
            ? `${inProgressCount} improvement${inProgressCount === 1 ? "" : "s"} in progress.`
            : "No changes made yet — StratXcel is still analyzing your site."}
        </p>
      </Card>

      <Card>
        <CardHeading>Needs your attention</CardHeading>
        <p className="mt-2 text-[13px] text-sx-text-muted">
          {topAlert
            ? topAlert.title
            : disconnectedConnector
            ? `${disconnectedConnector.displayName}: ${disconnectedConnector.nextAction}`
            : "Nothing needs your attention right now."}
        </p>
      </Card>

      <Card>
        <CardHeading>Next</CardHeading>
        <p className="mt-2 text-[13px] text-sx-text-muted">
          {nextAction
            ? nextAction.proposedAction
            : "Nothing pending — StratXcel will let you know when there's a new opportunity to review."}
        </p>
      </Card>
    </div>
  );
}
