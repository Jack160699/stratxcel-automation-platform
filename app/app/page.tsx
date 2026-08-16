import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { hasValidAuditReport, type AuditDeliveryReport } from "@/lib/audit/customer-state";
import { resolveCustomerPlanSummary } from "@/lib/billing/customer-plan";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { deriveBusinessJourney } from "@/lib/journey/business-journey";
import { BusinessJourneyHeader } from "@/components/journey/BusinessJourneyHeader";
import { AchievementMoment } from "@/components/journey/AchievementMoment";
import { Card, CardHeading } from "@/components/ui/Card";

async function loadCommandCenter(tenantDb: SupabaseClient, tenantId: string) {
  const [order, subscription, brandBrain, socialAccountsCount, whatsappBinding, activeRunsCount] = await Promise.all([
    (async () => {
      try {
        const currentOrderId = await resolveCurrentAuditOrderId(tenantDb, tenantId);
        if (currentOrderId === null) return null;
        let query = tenantDb
          .from("audit_orders")
          .select("id, status, business_name, website_url, report_data, created_at, updated_at")
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
        const { data } = await tenantDb
          .from("subscriptions")
          .select("plan_tier, status, provider_status, current_period_end, next_charge_at, price_cents")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data;
      } catch {
        return null;
      }
    })(),
    getCurrentBrandBrain(tenantDb, tenantId).catch(() => null),
    (async () => {
      try {
        const { count } = await tenantDb
          .from("social_accounts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    (async () => {
      try {
        const { data } = await tenantDb
          .from("whatsapp_phone_bindings")
          .select("status, phone_number")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        return data;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { count } = await tenantDb
          .from("social_agent_runs")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
  ]);

  return {
    order,
    plan: resolveCustomerPlanSummary(subscription),
    brandBrain,
    socialAccountsCount,
    whatsappBinding,
    activeRunsCount,
  };
}

/**
 * Intelligent Business Operating System — Command Center.
 *
 * Provides real-time journey status, what Stratxcel discovered, what changed,
 * what needs attention, active operations, and next best actions.
 */
export default async function ClientCommandCenterPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const active = ctx.workspaceTenant;

  const {
    order,
    plan,
    brandBrain,
    socialAccountsCount,
    whatsappBinding,
    activeRunsCount,
  } = await loadCommandCenter(ctx.supabase, active.tenantId);

  const report = hasValidAuditReport(order?.report_data) ? (order?.report_data as AuditDeliveryReport) : null;
  const opportunities = report?.opportunities?.slice(0, 5) ?? [];
  const risks = report?.priorityRisks ?? [];
  const sources = report?.sources ?? [];
  const score = report?.overallHealth?.score ?? report?.scores?.overall;
  const supportedScore = typeof score === "number" && (score > 0 || sources.length > 0) ? score : null;

  // Real journey derivation
  const brainContent = brandBrain?.content as Record<string, any> | undefined;
  const brainDomain = typeof brainContent?.website_url === "string" ? brainContent.website_url : null;
  const verifiedSocials = Array.isArray(brainContent?.verified_social_links) ? brainContent.verified_social_links.length : socialAccountsCount;
  const brainServices = Array.isArray(brainContent?.services)
    ? (brainContent.services as string[])
    : Array.isArray(brainContent?.offerings?.services)
      ? (brainContent.offerings.services as string[])
      : [];

  const journey = deriveBusinessJourney({
    hasWebsite: Boolean(order?.website_url || brainDomain),
    websiteUrl: order?.website_url || brainDomain,
    brandBrainVersion: brandBrain?.current_version ?? 0,
    socialAccountsCount,
    confirmedSocialsCount: verifiedSocials,
    hasAuditOrder: Boolean(order),
    auditOrderStatus: order?.status,
    hasReportData: Boolean(report),
    reportKind: (order?.report_data as any)?.reportKind,
    whatsappConnected: Boolean(whatsappBinding && whatsappBinding.status === "active"),
    crmLeadsCount: 0,
    hasAutomations: activeRunsCount > 0,
    hasActivePlan: plan.activePaid,
  });

  const nextActions = buildNextActions({ report, planActive: plan.activePaid });

  return (
    <div className="mx-auto flex w-full max-w-6xl xl:max-w-7xl flex-col gap-8 pb-12">
      <h1 className="sr-only">Your business growth command center</h1>
      {/* 1. Business Journey Header */}
      <BusinessJourneyHeader journey={journey} />

      {/* 2. Achievement Moment (if any milestone achieved) */}
      {journey.latestAchievement && (
        <AchievementMoment milestone={journey.latestAchievement} />
      )}

      {/* 3. What We Discovered (Rich Business Intelligence SSOT) */}
      {brandBrain && (
        <section aria-labelledby="discovery-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="discovery-heading" className="text-xl font-semibold text-sx-text">
              What we discovered
            </h2>
            <Link href="/app/brand" className="text-sm font-semibold text-sx-accent hover:underline">
              Edit in Brand Brain →
            </Link>
          </div>
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
                  Business & Industry
                </p>
                <p className="text-sm font-semibold text-sx-text">
                  {brainContent?.business_name || brainContent?.identity?.name || active.name}
                </p>
                <p className="text-xs text-sx-text-muted">
                  {brainContent?.industry || brainContent?.positioning?.industry || "SaaS & Operations"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
                  Operating Model
                </p>
                <p className="text-sm font-semibold text-sx-text">
                  {brainContent?.business_model || brainContent?.positioning?.businessModel || "B2B Subscription / Growth Operations"}
                </p>
                <p className="text-xs text-sx-text-muted">
                  {brainDomain ? `Connected: ${brainDomain}` : "Domain linked"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
                  Audience & Voice
                </p>
                <p className="text-sm font-semibold text-sx-text">
                  {brainContent?.tone_of_voice || brainContent?.voice?.tone || "Professional & Customer-Focused"}
                </p>
                <p className="text-xs text-sx-text-muted">
                  {brainContent?.target_audience || brainContent?.positioning?.targetAudience || "Growing business customers"}
                </p>
              </div>
            </div>

            {brainServices.length > 0 && (
              <div className="mt-4 pt-3 border-t border-sx-border/60">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-sx-text-subtle mb-1.5">
                  Core Offerings & Services:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {brainServices.slice(0, 6).map((service: string, i: number) => (
                    <span key={i} className="inline-flex items-center rounded-full bg-sx-surface-2 px-2.5 py-0.5 text-xs text-sx-text">
                      {service}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* 4. Business Impact Summary */}
      <section aria-labelledby="impact-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 id="impact-heading" className="text-xl font-semibold text-sx-text">Business impact summary</h2>
          <Link href="/app/audit" className="text-sm font-semibold text-sx-accent hover:underline">View Audit / Launch Plan</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ImpactCard label="Business health" value={supportedScore === null ? "Not enough verified data" : `${supportedScore}/100`} />
          <ImpactCard label="Growth opportunities" value={opportunities.length > 0 ? String(opportunities.length) : "Not enough verified data"} />
          <ImpactCard label="Priority risks" value={risks.length > 0 ? String(risks.length) : "Not enough verified data"} />
        </div>
      </section>

      {/* 5. Main Split View: Opportunities / What Changed / What Needs Attention */}
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
          {/* What Changed */}
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

          {/* What Needs Attention */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-sx-text">What needs attention</h2>
            <Card>
              <div className="space-y-3 text-xs">
                {!whatsappBinding && (
                  <div className="flex items-start justify-between gap-2 border-b border-sx-border pb-2.5">
                    <div>
                      <p className="font-semibold text-sx-text">Verify WhatsApp Number</p>
                      <p className="text-sx-text-muted">Verify your phone number to receive instant alerts.</p>
                    </div>
                    <Link href="/app/integrations" className="font-semibold text-sx-accent hover:underline">
                      Verify →
                    </Link>
                  </div>
                )}
                {socialAccountsCount === 0 && (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sx-text">Confirm Social Channels</p>
                      <p className="text-sx-text-muted">Link verified Instagram and Facebook handles.</p>
                    </div>
                    <Link href="/app/integrations" className="font-semibold text-sx-accent hover:underline">
                      Connect →
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* Next Best Actions */}
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

          {/* Current Plan Card */}
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
  const actions = [{ label: report ? "Review your Audit / Launch Plan" : "Start your Business Growth Audit", href: "/app/audit" }];
  actions.push({ label: "Review verified Brand Brain", href: "/app/brand" });
  actions.push({ label: "Check business connectors", href: "/app/integrations" });
  actions.push({ label: planActive ? "Open Copilot" : "Explore Growth", href: planActive ? "/app/social/copilot" : "/app/billing" });
  return actions;
}
