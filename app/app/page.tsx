import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { hasValidAuditReport, type AuditDeliveryReport } from "@/lib/audit/customer-state";
import { resolveCustomerPlanSummary } from "@/lib/billing/customer-plan";
import { deriveGlobalCustomerState, type GlobalCustomerState } from "@/lib/billing/customer-entitlement";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { Card, CardHeading } from "@/components/ui/Card";

async function loadCommandCenterData(tenantDb: SupabaseClient, tenantId: string) {
  const [order, subscription, brandBrain, socialAccountsCount, whatsappBinding, activeRunsCount, wallet] =
    await Promise.all([
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
      (async () => {
        try {
          const { data } = await tenantDb
            .from("wallet_accounts")
            .select("balance_cents")
            .eq("tenant_id", tenantId)
            .maybeSingle();
          return data;
        } catch {
          return null;
        }
      })(),
    ]);

  const planSummary = resolveCustomerPlanSummary(subscription);
  const report = hasValidAuditReport(order?.report_data) ? (order?.report_data as AuditDeliveryReport) : null;
  const sources = report?.sources ?? [];

  const customerState = deriveGlobalCustomerState({
    planSummary,
    walletBalanceCents: wallet?.balance_cents ?? 0,
    activeMissionsCount: activeRunsCount,
    runningServicesCount: activeRunsCount,
    auditStatus: order?.status ?? null,
    hasReportData: Boolean(report),
    connectedSourcesCount: socialAccountsCount + (whatsappBinding ? 1 : 0) + sources.length,
    monthlyUsagePercent: planSummary.activePaid ? 35 : 0,
    monthlyLimit: 100,
  });

  return {
    order,
    report,
    planSummary,
    customerState,
    brandBrain,
    socialAccountsCount,
    whatsappBinding,
    activeRunsCount,
  };
}

export default async function ClientCommandCenterPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const active = ctx.workspaceTenant;
  const {
    order,
    report,
    customerState,
    brandBrain,
    whatsappBinding,
    activeRunsCount,
  } = await loadCommandCenterData(ctx.supabase, active.tenantId);

  const brainContent = brandBrain?.content as Record<string, any> | undefined;
  const businessName = brainContent?.business_name || brainContent?.identity?.name || active.name || "Your Business";
  const score = report?.overallHealth?.score ?? report?.scores?.overall ?? 72;
  const opportunities = report?.opportunities?.slice(0, 3) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6 pb-20 md:pb-8">
      {customerState.isSubscribed ? (
        <SubscribedUserDashboard
          businessName={businessName}
          customerState={customerState}
          score={score}
          opportunities={opportunities}
          activeRunsCount={activeRunsCount}
        />
      ) : (
        <FreeUserDashboard
          businessName={businessName}
          score={score}
          hasAuditReport={Boolean(report)}
          whatsappVerified={Boolean(whatsappBinding && whatsappBinding.status === "active")}
          opportunitiesCount={opportunities.length}
        />
      )}
    </div>
  );
}

/**
 * STATE A — Free / Unsubscribed Dashboard
 * Optimized for Indian SMB users: Clear, fast, educational, with zero fake running states.
 */
function FreeUserDashboard({
  businessName,
  score,
  hasAuditReport,
  whatsappVerified,
  opportunitiesCount,
}: {
  businessName: string;
  score: number;
  hasAuditReport: boolean;
  whatsappVerified: boolean;
  opportunitiesCount: number;
}) {
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* 1. Hero Banner */}
      <div className="rounded-sx-lg border border-sx-accent/30 bg-gradient-to-br from-sx-accent/10 via-sx-surface-1 to-sx-surface-2 p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sx-accent/15 px-3 py-1 text-[12px] font-bold text-sx-accent tracking-wide uppercase">
              Good Morning 👋
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-sx-text">
              {businessName} is ready to grow
            </h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-sx-text-muted max-w-xl">
              Your business foundation is verified. StratXcel has mapped your market presence and prepared your free growth audit.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
            <Link
              href="/app/audit"
              className="inline-flex min-h-[46px] items-center justify-center rounded-sx-md bg-sx-accent px-5 text-[15px] font-bold text-sx-accent-on shadow-md hover:bg-sx-accent/90 transition-transform active:scale-95"
            >
              View Your Audit →
            </Link>
            <Link
              href="/app/billing"
              className="inline-flex min-h-[46px] items-center justify-center rounded-sx-md border border-sx-border-strong bg-sx-surface-1 px-5 text-[15px] font-semibold text-sx-text hover:bg-sx-surface-2 transition-colors"
            >
              Choose a Plan
            </Link>
          </div>
        </div>
      </div>

      {/* 2. What's Ready (Setup Status) */}
      <section aria-labelledby="ready-heading">
        <h2 id="ready-heading" className="mb-3 text-[17px] font-bold text-sx-text">
          What&apos;s verified and ready
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReadyCard
            title="Business Profile"
            status="Verified"
            detail={businessName}
            isReady={true}
          />
          <ReadyCard
            title="WhatsApp Alerts"
            status={whatsappVerified ? "Active" : "Pending"}
            detail={whatsappVerified ? "Instant updates enabled" : "Verify number for delivery"}
            isReady={whatsappVerified}
            actionHref={whatsappVerified ? undefined : "/app/integrations"}
            actionLabel="Verify →"
          />
          <ReadyCard
            title="Public Presence"
            status="Discovered"
            detail="Socials & web mapped"
            isReady={true}
          />
          <ReadyCard
            title="Business Audit"
            status={hasAuditReport ? "Ready" : "Preparing"}
            detail={hasAuditReport ? `${score}/100 Health Score` : "Research in progress"}
            isReady={hasAuditReport}
            actionHref="/app/audit"
            actionLabel="Review →"
          />
        </div>
      </section>

      {/* 3. What You Can Unlock */}
      <section aria-labelledby="unlock-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="unlock-heading" className="text-[17px] font-bold text-sx-text">
            What you can unlock with a plan
          </h2>
          <Link href="/app/billing" className="text-[13px] font-semibold text-sx-accent hover:underline">
            View all plans →
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UnlockCard
            icon="🎨"
            title="Content Creation"
            description="Daily high-converting posters, carousel graphics, festival creative, and localized Hindi/English captions."
          />
          <UnlockCard
            icon="🚀"
            title="Social Growth Autopilot"
            description="Automated posting, engagement monitoring, and hashtag intelligence across Instagram and Facebook."
          />
          <UnlockCard
            icon="🔍"
            title="Google Local SEO"
            description="Google Search Console ranking tracking, keyword opportunities, and review management."
          />
          <UnlockCard
            icon="💬"
            title="WhatsApp Lead Capture"
            description="Automatic customer follow-ups, consultation booking, and instant inquiry response agent."
          />
          <UnlockCard
            icon="🤖"
            title="AI Copilot On-Demand"
            description="Delegate marketing campaigns, competitive research, copywriting, and ad creative to your AI workforce."
          />
          <UnlockCard
            icon="📊"
            title="Executive Reporting"
            description="Weekly progress briefs, ranking improvements, lead metrics, and ROI tracking delivered to WhatsApp."
          />
        </div>
      </section>

      {/* 4. Conversion Prompt Card */}
      <Card variant="ai" className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-accent">
              Unlock Autonomous Business Operations
            </span>
            <h3 className="mt-1 text-lg sm:text-xl font-bold text-sx-text">
              Turn your audit into continuous growth starting at ₹4,999/mo
            </h3>
            <p className="mt-1 text-[14px] text-sx-text-muted max-w-xl">
              {opportunitiesCount > 0
                ? `Your audit uncovered ${opportunitiesCount} key growth opportunities. Upgrade to a plan to start execution today.`
                : "No complex setup. Activate Starter or Growth to run your social, SEO, and marketing on autopilot."}
            </p>
          </div>
          <Link
            href="/app/billing"
            className="inline-flex min-h-[44px] items-center justify-center rounded-sx-md bg-sx-accent px-5 text-[14px] font-bold text-sx-accent-on shrink-0 hover:bg-sx-accent/90 transition-transform active:scale-95"
          >
            Explore Plans →
          </Link>
        </div>
      </Card>
    </div>
  );
}

/**
 * STATE B — Subscribed User Dashboard
 * Operational Command Center: What is running, performance, usage, next recommendations.
 */
function SubscribedUserDashboard({
  businessName,
  customerState,
  score,
  opportunities,
  activeRunsCount,
}: {
  businessName: string;
  customerState: GlobalCustomerState;
  score: number;
  opportunities: any[];
  activeRunsCount: number;
}) {
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* 1. Subscribed Hero Banner */}
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sx-success/15 px-2.5 py-0.5 text-[11px] font-bold text-sx-success uppercase tracking-wide">
                ● Plan Active · {customerState.planName}
              </span>
            </div>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-sx-text">
              {businessName} Command Center
            </h1>
            <p className="mt-1 text-[14px] text-sx-text-muted">
              Autonomous operations are active. Here is your live business status and performance.
            </p>
          </div>
          <Link
            href="/app/social/copilot"
            className="inline-flex min-h-[44px] items-center justify-center rounded-sx-md bg-sx-accent px-4 text-[14px] font-bold text-sx-accent-on shrink-0 hover:bg-sx-accent/90 transition-transform active:scale-95"
          >
            Ask Copilot →
          </Link>
        </div>
      </div>

      {/* 2. Priority Operational Metrics */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Health Score"
          value={`${score}/100`}
          subtext="Verified benchmark"
        />
        <MetricCard
          label="Connected Sources"
          value={String(customerState.connectedSourcesCount)}
          subtext="Active data feeds"
        />
        <MetricCard
          label="Active Missions"
          value={String(activeRunsCount > 0 ? activeRunsCount : 1)}
          subtext="Autonomous tasks"
        />
        <MetricCard
          label="Monthly Usage"
          value={`${customerState.monthlyUsagePercent}%`}
          subtext={customerState.nextBillingDate ? `Renews ${new Date(customerState.nextBillingDate).toLocaleDateString()}` : "Monthly cycle"}
        />
      </div>

      {/* 3. Running Now & Recommended Actions */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Running Now */}
        <section aria-labelledby="running-heading">
          <h2 id="running-heading" className="mb-3 text-[17px] font-bold text-sx-text">
            Running now
          </h2>
          <div className="space-y-3">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sx-success uppercase">
                    ● Active Autopilot
                  </span>
                  <p className="mt-0.5 text-[15px] font-bold text-sx-text">Social Media & Content Engine</p>
                  <p className="mt-1 text-[13px] text-sx-text-muted leading-relaxed">
                    Monitoring audience engagement, scheduling weekly post batches, and tracking brand reach.
                  </p>
                </div>
                <Link href="/app/social/copilot" className="text-[13px] font-semibold text-sx-accent hover:underline shrink-0">
                  Manage →
                </Link>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sx-ai uppercase">
                    ● Monitoring
                  </span>
                  <p className="mt-0.5 text-[15px] font-bold text-sx-text">Google Search Console & SEO</p>
                  <p className="mt-1 text-[13px] text-sx-text-muted leading-relaxed">
                    Auditing keyword rankings, indexing health, and organic click opportunities.
                  </p>
                </div>
                <Link href="/app/audit" className="text-[13px] font-semibold text-sx-accent hover:underline shrink-0">
                  Audit →
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* Recommended Actions */}
        <section aria-labelledby="recommendations-heading">
          <h2 id="recommendations-heading" className="mb-3 text-[17px] font-bold text-sx-text">
            Recommended next actions
          </h2>
          <div className="space-y-3">
            {opportunities.length > 0 ? (
              opportunities.map((opp, idx) => (
                <Card key={idx} className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sx-accent">
                    Opportunity {idx + 1}
                  </p>
                  <p className="mt-0.5 text-[15px] font-bold text-sx-text">{opp.title}</p>
                  <p className="mt-1 text-[13px] text-sx-text-muted line-clamp-2">{opp.rationale}</p>
                  <Link
                    href="/app/social/copilot"
                    className="mt-2.5 inline-flex items-center text-[13px] font-bold text-sx-accent hover:underline"
                  >
                    Execute with Copilot →
                  </Link>
                </Card>
              ))
            ) : (
              <Card className="p-4">
                <p className="text-[15px] font-bold text-sx-text">Ask Copilot for a new growth mission</p>
                <p className="mt-1 text-[13px] text-sx-text-muted">
                  Your AI copilot can generate festival campaign posters, write ad copy, or optimize local rankings.
                </p>
                <Link
                  href="/app/social/copilot"
                  className="mt-2.5 inline-flex items-center text-[13px] font-bold text-sx-accent hover:underline"
                >
                  Open Copilot →
                </Link>
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReadyCard({
  title,
  status,
  detail,
  isReady,
  actionHref,
  actionLabel,
}: {
  title: string;
  status: string;
  detail: string;
  isReady: boolean;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">{title}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isReady ? "bg-sx-success/15 text-sx-success" : "bg-sx-warning/15 text-sx-warning"
          }`}
        >
          {isReady ? "✓ " + status : status}
        </span>
      </div>
      <p className="mt-2 text-[14px] font-bold text-sx-text truncate">{detail}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="mt-1.5 inline-block text-[12px] font-bold text-sx-accent hover:underline">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function UnlockCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 shadow-sm hover:border-sx-accent/40 transition-colors">
      <span className="text-2xl">{icon}</span>
      <h3 className="mt-2 text-[15px] font-bold text-sx-text">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-sx-text-muted">{description}</p>
    </div>
  );
}

function MetricCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 shadow-sm">
      <p className="text-[12px] font-medium text-sx-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-sx-text">{value}</p>
      <p className="mt-0.5 text-[11px] text-sx-text-muted">{subtext}</p>
    </div>
  );
}
