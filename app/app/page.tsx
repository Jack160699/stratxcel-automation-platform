import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { hasValidAuditReport, type AuditDeliveryReport } from "@/lib/audit/customer-state";
import { resolveCustomerPlanSummary } from "@/lib/billing/customer-plan";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { Card, CardHeading } from "@/components/ui/Card";

async function loadCommandCenter(tenantDb: SupabaseClient, tenantId: string) {
  const [order, subscription, brandBrain] = await Promise.all([
    (async () => {
      try {
        const currentOrderId = await resolveCurrentAuditOrderId(tenantDb, tenantId);
        if (currentOrderId === null) return null;
        let query = tenantDb
          .from("audit_orders")
          .select("status, business_name, website_url, report_data, created_at, updated_at")
          .eq("tenant_id", tenantId);
        if (typeof currentOrderId === "string") query = query.eq("id", currentOrderId);
        else query = query.order("created_at", { ascending: false }).limit(1);
        const { data } = await query.maybeSingle();
        return data;
      } catch {
        return null;
      }
    })(),
    tenantDb
      .from("subscriptions")
      .select("plan_tier, status, provider_status, current_period_end, next_charge_at, price_cents")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((result) => result.data),
    getCurrentBrandBrain(tenantDb, tenantId).catch(() => null),
  ]);

  return { order, plan: resolveCustomerPlanSummary(subscription), brandBrain };
}

/**
 * Results-first customer home. Generic missions remain excluded because the
 * mission store does not yet carry a reliable customer-audience discriminator.
 */
export default async function ClientCommandCenterPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const active = ctx.workspaceTenant;

  const { order, plan, brandBrain } = await loadCommandCenter(ctx.supabase, active.tenantId);
  const report = hasValidAuditReport(order?.report_data) ? (order?.report_data as AuditDeliveryReport) : null;
  const opportunities = report?.opportunities?.slice(0, 5) ?? [];
  const risks = report?.priorityRisks ?? [];
  const sources = report?.sources ?? [];
  const score = report?.overallHealth?.score ?? report?.scores?.overall;
  const supportedScore = typeof score === "number" && (score > 0 || sources.length > 0) ? score : null;
  const nextActions = buildNextActions({ report, planActive: plan.activePaid });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="rounded-[1.25rem] border border-sx-border bg-gradient-to-br from-sx-accent/10 via-sx-surface-1 to-sx-surface-1 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sx-accent">{active.name}</p>
            <h1 className="mt-2 max-w-3xl font-sx-sans text-3xl font-semibold leading-tight text-sx-text sm:text-4xl">
              Your business growth command center
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-sx-text-muted">
              See what Stratxcel found, what changed, and what to do next.
            </p>
          </div>
          <Link href="/app/social/copilot" className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-5 text-sm font-bold text-sx-accent-on">
            Open Copilot
          </Link>
        </div>
      </header>

      <section aria-labelledby="impact-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 id="impact-heading" className="text-xl font-semibold text-sx-text">Business impact summary</h2>
          <Link href="/app/audit" className="text-sm font-semibold text-sx-accent hover:underline">View Audit</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ImpactCard label="Business health" value={supportedScore === null ? "Not enough verified data" : `${supportedScore}/100`} />
          <ImpactCard label="Growth opportunities" value={opportunities.length > 0 ? String(opportunities.length) : "Not enough verified data"} />
          <ImpactCard label="Priority risks" value={risks.length > 0 ? String(risks.length) : "Not enough verified data"} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h2 className="mb-3 text-xl font-semibold text-sx-text">Biggest opportunities</h2>
          {opportunities.length > 0 ? (
            <div className="space-y-3">
              {opportunities.map((opportunity, index) => (
                <Card key={`${opportunity.title}-${index}`} variant={index === 0 ? "ai" : "panel"}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sx-accent">Opportunity {index + 1}</p>
                      <CardHeading className="mt-1 text-lg sm:text-base">{opportunity.title}</CardHeading>
                    </div>
                    <span className="rounded-full bg-sx-accent/10 px-2.5 py-1 text-xs font-semibold text-sx-accent">Audit</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-sx-text-muted">{opportunity.rationale}</p>
                  <div className="mt-3 rounded-sx-sm bg-sx-surface-2 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-sx-text-subtle">Recommended action</p>
                    <p className="mt-1 text-sm text-sx-text">{opportunity.nextStep}</p>
                  </div>
                  <Link href="/app/social/copilot" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sx-accent hover:underline">
                    Work on this with Copilot →
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardHeading>No verified opportunities yet</CardHeading>
              <p className="mt-2 text-sm leading-6 text-sx-text-muted">
                {order ? "Your Audit is still being prepared. Verified findings will appear here when the report is ready." : "Connect your business and run the Audit to uncover evidence-backed growth opportunities."}
              </p>
              <Link href="/app/audit" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sx-accent">Open Business Growth Audit →</Link>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-sx-text">What changed</h2>
            <Card>
              <ol className="space-y-4">
                <ChangeItem active={order?.status === "completed"} title="Audit completed" detail={order?.status === "completed" ? "Your report and recommendations are available." : "Your latest Audit has not completed yet."} />
                <ChangeItem active={Boolean(brandBrain)} title="Brand Brain updated" detail={brandBrain ? `Your business context is on version ${brandBrain.current_version}.` : "No verified Brand Brain update yet."} />
                <ChangeItem active={sources.length > 0} title="Business evidence verified" detail={sources.length > 0 ? `${sources.length} verified ${sources.length === 1 ? "source" : "sources"} support your findings.` : "No verified evidence count is available yet."} />
                <ChangeItem active={Boolean(report)} title="Recommendations generated" detail={report ? "Your growth recommendations are ready to review." : "Recommendations will appear after the Audit completes."} />
              </ol>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-sx-text">Next best actions</h2>
            <Card>
              <div className="space-y-2">
                {nextActions.map((action) => (
                  <Link key={action.label} href={action.href} className="flex min-h-12 items-center justify-between rounded-sx-sm border border-sx-border px-3 text-sm font-semibold text-sx-text hover:bg-sx-surface-2">
                    {action.label} <span className="text-sx-accent">→</span>
                  </Link>
                ))}
              </div>
            </Card>
          </section>

          <Card variant={plan.activePaid ? "elevated" : "ai"}>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sx-accent">Current plan · {plan.name}</p>
            <CardHeading className="mt-2">{plan.activePaid ? `You’re operating on ${plan.name}` : "Unlock ongoing execution with Growth"}</CardHeading>
            <p className="mt-2 text-sm leading-6 text-sx-text-muted">
              {plan.activePaid
                ? "Use Copilot to turn your findings into ongoing missions and measurable improvements."
                : report
                  ? `Your Audit found ${opportunities.length} evidence-backed ${opportunities.length === 1 ? "opportunity" : "opportunities"}. Growth turns those findings into ongoing execution.`
                  : "Start with the Audit, then use Growth for ongoing planning, execution, and improvement."}
            </p>
            <Link href="/app/billing" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sx-accent hover:underline">
              {plan.activePaid ? "Manage plan" : "Explore Growth"} →
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}

function ImpactCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-h-28">
      <p className="text-sm font-medium text-sx-text-muted">{label}</p>
      <p className={`mt-3 font-sx-sans font-semibold text-sx-text ${value.startsWith("Not enough") ? "text-base" : "text-3xl"}`}>{value}</p>
    </Card>
  );
}

function ChangeItem({ active, title, detail }: { active: boolean; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-sx-success" : "border border-sx-border-strong bg-sx-surface-2"}`} />
      <div>
        <p className="text-sm font-semibold text-sx-text">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-sx-text-muted">{detail}</p>
      </div>
    </li>
  );
}

function buildNextActions({ report, planActive }: { report: AuditDeliveryReport | null; planActive: boolean }) {
  const actions = [{ label: report ? "Review your Audit" : "Start your Business Growth Audit", href: "/app/audit" }];
  actions.push({ label: "Review verified Brand Brain", href: "/app/brand" });
  actions.push({ label: "Check business connectors", href: "/app/integrations" });
  actions.push({ label: planActive ? "Open Copilot" : "Explore Growth", href: planActive ? "/app/social/copilot" : "/app/billing" });
  return actions;
}
