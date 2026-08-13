import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientContext } from "@/lib/tenants/client-context";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { JourneyPanel } from "./JourneyPanel";
import { deriveJourney, nextAction } from "@/lib/journey/progress";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";

async function loadJourneyInput(supabase: SupabaseClient, tenantId: string) {
  const service = getTenantServiceContext().supabase;
  const [user, order, consultation, eligibility] = await Promise.all([
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        return data.user ? { emailVerified: Boolean(data.user.email_confirmed_at) } : null;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const currentOrderId = await resolveCurrentAuditOrderId(service, tenantId);
        if (currentOrderId === null) return null;
        let query = service
          .from("audit_orders")
          .select("status, business_name, industry, website_url, deep_dive_answers, goals_answers, report_data")
          .eq("tenant_id", tenantId);
        if (typeof currentOrderId === "string") query = query.eq("id", currentOrderId);
        else query = query.order("created_at", { ascending: false }).limit(1);
        const { data } = await query.maybeSingle();
        return data;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase
          .from("audit_events")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("action", "journey.consultation_requested")
          .limit(1);
        return (data?.length ?? 0) > 0;
      } catch {
        return false;
      }
    })(),
    (async () => {
      const result = await service.rpc("tenant_has_fresh_audit_grant", { p_tenant_id: tenantId });
      return result.data === true;
    })(),
  ]);

  return { account: user, order, consultationRequested: consultation, freshAuditEligible: eligibility };
}

/**
 * V1 customer Command Center. The generic mission store also contains
 * internal platform operations and has no customer-audience discriminator,
 * so it is deliberately excluded until that provenance boundary exists.
 * The Audit journey is tenant-scoped and is the production customer flow.
 */
export default async function ClientCommandCenterPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const active = ctx.workspaceTenant;

  const journeyInput = await loadJourneyInput(ctx.supabase, active.tenantId);

  const stages = deriveJourney(journeyInput);
  const next = nextAction(stages);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Command Center</h1>
        <p className="text-sm text-sx-text-muted">
          {active.name} <span className="text-sx-text-subtle">·</span> what Stratxcel is doing for you
        </p>
      </header>

      {/* Audit purchase, Brand Brain intake, generation, report, and next action. */}
      <JourneyPanel stages={stages} next={next} tenantId={active.tenantId} />
    </div>
  );
}
