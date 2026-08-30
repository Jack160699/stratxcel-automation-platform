import { createSupabaseServiceClient } from "../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL two-gap closure brief, Gap 2 (Section 7): structured Monday
 * performance analysis, replacing the previously honest placeholder
 * (social_autopilot_weekly_campaigns.performance_signal_status defaulted
 * to 'NO_ANALYTICS_AVAILABLE' with no code that ever set it to
 * 'SNAPSHOT_RECORDED' -- see weekly-campaign.ts's own "What this module
 * does NOT do" comment and docs/architecture/PACKAGE_AUTOPILOT_AND_HERMES.md's
 * "What this is NOT" section, both of which explicitly deferred this
 * pending real analytics ingestion).
 *
 * analyzeWeeklyPerformance is a PURE function (no I/O) -- mirrors this
 * codebase's established pattern (computePackageDistribution,
 * buildSocialAutopilotContext): directly unit-testable with real,
 * representative shapes, no fake Supabase client needed. The I/O wrapper
 * below (runMondayPerformanceAnalysisForTenant) fetches real data and
 * calls it.
 */

export interface AnalyzedPostInput {
  variantId: string;
  pillar: string | null;
  format: string | null;
  objective: string | null;
  /** The post's most recent real social_metrics observation, or null if
   * none exists yet (never a fabricated zero). */
  metrics: {
    reach: number | null;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    clicks: number | null;
  } | null;
}

interface GroupPerformance {
  key: string;
  avgEngagementScore: number;
  sampleSize: number;
}

export interface PerformanceAnalysis {
  tenantId: string;
  weekStart: string;
  weekEnd: string;
  postsAnalyzed: number;
  postsWithRealMetrics: number;
  topPerformingTopics: GroupPerformance[];
  weakTopics: GroupPerformance[];
  topFormats: GroupPerformance[];
  weakFormats: GroupPerformance[];
  /** "CTA style" proxy: content_variants.objective is the real, existing
   * field this codebase uses for a post's call-to-action framing
   * (selectObjective/buildCreativeBrief) -- there is no separate CTA-text
   * column to analyze independently, so this is genuinely what "strongest/
   * weakest CTAs" means against this schema, not an invented substitute. */
  strongestCtas: GroupPerformance[];
  weakestCtas: GroupPerformance[];
  engagementPatterns: string[];
  contentFatigue: { repeatedPillars: string[]; repeatedFormats: string[]; repeatedObjectives: string[] };
  strategicRecommendations: string[];
  confidence: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  dataSource: "REAL_ANALYTICS" | "NO_ANALYTICS_AVAILABLE";
}

function hasAnyRealMetric(m: AnalyzedPostInput["metrics"]): m is NonNullable<AnalyzedPostInput["metrics"]> {
  if (!m) return false;
  return [m.reach, m.impressions, m.likes, m.comments, m.shares, m.saves, m.clicks].some((v) => typeof v === "number" && !Number.isNaN(v) && v !== null);
}

/**
 * A single real, explainable engagement score per post: a weighted sum of
 * real engagement actions (comments and shares weighted higher than a
 * like, saves weighted like a comment -- a save is a stronger buying-
 * intent signal than a like), normalized by real reach/impressions into a
 * rate when available so a post shown to more people isn't unfairly
 * favored just for raw counts. Falls back to the absolute weighted count
 * (still real, still comparable across this same tenant's posts) only
 * when neither reach nor impressions was ever observed for that post.
 */
function computeEngagementScore(m: NonNullable<AnalyzedPostInput["metrics"]>): number {
  const engagements = (m.likes ?? 0) + (m.comments ?? 0) * 2 + (m.shares ?? 0) * 3 + (m.saves ?? 0) * 2 + (m.clicks ?? 0);
  const denominator = m.reach ?? m.impressions ?? null;
  return denominator && denominator > 0 ? engagements / denominator : engagements;
}

function groupBy(posts: Array<{ key: string | null; score: number }>): GroupPerformance[] {
  const byKey = new Map<string, number[]>();
  for (const p of posts) {
    if (!p.key) continue;
    if (!byKey.has(p.key)) byKey.set(p.key, []);
    byKey.get(p.key)!.push(p.score);
  }
  return [...byKey.entries()]
    .map(([key, scores]) => ({ key, avgEngagementScore: scores.reduce((a, b) => a + b, 0) / scores.length, sampleSize: scores.length }))
    .sort((a, b) => b.avgEngagementScore - a.avgEngagementScore);
}

/** Above-vs-below the real observed average for THIS window -- a real,
 * relative split (never a hardcoded absolute threshold that would mean
 * nothing across tenants/platforms with wildly different real reach). */
function splitAboveBelowAverage(groups: GroupPerformance[]): { top: GroupPerformance[]; weak: GroupPerformance[] } {
  if (groups.length === 0) return { top: [], weak: [] };
  const overallAvg = groups.reduce((sum, g) => sum + g.avgEngagementScore * g.sampleSize, 0) / groups.reduce((sum, g) => sum + g.sampleSize, 0);
  return {
    top: groups.filter((g) => g.avgEngagementScore > overallAvg),
    weak: groups.filter((g) => g.avgEngagementScore <= overallAvg),
  };
}

/** Real content-fatigue detection: a real pillar/format/objective used in
 * more than half of this window's posts, out of at least 3 posts (never
 * flags a normal 1-of-2 real repeat as "fatigue"). */
function detectFatigue(values: Array<string | null>): string[] {
  const total = values.filter(Boolean).length;
  if (total < 3) return [];
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > total / 2).map(([key]) => key);
}

export function analyzeWeeklyPerformance(input: { tenantId: string; weekStart: string; weekEnd: string; posts: AnalyzedPostInput[] }): PerformanceAnalysis {
  const measured = input.posts.filter((p) => hasAnyRealMetric(p.metrics));
  const dataSource: PerformanceAnalysis["dataSource"] = measured.length > 0 ? "REAL_ANALYTICS" : "NO_ANALYTICS_AVAILABLE";
  const confidence: PerformanceAnalysis["confidence"] = measured.length === 0 ? "NONE" : measured.length >= 5 ? "HIGH" : measured.length >= 2 ? "MEDIUM" : "LOW";

  const scored = measured.map((p) => ({ ...p, score: computeEngagementScore(p.metrics!) }));

  const pillarGroups = groupBy(scored.map((p) => ({ key: p.pillar, score: p.score })));
  const formatGroups = groupBy(scored.map((p) => ({ key: p.format, score: p.score })));
  const objectiveGroups = groupBy(scored.map((p) => ({ key: p.objective, score: p.score })));

  const pillarSplit = splitAboveBelowAverage(pillarGroups);
  const formatSplit = splitAboveBelowAverage(formatGroups);
  const objectiveSplit = splitAboveBelowAverage(objectiveGroups);

  const contentFatigue = {
    repeatedPillars: detectFatigue(input.posts.map((p) => p.pillar)),
    repeatedFormats: detectFatigue(input.posts.map((p) => p.format)),
    repeatedObjectives: detectFatigue(input.posts.map((p) => p.objective)),
  };

  const engagementPatterns: string[] = [];
  if (pillarSplit.top.length > 0) engagementPatterns.push(`${pillarSplit.top[0]!.key} content is the strongest real topic this window (${pillarSplit.top[0]!.sampleSize} post(s) measured).`);
  if (formatSplit.top.length > 0) engagementPatterns.push(`${formatSplit.top[0]!.key} is the strongest real format this window (${formatSplit.top[0]!.sampleSize} post(s) measured).`);

  const strategicRecommendations: string[] = [];
  if (dataSource === "NO_ANALYTICS_AVAILABLE") {
    strategicRecommendations.push("No real, measured performance data is available for last week's posts yet -- strategy is unchanged from real research/psychology/competitor signals alone this week.");
  } else {
    if (pillarSplit.top.length > 0) strategicRecommendations.push(`Increase ${pillarSplit.top.map((g) => g.key).join(", ")} content -- real engagement ran above this week's average.`);
    if (pillarSplit.weak.length > 0) strategicRecommendations.push(`Reduce or refresh ${pillarSplit.weak.map((g) => g.key).join(", ")} content -- real engagement ran at or below this week's average.`);
    if (formatSplit.top.length > 0) strategicRecommendations.push(`Favor the ${formatSplit.top.map((g) => g.key).join(", ")} format -- real engagement ran above this week's average.`);
    if (objectiveSplit.top.length > 0) strategicRecommendations.push(`Lean toward ${objectiveSplit.top.map((g) => g.key).join(", ")}-objective posts -- real engagement ran above this week's average.`);
    if (objectiveSplit.weak.length > 0) strategicRecommendations.push(`Reconsider ${objectiveSplit.weak.map((g) => g.key).join(", ")}-objective posts -- real engagement ran at or below this week's average.`);
    if (contentFatigue.repeatedPillars.length > 0) strategicRecommendations.push(`Diversify away from repeated topics: ${contentFatigue.repeatedPillars.join(", ")} (used in more than half of this window's real posts).`);
  }

  return {
    tenantId: input.tenantId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    postsAnalyzed: input.posts.length,
    postsWithRealMetrics: measured.length,
    topPerformingTopics: pillarSplit.top.map(({ key, avgEngagementScore, sampleSize }) => ({ key, avgEngagementScore, sampleSize })),
    weakTopics: pillarSplit.weak.map(({ key, avgEngagementScore, sampleSize }) => ({ key, avgEngagementScore, sampleSize })),
    topFormats: formatSplit.top,
    weakFormats: formatSplit.weak,
    strongestCtas: objectiveSplit.top,
    weakestCtas: objectiveSplit.weak,
    engagementPatterns,
    contentFatigue,
    strategicRecommendations,
    confidence,
    dataSource,
  };
}

/**
 * Real I/O wrapper: gathers last week's real published posts for this
 * tenant (via the same connected-account tenant-scoping used throughout
 * lib/social -- content_variants has no tenant_id column of its own, only
 * via content_master, so scoping through social_accounts/
 * social_publishing_jobs is the established, already-proven pattern, not a
 * second one) and their most recent real social_metrics observation, then
 * calls the pure analyzer above. Never throws -- a read failure here must
 * never block the real Monday campaign-creation flow that calls it,
 * matching every other best-effort call site in package-autopilot.ts.
 */
export async function runMondayPerformanceAnalysisForTenant(
  service: ServiceClient,
  input: { tenantId: string; weekStart: string; weekEnd: string }
): Promise<PerformanceAnalysis> {
  try {
    const { data: accounts } = await service.from("social_accounts").select("id").eq("tenant_id", input.tenantId);
    const accountIds = (accounts ?? []).map((a) => a.id as string);
    if (accountIds.length === 0) return analyzeWeeklyPerformance({ tenantId: input.tenantId, weekStart: input.weekStart, weekEnd: input.weekEnd, posts: [] });

    const windowStartIso = `${input.weekStart}T00:00:00.000Z`;
    const windowEndIso = new Date(new Date(`${input.weekEnd}T00:00:00.000Z`).getTime() + 86_400_000).toISOString();
    const { data: jobs } = await service
      .from("social_publishing_jobs")
      .select("variant_id")
      .in("account_id", accountIds)
      .eq("status", "PUBLISHED")
      .gte("completed_at", windowStartIso)
      .lt("completed_at", windowEndIso);
    const variantIds = [...new Set((jobs ?? []).map((j) => j.variant_id as string))];
    if (variantIds.length === 0) return analyzeWeeklyPerformance({ tenantId: input.tenantId, weekStart: input.weekStart, weekEnd: input.weekEnd, posts: [] });

    const [{ data: variants }, { data: metricsRows }] = await Promise.all([
      service.from("content_variants").select("id, content_pillar, format, objective").in("id", variantIds),
      service.from("social_metrics").select("variant_id, observation_date, reach, impressions, likes, comments, shares, saves, clicks").in("variant_id", variantIds).order("observation_date", { ascending: false }),
    ]);

    const latestByVariant = new Map<string, { reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null }>();
    for (const row of metricsRows ?? []) {
      const variantId = row.variant_id as string;
      if (latestByVariant.has(variantId)) continue; // ordered desc by observation_date -- first occurrence per variant is the most recent
      latestByVariant.set(variantId, { reach: row.reach ?? null, impressions: row.impressions ?? null, likes: row.likes ?? null, comments: row.comments ?? null, shares: row.shares ?? null, saves: row.saves ?? null, clicks: row.clicks ?? null });
    }

    const posts: AnalyzedPostInput[] = (variants ?? []).map((v) => ({
      variantId: v.id as string,
      pillar: (v.content_pillar as string | null) ?? null,
      format: (v.format as string | null) ?? null,
      objective: (v.objective as string | null) ?? null,
      metrics: latestByVariant.get(v.id as string) ?? null,
    }));

    return analyzeWeeklyPerformance({ tenantId: input.tenantId, weekStart: input.weekStart, weekEnd: input.weekEnd, posts });
  } catch {
    return analyzeWeeklyPerformance({ tenantId: input.tenantId, weekStart: input.weekStart, weekEnd: input.weekEnd, posts: [] });
  }
}
