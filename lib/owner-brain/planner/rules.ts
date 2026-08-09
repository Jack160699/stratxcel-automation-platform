/**
 * Pure decision rules for the morning planner, extracted out of
 * morning-plan.ts's I/O so they're directly unit-testable — see
 * __tests__/planner-rules.test.ts. No Supabase, no Date.now() side
 * effects (the caller passes in already-fetched data).
 */

export interface PlanShapeInput {
  isLowEnergy: boolean;
  meetingCount: number;
  top3Candidates: string[];
  dueSoonItems: string[];
}

export interface PlanShape {
  simplify: boolean;
  top3: string[];
  deepWork: Array<{ label: string; reason: string }>;
  lightTasks: string[];
  whatToAvoid?: string;
  healthNote?: string;
}

const HEAVY_MEETING_THRESHOLD = 4;

/**
 * "If the previous plan was overloaded: SIMPLIFY" — implemented literally
 * here: low reported energy or a heavy meeting day (>=4 meetings) caps
 * the day to exactly one deep-work block instead of packing every hour,
 * and adds an explicit "don't add commitments" note rather than silently
 * dropping items.
 */
export function derivePlanShape(input: PlanShapeInput): PlanShape {
  const heavyMeetingDay = input.meetingCount >= HEAVY_MEETING_THRESHOLD;
  const simplify = input.isLowEnergy || heavyMeetingDay;
  const top3 = input.top3Candidates.slice(0, 3);

  const deepWork = simplify
    ? [
        {
          label: top3[0] ?? "Highest-priority item",
          reason: input.isLowEnergy ? "Low reported energy — one focused block, not a packed day." : "Heavy meeting day — protect one block only.",
        },
      ]
    : top3.slice(0, 2).map((item) => ({ label: item, reason: "Top-3 outcome for today." }));

  return {
    simplify,
    top3: top3.length ? top3 : ["No standing priority found — set today's Top 3 manually."],
    deepWork,
    lightTasks: input.dueSoonItems.slice(0, 3),
    whatToAvoid: simplify ? "Do not add new commitments today — protect recovery time." : undefined,
    healthNote: input.isLowEnergy ? "Energy reported low last review — avoid stacking evening commitments." : undefined,
  };
}
