import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { listMembershipsForUser } from "@/lib/tenants/repository";
import { auditIntakeMissingFields } from "@/lib/audit/customer-state";
import { buildBrandBrainContentFromAuditIntake, isBrandBrainCurrentForAudit } from "@/lib/audit/brand-brain";
import { getCurrentBrandBrain, saveBrandBrainVersion } from "@stratxcel/brand-brain";
import { resolveAuditBudgetLimitUsd } from "@stratxcel/audit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Phase = "business" | "deep_dive" | "goals";
const VALID_PHASES: Phase[] = ["business", "deep_dive", "goals"];
const MAX_INTAKE_REQUEST_BYTES = 40_000;
const QUESTIONNAIRE_VERSION = "brand_brain_v1";
const VALID_STEP_IDS = new Set([
  "businessName", "onlinePresence", "businessDescription", "businessReach", "location", "majorProducts",
  "priorityOffering", "customerSegments", "customerAgeGroups", "reasonsChosen", "averageSpend",
  "discoveryChannels", "purchaseChannels", "biggestProblem", "primaryGoal", "successDefinition",
  "competitors", "currentMarketing", "bestCustomerSource", "triedAlready", "brandPersonality", "additionalNotes",
]);

const BUSINESS_KEYS = new Set([
  "businessName", "industry", "websiteUrl", "socialLinks", "onlinePresence", "businessDescription",
  "businessType", "yearsOperating", "location", "businessReach", "gstInvoice",
]);
const DEEP_DIVE_KEYS = new Set([
  "businessReach", "location", "majorProducts", "priorityOffering", "customerSegments", "customerAgeGroups",
  "reasonsChosen", "averageSpend", "discoveryChannels", "purchaseChannels", "biggestProblem", "competitors",
  "currentMarketing", "bestCustomerSource", "brandPersonality", "idealCustomers", "pricingRange", "leadSources",
  "salesProcess", "differentiation", "currentProblems", "geographicReach", "runsAds", "adSpend", "sellsOnline",
  "ecommercePlatform",
]);
const GOAL_KEYS = new Set([
  "primaryGoal", "successDefinition", "triedAlready", "additionalNotes", "biggestObstacle", "topPriorities",
  "desiredGeography", "desiredCustomer", "approxBudget", "timeframe",
]);

function filterAllowedData(phase: Phase, data: Record<string, unknown>): Record<string, unknown> {
  const allowed = phase === "business" ? BUSINESS_KEYS : phase === "deep_dive" ? DEEP_DIVE_KEYS : GOAL_KEYS;
  const filtered = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)));
  if (phase === "deep_dive" && Array.isArray(filtered.brandPersonality)) {
    filtered.brandPersonality = [...new Set(filtered.brandPersonality.filter((value): value is string => typeof value === "string"))].slice(0, 3);
  }
  if (phase === "deep_dive" && Array.isArray(filtered.currentMarketing)) {
    const values = [...new Set(filtered.currentMarketing.filter((value): value is string => typeof value === "string"))];
    filtered.currentMarketing = values.includes("nothing") ? ["nothing"] : values;
  }
  return filtered;
}

interface IntakeBody {
  phase?: Phase;
  data?: Record<string, unknown>;
  stepId?: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeStepId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return VALID_STEP_IDS.has(trimmed) ? trimmed : null;
}

async function readIntakeBody(request: Request): Promise<IntakeBody | Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INTAKE_REQUEST_BYTES) {
    return Response.json({ error: "This answer is too large. Please shorten it and try again." }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let received = 0;
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_INTAKE_REQUEST_BYTES) {
      await reader.cancel();
      return Response.json({ error: "This answer is too large. Please shorten it and try again." }, { status: 413 });
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();

  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return objectValue(parsed) as IntakeBody;
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
}

/**
 * Saves one conversational Brand Brain answer at a time. The client still
 * sends one of the existing storage phases so this remains migration-free:
 * audit_orders keeps the raw paid-Audit intake while the final POST turns the
 * completed answers into one versioned tenant Brand Brain.
 *
 * tenantId is never accepted from the client. All writes are resolved from
 * the authenticated user's tenant membership and remain blocked until the
 * ₹999 payment is actually confirmed.
 */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const parsedBody = await readIntakeBody(request);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody;
  if (!body.phase || !VALID_PHASES.includes(body.phase)) {
    return Response.json({ error: "phase must be one of business, deep_dive, goals" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return Response.json({ error: "data is required" }, { status: 400 });
  }
  const memberships = await listMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) return Response.json({ error: "No workspace found" }, { status: 404 });
  const tenantId = memberships[0].tenant.id;

  const { supabase: service } = getTenantServiceContext();
  const { data: order } = await service
    .from("audit_orders")
    .select("id, status, deep_dive_answers, goals_answers")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) return Response.json({ error: "No audit found for this workspace" }, { status: 404 });
  if (order.status === "pending_payment") {
    return Response.json({ error: "Payment has not been confirmed for this audit yet" }, { status: 402 });
  }
  if (order.status !== "paid") {
    return Response.json({ error: "Your Brand Brain can no longer be edited after the Audit has started" }, { status: 409 });
  }

  const d = filterAllowedData(body.phase, body.data as Record<string, unknown>);
  const now = new Date().toISOString();
  const currentDeepDive = objectValue(order.deep_dive_answers);
  const currentGoals = objectValue(order.goals_answers);
  const patch: Record<string, unknown> = { updated_at: now };
  let nextDeepDive = { ...currentDeepDive };

  if (body.phase === "business") {
    if (typeof d.businessName === "string" && d.businessName.trim()) patch.business_name = d.businessName.trim().slice(0, 240);
    if (typeof d.industry === "string") patch.industry = d.industry.trim().slice(0, 160) || null;
    if (typeof d.websiteUrl === "string") patch.website_url = d.websiteUrl.trim().slice(0, 1_000) || null;
    if (Array.isArray(d.socialLinks)) {
      patch.social_links = d.socialLinks
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().slice(0, 1_000))
        .filter(Boolean)
        .slice(0, 12);
    }

    // Every other business-stage answer is business context, not a new DB
    // column. Keep it in the paid intake JSON so the final Brand Brain mapper
    // sees exactly what the customer supplied.
    const directColumns = new Set(["businessName", "industry", "websiteUrl", "socialLinks"]);
    for (const [key, value] of Object.entries(d)) {
      if (!directColumns.has(key)) nextDeepDive[key] = value;
    }
  } else if (body.phase === "deep_dive") {
    nextDeepDive = { ...nextDeepDive, ...d };
  } else {
    patch.goals_answers = { ...currentGoals, ...d };
  }

  if (nextDeepDive.businessReach === "online_anywhere") nextDeepDive.location = "";

  const stepId = safeStepId(body.stepId);
  const currentMeta = objectValue(nextDeepDive.intakeMeta);
  nextDeepDive.intakeMeta = {
    ...currentMeta,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    ...(stepId ? { lastStepId: stepId } : {}),
    startedAt: typeof currentMeta.startedAt === "string" ? currentMeta.startedAt : now,
    updatedAt: now,
  };
  patch.deep_dive_answers = nextDeepDive;

  const { data: updated, error } = await service
    .from("audit_orders")
    .update(patch)
    .eq("id", order.id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("audit intake: save failed", error.message);
    return Response.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
  if (!updated) {
    return Response.json({ error: "Your Brand Brain can no longer be edited after the Audit has started" }, { status: 409 });
  }

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Finalizes the conversational intake. It first creates ONE versioned Brand
 * Brain from the full paid customer intake, preserving any existing Brand
 * Brain keys (for example rules/pillars) while updating the business context.
 * Only after that succeeds does the Audit move to in_review.
 *
 * The automatic report-generation engine is a separate release gate; this
 * route does not fabricate a report or mark an Audit completed.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const memberships = await listMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) return Response.json({ error: "No workspace found" }, { status: 404 });
  const tenantId = memberships[0].tenant.id;

  const { supabase: service } = getTenantServiceContext();
  const { data: order } = await service
    .from("audit_orders")
    .select("id, status, business_name, industry, website_url, social_links, deep_dive_answers, goals_answers")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) return Response.json({ error: "No audit found for this workspace" }, { status: 404 });
  const automationEnabled = process.env.AUDIT_AUTOMATION_ENABLED === "true";
  if (order.status !== "paid" && !(automationEnabled && order.status === "in_review")) {
    return Response.json({ error: `Audit cannot be started from status '${order.status}'` }, { status: 409 });
  }

  const missingFields = auditIntakeMissingFields(order);
  if (missingFields.length > 0) {
    return Response.json(
      { error: "A few required business questions are still missing", code: "INCOMPLETE_AUDIT_INTAKE", missingFields },
      { status: 422 },
    );
  }

  try {
    const existingBrain = await getCurrentBrandBrain(service, tenantId);
    const content = buildBrandBrainContentFromAuditIntake(order, existingBrain?.content ?? null);
    const currentForAudit = existingBrain && isBrandBrainCurrentForAudit(order, existingBrain.content);
    if (order.status === "in_review" && !currentForAudit) {
      return Response.json(
        { error: "The Audit has already started with a different Business Profile version." },
        { status: 409 },
      );
    }
    const version = currentForAudit
      ? { version: existingBrain!.current_version }
      : await saveBrandBrainVersion(service, {
          tenantId,
          content,
          createdBy: user.id,
        });

    if (automationEnabled) {
      const { data: started, error: startError } = await service.rpc(
        "start_automatic_audit_generation_v1",
        {
          p_audit_order_id: order.id,
          p_expected_tenant_id: tenantId,
          p_brand_brain_version: version.version,
          p_budget_limit_usd: resolveAuditBudgetLimitUsd(),
        },
      );
      const result = started as {
        success?: boolean;
        reason?: string;
        run_id?: string;
        queue_job_id?: string;
        reused?: boolean;
      } | null;
      if (startError || result?.success !== true) {
        console.error("audit intake: automatic enqueue failed", startError?.message ?? result?.reason);
        return Response.json(
          {
            error: "Your Business Profile was saved, but automatic Audit processing could not start. The team has been notified.",
            code: result?.reason ?? "AUTOMATIC_AUDIT_ENQUEUE_FAILED",
          },
          { status: 503 },
        );
      }
      return Response.json(
        {
          ok: true,
          brandBrainVersion: version.version,
          automation: {
            status: "QUEUED",
            runId: result.run_id,
            queueJobId: result.queue_job_id,
            reused: result.reused === true,
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date().toISOString();
    const deepDive = objectValue(order.deep_dive_answers);
    const intakeMeta = objectValue(deepDive.intakeMeta);
    const { data: updated, error } = await service
      .from("audit_orders")
      .update({
        status: "in_review",
        deep_dive_answers: {
          ...deepDive,
          intakeMeta: {
            ...intakeMeta,
            questionnaireVersion: QUESTIONNAIRE_VERSION,
            completedAt: now,
            brandBrainVersion: version.version,
          },
        },
        updated_at: now,
      })
      .eq("id", order.id)
      .eq("status", "paid")
      .select("id")
      .maybeSingle();

    if (error || !updated) {
      console.error("audit intake: failed to transition after Brand Brain save", error?.message);
      return Response.json({ error: "Your Brand Brain was saved, but the Audit could not start. Please retry." }, { status: 409 });
    }

    return Response.json(
      { ok: true, brandBrainVersion: version.version },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Brand Brain error";
    console.error("audit intake: Brand Brain finalization failed", message);
    return Response.json({ error: "Could not finish your Business Profile. Your saved answers are safe; please try again." }, { status: 500 });
  }
}
