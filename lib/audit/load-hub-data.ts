import { type SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { isMissingRelation, resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { loadAuditWhatsAppDestination, toPublicDestination } from "@/lib/audit/v1/whatsapp-destination";
import { resolveAuditBudgetLimitUsd } from "@stratxcel/audit-engine";
import { getBusinessConnectionStatus } from "@/lib/connectors/canonical-status";

export interface AuditHubData {
  order: Record<string, unknown> | null;
  tenantId: string;
  paymentUrl: string | null;
  generation: Record<string, unknown> | null;
  freshAuditEligible: boolean;
  whatsappDestination: { masked: string; countryIso: string; nationalNumber: string; consent: boolean } | null;
  brandBrain: Record<string, unknown> | null;
  googleBusinessConnectionState: string;
}

export async function loadAuditHubData(
  supabase: SupabaseClient,
  tenantId: string,
  serviceDb?: SupabaseClient
): Promise<AuditHubData> {
  const db = serviceDb ?? supabase;
  const [currentOrderId, eligibilityResult, destination, brandBrain, googleStatus] = await Promise.all([
    resolveCurrentAuditOrderId(db, tenantId),
    db.rpc("tenant_has_fresh_audit_grant", { p_tenant_id: tenantId }),
    loadAuditWhatsAppDestination(db, tenantId),
    getCurrentBrandBrain(db, tenantId).catch(() => null),
    getBusinessConnectionStatus(db, tenantId, "google_business")
      .then((status) => status.connectionState)
      .catch(() => "NOT_CONNECTED" as const),
  ]);

  let visibleOrder: Record<string, unknown> | null = null;
  if (currentOrderId !== null) {
    let orderQuery = db
      .from("audit_orders")
      .select(
        "id, status, business_name, industry, website_url, social_links, goals, deep_dive_answers, goals_answers, report_data, audit_completed_at, payment_link_id, fulfilment_source, actual_paid_cents, discount_cents"
      )
      .eq("tenant_id", tenantId);
    if (typeof currentOrderId === "string") {
      orderQuery = orderQuery.eq("id", currentOrderId);
    } else {
      orderQuery = orderQuery.order("created_at", { ascending: false }).limit(1);
    }
    const { data: order } = await orderQuery.maybeSingle();
    visibleOrder = (order as Record<string, unknown> | null) ?? null;
  }

  let paymentUrl: string | null = null;
  let generation: Record<string, unknown> | null = null;

  if (visibleOrder?.id) {
    const [linkRes, runRes] = await Promise.all([
      visibleOrder.status === "pending_payment" && visibleOrder.payment_link_id
        ? supabase.from("payment_links").select("short_url, status").eq("id", visibleOrder.payment_link_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("audit_generation_runs")
        .select("id, status, stage, quality_outcome, confidence_band, failure_message_safe, stage_updated_at, heartbeat_at")
        .eq("audit_order_id", visibleOrder.id as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (linkRes.data?.status === "created") paymentUrl = linkRes.data.short_url;
    let run = runRes.data;

    // If order is in_review or paid but no generation run exists yet, start one automatically (service-role only)
    if (!run && (visibleOrder.status === "in_review" || visibleOrder.status === "paid") && brandBrain && serviceDb) {
      try {
        const started = await serviceDb.rpc("start_automatic_audit_generation_v1", {
          p_audit_order_id: visibleOrder.id as string,
          p_expected_tenant_id: tenantId,
          p_brand_brain_version: brandBrain.current_version,
          p_budget_limit_usd: resolveAuditBudgetLimitUsd(),
        });
        const result = started.data as { success?: boolean; run_id?: string } | null;
        if (result?.run_id) {
          const { data: newRun } = await serviceDb
            .from("audit_generation_runs")
            .select("id, status, stage, quality_outcome, confidence_band, failure_message_safe, stage_updated_at, heartbeat_at")
            .eq("id", result.run_id)
            .maybeSingle();
          run = newRun;
        }
      } catch (startErr) {
        console.warn("audit checkout: auto-start generation run trace", startErr);
      }
    }

    generation = run ?? null;
  }

  const eligible = isMissingRelation(eligibilityResult.error) ? false : eligibilityResult.data === true;

  return {
    order: visibleOrder ?? null,
    tenantId,
    paymentUrl,
    generation,
    freshAuditEligible: eligible === true,
    whatsappDestination: destination ? toPublicDestination(destination) : null,
    brandBrain: brandBrain?.content ?? null,
    googleBusinessConnectionState: googleStatus,
  };
}
