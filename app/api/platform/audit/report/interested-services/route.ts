import { ownedCompletedAudit } from "../_owned";
import { recommendGoalKeysFromCategoryScores } from "@/lib/audit/service-preselection";
import { BUSINESS_GOAL_KEYS } from "@/lib/audit/business-goal-keys";

/**
 * Final Customer Experience Repair mission, Section 4 (Audit Service
 * Auto-Preselection). Reuses ownedCompletedAudit -- the exact same
 * ownership/completion gate the WhatsApp-send route already uses -- and
 * stores the selection in the existing audit_orders.goals_answers JSONB
 * (already used by the intake flow for the pre-audit goals step) under
 * its own key, rather than a new table.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const goalsAnswers = (ctx.order.goals_answers as Record<string, unknown> | null) ?? {};
  const reportData = (ctx.order.report_data as Record<string, unknown> | null) ?? {};
  const categoryScores = reportData.categoryScores as Parameters<typeof recommendGoalKeysFromCategoryScores>[0];
  const recommended = recommendGoalKeysFromCategoryScores(categoryScores);
  const saved = Array.isArray(goalsAnswers.interestedServices)
    ? (goalsAnswers.interestedServices as unknown[]).filter((v): v is string => typeof v === "string" && (BUSINESS_GOAL_KEYS as readonly string[]).includes(v))
    : null;
  return Response.json(
    { recommended, selected: saved ?? recommended },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { selected?: unknown };
  if (!Array.isArray(body.selected)) {
    return Response.json({ error: "selected must be an array of service keys." }, { status: 400 });
  }
  // Never trust an unknown key -- only the real, existing goal vocabulary.
  const selected = body.selected.filter((v): v is string => typeof v === "string" && (BUSINESS_GOAL_KEYS as readonly string[]).includes(v));
  const existingGoalsAnswers = (ctx.order.goals_answers as Record<string, unknown> | null) ?? {};
  const { error } = await ctx.service
    .from("audit_orders")
    .update({ goals_answers: { ...existingGoalsAnswers, interestedServices: selected } })
    .eq("id", ctx.order.id as string)
    .eq("tenant_id", ctx.tenantId);
  if (error) return Response.json({ error: "Could not save your selection." }, { status: 500 });
  return Response.json({ selected }, { headers: { "Cache-Control": "no-store" } });
}
