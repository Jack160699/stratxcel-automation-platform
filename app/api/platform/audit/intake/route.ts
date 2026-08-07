import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { listMembershipsForUser } from "@/lib/tenants/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Phase = "business" | "deep_dive" | "goals";
const VALID_PHASES: Phase[] = ["business", "deep_dive", "goals"];

interface IntakeBody {
  phase?: Phase;
  data?: Record<string, unknown>;
}

/**
 * Saves one phase of the 3-phase Audit intake against the caller's own
 * tenant's most recent audit_orders row. tenantId is never taken from the
 * client — re-derived from tenant_members every call, same rule every
 * tenant-scoped write in this build follows.
 *
 * Only writable once payment has actually happened: intake on a
 * pending_payment order would let someone fill in "audit" detail they never
 * paid for and have it look identical to a paid one.
 */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as IntakeBody;
  if (!body.phase || !VALID_PHASES.includes(body.phase)) {
    return Response.json({ error: "phase must be one of business, deep_dive, goals" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return Response.json({ error: "data is required" }, { status: 400 });
  }

  const memberships = await listMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) return Response.json({ error: "No workspace found" }, { status: 404 });
  const tenantId = memberships[0].tenant.id;

  const { supabase: service } = getTenantServiceContext();
  const { data: order } = await service
    .from("audit_orders")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) return Response.json({ error: "No audit found for this workspace" }, { status: 404 });
  if (order.status === "pending_payment") {
    return Response.json({ error: "Payment has not been confirmed for this audit yet" }, { status: 402 });
  }

  const d = body.data as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.phase === "business") {
    if (typeof d.businessName === "string" && d.businessName.trim()) patch.business_name = d.businessName.trim();
    if (typeof d.industry === "string") patch.industry = d.industry.trim() || null;
    if (typeof d.websiteUrl === "string") patch.website_url = d.websiteUrl.trim() || null;
    if (Array.isArray(d.socialLinks)) patch.social_links = d.socialLinks.filter((s) => typeof s === "string" && s.trim());
    // businessType, yearsOperating, location and an optional GST-invoice
    // block travel with deep_dive_answers to avoid extra jsonb columns for a
    // handful of Phase 1 extras.
    if (d.businessType || d.yearsOperating || d.location || d.gstInvoice) {
      const { data: current } = await service.from("audit_orders").select("deep_dive_answers").eq("id", order.id).single();
      patch.deep_dive_answers = {
        ...(current?.deep_dive_answers ?? {}),
        ...(d.businessType ? { businessType: d.businessType } : {}),
        ...(d.yearsOperating ? { yearsOperating: d.yearsOperating } : {}),
        ...(d.location ? { location: d.location } : {}),
        ...(d.gstInvoice ? { gstInvoice: d.gstInvoice } : {}),
      };
    }
  } else if (body.phase === "deep_dive") {
    const { data: current } = await service.from("audit_orders").select("deep_dive_answers").eq("id", order.id).single();
    patch.deep_dive_answers = { ...(current?.deep_dive_answers ?? {}), ...d };
  } else {
    const { data: current } = await service.from("audit_orders").select("goals_answers").eq("id", order.id).single();
    patch.goals_answers = { ...(current?.goals_answers ?? {}), ...d };
  }

  const { error } = await service.from("audit_orders").update(patch).eq("id", order.id);
  if (error) {
    console.error("audit intake: save failed", error.message);
    return Response.json({ error: "Could not save. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Moves a fully-intaken audit from 'paid' to 'in_review' — the truthful
 * "processing" state. This never claims completion; only staff completing
 * the audit (existing complete_audit_and_issue_subscription_credit RPC)
 * ever sets 'completed'.
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
    .select("id, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) return Response.json({ error: "No audit found for this workspace" }, { status: 404 });
  if (order.status !== "paid") {
    return Response.json({ error: `Audit cannot be started from status '${order.status}'` }, { status: 409 });
  }

  const { error } = await service
    .from("audit_orders")
    .update({ status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", order.id);
  if (error) return Response.json({ error: "Could not start audit. Please try again." }, { status: 500 });

  return Response.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
