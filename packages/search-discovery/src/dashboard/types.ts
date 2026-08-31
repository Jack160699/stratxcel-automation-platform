/**
 * Search Growth OS Customer Operating Dashboard Read Model Types
 */

import type { MultiDimensionalReadinessReport } from "../diagnostics/types.ts";
import type { SearchStrategyMode, MovementStatus, GrowthAlert, GrowthTimelineEvent } from "../loop/types.ts";
import type { AICitationGap, AIVisibilityResult } from "../ai-search/types.ts";
import type { WhyTheyWinExplanation, CompetitorProfile, TargetQuery } from "../measurement/types.ts";
import type { AuthorityGap, RedditRadarItem, QuoraRadarItem, ReviewReputationSummary } from "../authority/types.ts";

export interface DashboardScorecardMetric {
  label: string;
  value: number | string | null;
  displayValue: string;
  trend: "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dataCoveragePercentage: number;
  lastUpdatedAt?: string;
  statusNote?: string;
}

export interface SearchGrowthDashboardData {
  tenantId: string;
  /** False when this tenant has no real search_projects row yet -- projectName/propertyUrl are honest placeholders in that case, never real data. See docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md. */
  hasProject: boolean;
  projectName: string;
  propertyUrl: string;
  isPaidTenant: boolean;
  planTier: string;
  canExecute: boolean;

  scorecards: {
    searchAuthorityScore: DashboardScorecardMetric;
    organicVisibility: DashboardScorecardMetric;
    aiVisibility: DashboardScorecardMetric;
    competitivePosition: DashboardScorecardMetric;
    authorityCoverage: DashboardScorecardMetric;
    localPresence: DashboardScorecardMetric;
    executionHealth: DashboardScorecardMetric;
  };

  currentPosition: {
    trackedQueriesCount: number;
    gscTotalClicks: number;
    gscTotalImpressions: number;
    gscAveragePosition: number | null;
    liveSerpAveragePosition: number | null;
    topQueries: Array<{
      query: string;
      gscPosition: number | null;
      liveSerpPosition: number | null;
      clicks?: number;
      impressions?: number;
      isFirstPartyTruth: boolean;
    }>;
    biggestGains: string[];
    biggestLosses: string[];
  };

  whyCompetitorsWin: WhyTheyWinExplanation[];
  competitors: CompetitorProfile[];

  aiSearch: {
    aiVisibilityScore: number | null;
    mentionCoveragePercentage: number | null;
    citationCoveragePercentage: number | null;
    competitorCitationShare: number | null;
    providerStatuses: Array<{
      provider: string;
      status: "LIVE" | "ADAPTER_READY" | "NOT_CONFIGURED";
      details: string;
    }>;
    citationGaps: AICitationGap[];
  };

  externalAuthority: {
    authorityScore: number;
    authorityGaps: AuthorityGap[];
    redditRadar: RedditRadarItem[];
    quoraRadar: QuoraRadarItem[];
    reputation: ReviewReputationSummary;
  };

  actionCenter: {
    totalActionsCount: number;
    lockedCount: number;
    verifiedCount: number;
    inProgressCount: number;
    actions: Array<{
      id: string;
      problem: string;
      category: string;
      severity: string;
      targetUrl: string;
      proposedAction: string;
      status: "LOCKED" | "READY" | "QUEUED" | "RUNNING" | "VERIFIED" | "FAILED" | "BLOCKED";
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
      verificationResult?: Record<string, unknown>;
      isLocked: boolean;
      lockReason?: string;
    }>;
  };

  connectorHealth: Array<{
    providerKey: string;
    displayName: string;
    status: "CONNECTED" | "ADAPTER_READY" | "CONFIGURED_NOT_VERIFIED" | "NOT_CONNECTED";
    lastVerifiedAt?: string;
    readCapability: boolean;
    writeCapability: boolean;
    dataUsed: string;
    nextAction: string;
  }>;

  continuousGrowth: {
    strategyMode: SearchStrategyMode;
    movementStatus: MovementStatus;
    strategyExplanation: string;
    activeAlerts: GrowthAlert[];
    lastEvaluatedAt?: string;
    nextScheduledRun?: string;
  };

  growthTimeline: GrowthTimelineEvent[];
  readiness: MultiDimensionalReadinessReport;

  cadenceSchedule: {
    frequency: "EVERY_3_DAYS";
    cadenceDays: 3;
    targetMonthlyCycles: 10;
    lastCycleCompletedAt?: string;
    lastCycleStatus: "COMPLETED" | "RUNNING" | "NOT_DUE" | "SKIPPED_NO_DATA";
    nextCycleDueAt: string;
    daysUntilNextCycle: number;
    activeStrategyMode: SearchStrategyMode;
    strategyRationale: string;
  };

  executionReadinessChecklist: {
    website: { status: "READY" | "ACTION_REQUIRED"; label: string; details: string };
    wordpress: { status: "CONNECTED" | "CONNECT_REQUIRED" | "NOT_CONFIGURED"; label: string; details: string };
    serpTracking: { status: "CONFIGURED" | "OPTIONAL_NOT_CONFIGURED"; label: string; details: string };
    aiSearchProbing: { status: "CONFIGURED" | "OPTIONAL_NOT_CONFIGURED"; label: string; details: string };
  };

  achievedProof: {
    delivered: Array<{ id: string; title: string; targetUrl: string; completedAt: string; description: string }>;
    verified: Array<{ id: string; title: string; targetUrl: string; verifiedAt: string; domCheckPassed: boolean }>;
    observed: Array<{ id: string; title: string; detectedInGsc: boolean; observedAt: string; query?: string }>;
    impacted: Array<{ id: string; title: string; metricDelta: string; confidence: "HIGH" | "MEDIUM"; measuredAt: string }>;
  };

  customerNotifications: Array<{
    id: string;
    type: "AUDIT_READY" | "COMPETITOR_MOVEMENT" | "ACTION_VERIFIED" | "VERIFICATION_FAILED" | "VISIBILITY_IMPROVED" | "CONNECTOR_REAUTH" | "GROWTH_CYCLE_COMPLETED";
    title: string;
    message: string;
    timestamp: string;
    severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  }>;
}

