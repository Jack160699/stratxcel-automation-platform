import { recordAuditEvent } from "@stratxcel/audit";
import { requestApproval } from "@stratxcel/approvals";
import { analyzeTechnicalSeo } from "./technical.ts";
import { CRAWL_LIMITS, crawlWebsite } from "./crawler.ts";
import {
  completeAnalysisRun,
  createSearchAction,
  ensureSearchProject,
  failAnalysisRun,
  saveMeasurementSnapshot,
  saveOpportunities,
  saveRecommendation,
  stableFingerprint,
  startAnalysisRun,
  type SearchDb,
} from "./repository.ts";
import type { ProviderConnection, TechnicalPage, QueryMetric } from "./types.ts";
import {
  type SearchMeasurementProvider,
  createUnavailableSearchMeasurementProvider,
  generateTargetQuerySet,
  discoverCompetitors,
  buildCompetitorQuerySnapshots,
  analyzeWhyCompetitorsWin,
  computeCompetitorDeltas,
  calculateSearchAuthorityScore,
  type MeasurementQueryResult,
} from "./measurement/index.ts";
import type { ResearchResult } from "./research/types.ts";

export const SEARCH_RUNTIME_FLAGS = {
  schedulerEnabled: process.env.SEARCH_DISCOVERY_SCHEDULER_ENABLED === "true",
  crawlEnabled: process.env.SEARCH_DISCOVERY_CRAWL_ENABLED === "true",
} as const;

export const SEARCH_MAX_ATTEMPTS = 3;
export type RuntimePlan = keyof typeof CRAWL_LIMITS;

export interface SearchRuntimeInput {
  tenantId: string;
  actorUserId?: string;
  propertyUrl: string;
  propertyName: string;
  plan: RuntimePlan;
  runType: "lightweight" | "weekly" | "monthly" | "manual";
  triggerSource: "manual" | "scheduler" | "internal";
  idempotencyKey: string;
}

async function event(
  db: SearchDb,
  input: SearchRuntimeInput,
  action: string,
  runId: string,
  metadata: Record<string, unknown> = {}
) {
  await recordAuditEvent(db as any, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actorKind: input.actorUserId ? "user" : "system",
    action,
    targetType: "search_analysis_run",
    targetId: runId,
    metadata,
  });
}

export interface ProviderSnapshotInput {
  dimensions: unknown;
  values: unknown;
  periodStart?: string;
  periodEnd?: string;
}

export async function runSearchAnalysis(
  db: SearchDb,
  input: SearchRuntimeInput,
  options: {
    pages?: TechnicalPage[];
    crawl?: typeof crawlWebsite;
    providerStates?: ProviderConnection[];
    providerSnapshots?: Record<string, ProviderSnapshotInput>;
    serpProvider?: SearchMeasurementProvider;
    services?: string[];
    locations?: string[];
    competitors?: string[];
    brandBrainCompetitors?: string[];
    research?: ResearchResult;
  } = {}
) {
  const project = await ensureSearchProject(db, {
    tenantId: input.tenantId,
    propertyUrl: input.propertyUrl,
    name: input.propertyName,
  });

  const started = await startAnalysisRun(db, {
    tenantId: input.tenantId,
    projectId: project.id,
    runType: input.runType,
    triggerSource: input.triggerSource,
    idempotencyKey: input.idempotencyKey,
  });

  if (started.duplicate) return { run: started.run, duplicate: true };

  const run = started.run;
  await db
    .from("search_analysis_runs")
    .update({
      state: "RUNNING",
      started_at: new Date().toISOString(),
      attempt_count: 1,
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("tenant_id", input.tenantId);

  await event(db, input, "SEARCH_RUN_CREATED", run.id);
  await event(db, input, "SEARCH_RUN_STARTED", run.id);

  try {
    let pages = options.pages ?? [];
    let crawlErrors: Array<{ url: string; error: string }> = [];
    // Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
    // Updates 20 & 21. robotsPresent/sitemapPresent stay `null` ("not
    // actually checked") rather than a fabricated `false` ("confirmed
    // missing") whenever the crawl below doesn't run -- see Update 20.
    let robotsPresent: boolean | null = null;
    let sitemapPresent: boolean | null = null;

    // Update 21: this used to also require `project.ownership_verified`
    // (never set to true anywhere in this codebase -- confirmed by a
    // full repo search -- so this had silently disabled the entire
    // crawl-based analysis pipeline, for every tenant, always). Root
    // cause: READ (a public, SSRF-protected crawl of pages the site
    // already serves to any visitor or search engine -- crawlWebsite()
    // independently calls assertPublicHttpTarget() on every URL it
    // touches, rejecting private IPs/localhost/internal hosts regardless
    // of this flag) was wrongly conflated with WRITE (actually modifying
    // the tenant's live site, which stays gated on its own real,
    // independent authorization -- the Vercel connector's token-based
    // scope, entirely unrelated to this field -- see execution/engine.ts
    // and vercel/connector.ts, neither of which references
    // ownership_verified at all). A customer submitting their own
    // propertyUrl (this run's actual input) is already a reasonable basis
    // for "you may look at this site's public pages," the same standard
    // every SEO scanning tool uses -- proof of ownership is what a WRITE
    // path should require, not a read-only crawl.
    //
    // ownership_verified is deliberately left in the schema, unremoved --
    // it remains available for a genuine future ownership-gated WRITE
    // decision; this fix only stops misapplying it to gate public
    // analysis.
    if (!pages.length && SEARCH_RUNTIME_FLAGS.crawlEnabled) {
      await event(db, input, "SEARCH_CRAWL_STARTED", run.id);
      const result = await (options.crawl ?? crawlWebsite)(input.propertyUrl, {
        limits: { maxPages: CRAWL_LIMITS[input.plan] },
      });
      pages = result.pages;
      crawlErrors = result.errors;
      robotsPresent = result.robotsPresent;
      sitemapPresent = result.sitemapPresent;
      await event(db, input, "SEARCH_CRAWL_COMPLETED", run.id, {
        pages: pages.length,
        errors: crawlErrors.length,
        truncated: result.truncated,
      });
    } else if (!pages.length) {
      // The only remaining real reason to reach here is the crawl feature
      // flag (SEARCH_DISCOVERY_CRAWL_ENABLED) itself being off -- a
      // genuine, deliberate operator-controlled kill switch, unrelated to
      // this tenant or its website.
      await event(db, input, "SEARCH_PROVIDER_SKIPPED", run.id, {
        provider: "first_party_crawl",
        state: "configuration_required",
      });
      // robotsPresent/sitemapPresent correctly stay null here -- the real
      // crawl never ran, so the real answer is genuinely unknown, not
      // "confirmed absent."
    }
    // Note: when options.pages is pre-supplied by a caller, robots/sitemap
    // presence is still genuinely unknown from that alone -- no real
    // production caller does this today (both real call sites always crawl
    // fresh), so this intentionally stays null rather than guessing true.

    const issues = analyzeTechnicalSeo(pages, {
      https: input.propertyUrl.startsWith("https://"),
      robotsPresent,
      sitemapPresent,
    });

    // 1. Ingest GSC telemetry if present
    const gscSnapshot = options.providerSnapshots?.search_console;
    const gscRows: QueryMetric[] = (gscSnapshot?.values as any)?.rows ?? [];

    // 2. Generate Target Queries
    const targetQueries = generateTargetQuerySet({
      businessName: input.propertyName,
      services: options.services || [],
      locations: options.locations || [],
      gscMetrics: gscRows,
      competitors: options.competitors || options.brandBrainCompetitors || [],
    });

    // 3. Discover Competitors
    const discoveredCompetitors = discoverCompetitors({
      clientDomain: new URL(input.propertyUrl).hostname,
      brandBrainCompetitors: options.competitors || options.brandBrainCompetitors || [],
      groundedResearch: options.research ?? null,
    });

    // 4. Measure Queries with Provider
    const serpProvider = options.serpProvider ?? createUnavailableSearchMeasurementProvider();
    const serpStatus = await serpProvider.status();
    const clientDomain = new URL(input.propertyUrl).hostname;
    const competitorDomains = discoveredCompetitors.map((c) => c.domain);

    const serpResults: MeasurementQueryResult[] = [];
    if (serpStatus === "AVAILABLE") {
      for (const tq of targetQueries.slice(0, 5)) {
        try {
          const res = await serpProvider.measureQuery({
            query: tq.query,
            location: tq.targetLocation,
            clientDomain,
            competitorDomains,
          });
          serpResults.push(res);
        } catch {
          // Individual query failure degrades safely
        }
      }
    }

    // 5. Build Competitor Snapshots & Why They Win Explanations
    const competitorSnapshots = buildCompetitorQuerySnapshots({
      targetQueries,
      clientDomain,
      competitors: discoveredCompetitors,
      serpResults,
      providerState: {
        isAvailable: serpStatus === "AVAILABLE",
        reasonIfUnavailable:
          serpStatus !== "AVAILABLE" ? "Live SERP measurement provider is not configured." : undefined,
      },
    });

    const whyTheyWin = analyzeWhyCompetitorsWin({
      clientDomain,
      clientBusinessName: input.propertyName,
      snapshots: competitorSnapshots,
      targetQueries,
      competitors: discoveredCompetitors,
      clientPages: pages,
      clientTechnicalIssues: issues,
    });

    const deltas = computeCompetitorDeltas({
      currentSnapshots: competitorSnapshots,
      clientBusinessName: input.propertyName,
    });

    const authorityScore = calculateSearchAuthorityScore({
      pages,
      technicalIssues: issues,
      servicesCount: options.services?.length || 3,
      snapshots: competitorSnapshots,
      structuredDataTypes: pages.flatMap((p) => p.structuredDataTypes || []),
    });

    // Save Competitor Intelligence Snapshot into Database
    await saveMeasurementSnapshot(db, {
      tenantId: input.tenantId,
      projectId: project.id,
      runId: run.id,
      source: "competitor_intelligence",
      dimensions: {
        targetQueryCount: targetQueries.length,
        competitorCount: discoveredCompetitors.length,
        measuredQueryCount: serpResults.length,
      },
      values: {
        targetQueries,
        competitors: discoveredCompetitors,
        snapshots: competitorSnapshots,
        whyTheyWin,
        deltas,
        authorityScore,
      },
      availabilityState: serpStatus === "AVAILABLE" ? "connected" : "not_connected",
      unavailableReason: serpStatus !== "AVAILABLE" ? "Live SERP provider not configured." : undefined,
      fingerprint: stableFingerprint(["competitor_intelligence", new Date().toISOString().slice(0, 10)]),
    });

    // Compile All Opportunities (Technical SEO + Competitor Search Gaps)
    const technicalOpportunities = issues.map((issue) => ({
      fingerprint: stableFingerprint([input.tenantId, input.propertyUrl, issue.code, issue.affectedUrl]),
      category: `technical:${issue.code}`,
      severity: issue.severity,
      priority:
        issue.severity === "Critical" ? 100 : issue.severity === "High" ? 80 : issue.severity === "Medium" ? 55 : 30,
      evidence: { evidence: issue.evidence },
      affectedUrl: issue.affectedUrl,
      businessRationale: issue.whyItMatters,
      proposedAction: issue.recommendedAction,
    }));

    const competitorOpportunities = whyTheyWin.map((wtw) => ({
      fingerprint: stableFingerprint([input.tenantId, input.propertyUrl, "comp_gap", wtw.competitorDomain, wtw.query]),
      category: "competitor:search_gap",
      severity: "High" as const,
      priority: 85,
      evidence: { evidence: wtw.evidence, likelyReasons: wtw.likelyReasons, unknowns: wtw.unknowns },
      affectedQuery: wtw.query,
      businessRationale: `${wtw.competitorName} is currently outperforming on "${wtw.query}". Closing this gap will reclaim search traffic.`,
      proposedAction: wtw.recommendedAction,
    }));

    const allOpportunities = [...technicalOpportunities, ...competitorOpportunities];
    await saveOpportunities(db, { tenantId: input.tenantId, projectId: project.id, runId: run.id, opportunities: allOpportunities });

    for (const opp of allOpportunities) {
      const opportunityResult = await db
        .from("search_opportunities")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("project_id", project.id)
        .eq("fingerprint", opp.fingerprint)
        .single();

      if (opportunityResult.error) throw new Error(`SEARCH_OPPORTUNITY_LOOKUP_FAILED: ${opportunityResult.error.message}`);

      const actionClass = "approval_required";
      const recommendation = await saveRecommendation(db, {
        tenantId: input.tenantId,
        opportunityId: opportunityResult.data.id,
        runId: run.id,
        fingerprint: stableFingerprint([opp.fingerprint, opp.proposedAction]),
        evidence: opp.evidence,
        proposedChange: { recommendation: opp.proposedAction, affectedUrl: (opp as any).affectedUrl, affectedQuery: (opp as any).affectedQuery },
        actionClass,
      });

      const existingAction = await db
        .from("search_actions")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("recommendation_id", recommendation.id)
        .maybeSingle();

      if (!existingAction.data) {
        let approvalId: string | undefined;
        if (actionClass === "approval_required") {
          const approval = await requestApproval(db as any, {
            tenantId: input.tenantId,
            kind: "other",
            requestedBy: input.actorUserId,
            subject: {
              type: "search_recommendation",
              recommendationId: recommendation.id,
              proposedChange: opp.proposedAction,
            },
          });
          approvalId = approval.id;
        }
        await createSearchAction(db, {
          tenantId: input.tenantId,
          recommendationId: recommendation.id,
          actionClass,
          approvalId,
        });
      }

      await db
        .from("search_opportunities")
        .update({
          status: "AWAITING_APPROVAL",
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunityResult.data.id)
        .eq("tenant_id", input.tenantId);
    }

    const providerStates = options.providerStates ?? [
      { provider: "search_console", state: "not_connected", reason: "No tenant-scoped authenticated connection." },
      { provider: "ga4", state: "not_connected", reason: "No tenant-scoped authenticated connection." },
      { provider: "google_business_profile", state: "configuration_required", reason: "Owner connection required." },
      { provider: "meta", state: "permission_required", reason: "Reporting permission required." },
    ] as ProviderConnection[];

    for (const provider of providerStates) {
      const snapshot = options.providerSnapshots?.[provider.provider];
      await saveMeasurementSnapshot(db, {
        tenantId: input.tenantId,
        projectId: project.id,
        runId: run.id,
        source: provider.provider,
        dimensions: snapshot?.dimensions ?? {},
        values: snapshot?.values ?? {},
        availabilityState: provider.state,
        unavailableReason: provider.reason,
        fingerprint: stableFingerprint([provider.provider, new Date().toISOString().slice(0, 10)]),
        periodStart: snapshot?.periodStart,
        periodEnd: snapshot?.periodEnd,
      });
      if (provider.state !== "connected") {
        await event(db, input, "SEARCH_PROVIDER_SKIPPED", run.id, { provider: provider.provider, state: provider.state });
      }
    }

    await event(db, input, "SEARCH_RECOMMENDATIONS_CREATED", run.id, { opportunities: allOpportunities.length });
    const completed = await completeAnalysisRun(db, {
      tenantId: input.tenantId,
      runId: run.id,
      partial: crawlErrors.length > 0 || !pages.length,
      summaryCounts: {
        pages: pages.length,
        issues: issues.length,
        competitorGaps: whyTheyWin.length,
        targetQueries: targetQueries.length,
        crawlErrors: crawlErrors.length,
      },
      providerAvailability: {
        ...Object.fromEntries(providerStates.map((p) => [p.provider, p.state])),
        live_serp: serpStatus === "AVAILABLE" ? "connected" : "not_connected",
      },
    });

    await event(db, input, "SEARCH_RUN_COMPLETED", run.id, { state: completed.state });
    return { run: completed, duplicate: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "SEARCH_ANALYSIS_FAILED";
    const failed = await failAnalysisRun(db, {
      tenantId: input.tenantId,
      runId: run.id,
      reason,
      attemptCount: 1,
    });
    await event(db, input, "SEARCH_RUN_FAILED", run.id, { reason });
    return { run: failed, duplicate: false };
  }
}

export const SEARCH_SCHEDULES = [
  { cadence: "daily", runType: "lightweight" },
  { cadence: "weekly", runType: "weekly" },
  { cadence: "monthly", runType: "monthly" },
] as const;

export function schedulerCanRun(): boolean {
  return SEARCH_RUNTIME_FLAGS.schedulerEnabled;
}

export function retryDelayMs(attempt: number): number | null {
  if (attempt >= SEARCH_MAX_ATTEMPTS) return null;
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}
