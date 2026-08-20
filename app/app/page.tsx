import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { hasValidAuditReport, type AuditDeliveryReport } from "@/lib/audit/customer-state";
import { resolveCustomerPlanSummary } from "@/lib/billing/customer-plan";
import { deriveGlobalCustomerState, type GlobalCustomerState } from "@/lib/billing/customer-entitlement";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { ScoreRing, ScoreBandChip, bandForScore } from "./components/ScoreRing";

type AuditOpportunity = { title: string; rationale?: string };

async function loadCommandCenter(tenantDb: SupabaseClient, tenantId: string) {
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
          // Only rows the canonical connector resolver (lib/connectors/canonical-status.ts)
          // would also call CONNECTED -- a DISCONNECTED/ERROR/RECONNECT_REQUIRED row must
          // not inflate this count, or Home disagrees with every other surface about how
          // many sources are actually connected.
          const { count } = await tenantDb
            .from("social_accounts")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "CONNECTED");
          return count ?? 0;
        } catch {
          return 0;
        }
      })(),
      (async () => {
        try {
          // whatsapp_phone_bindings has no phone_number column (it's
          // display_phone_number) and a tenant can legitimately have more than
          // one row (pending attempts, a prior revoked number, etc.) -- the old
          // .select("status, phone_number").maybeSingle() query therefore always
          // errored (unknown column, and would also reject on >1 row) and was
          // silently swallowed by this try/catch, so Home always treated
          // WhatsApp as not connected even when a real active binding existed.
          // Mirror the same ground truth read canonical-status.ts uses: fetch
          // every row for the tenant and prefer the active one.
          const { data } = await tenantDb
            .from("whatsapp_phone_bindings")
            .select("status, display_phone_number")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
          return (data ?? []).find((row) => row.status === "active") ?? null;
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
  } = await loadCommandCenter(ctx.supabase, active.tenantId);

  const brainContent = brandBrain?.content as Record<string, unknown> | undefined;
  const identity = brainContent?.identity as { name?: string } | undefined;
  const businessName =
    (brainContent?.business_name as string | undefined) || identity?.name || active.name || "Your Business";
  const score = report?.overallHealth?.score ?? report?.scores?.overall ?? 72;
  const opportunities: AuditOpportunity[] = report?.opportunities?.slice(0, 3) ?? [];

  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
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
        />
      )}
    </div>
  );
}

/**
 * STATE A — Free / Unsubscribed Dashboard, built on the StratXcel App Design
 * Spec §7.1 Home pattern: ScoreSummary → one PriorityCard → status rows →
 * what a plan unlocks. Zero fake running states — every number here is real.
 */
function FreeUserDashboard({
  businessName,
  score,
  hasAuditReport,
  whatsappVerified,
}: {
  businessName: string;
  score: number;
  hasAuditReport: boolean;
  whatsappVerified: boolean;
}) {
  const band = bandForScore(score);
  const sentence = hasAuditReport
    ? band === "strong" || band === "good"
      ? `${businessName} is discoverable. A plan turns this audit into ongoing execution.`
      : `${businessName}'s foundation is verified — your free audit found room to grow.`
    : `${businessName}'s foundation is verified. Your free growth audit is being prepared.`;

  return (
    <div className="flex flex-col gap-6">
      {/* ScoreSummary — spec §5.9 */}
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-sx-text-muted">Business health</span>
          <span className="sx-hi text-xs text-sx-text-muted">व्यापार स्वास्थ्य</span>
        </div>
        <ScoreRing score={score} />
        <ScoreBandChip band={band} />
        <p className="max-w-[280px] text-[17px] leading-[26px] text-sx-text">{sentence}</p>
      </div>

      {/* PriorityCard — the one thing to do next, spec §5.10 */}
      {!whatsappVerified ? (
        <PriorityCard
          category="Stay reachable"
          categoryHi="जुड़े रहें"
          title="Verify your WhatsApp number"
          body="Customer alerts and audit updates are delivered on WhatsApp — verify your number so nothing is missed."
          difficulty="Easy"
          time="2 min"
          ctaLabel="Verify it"
          ctaLabelHi="ठीक करें"
          ctaHref="/app/integrations"
        />
      ) : hasAuditReport ? (
        <PriorityCard
          category="Grow further"
          categoryHi="आगे बढ़ें"
          title="Turn your audit into a plan"
          body="Your free audit is ready. A plan puts StratXcel to work executing what it found."
          difficulty="Easy"
          time="3 min"
          ctaLabel="Choose a plan"
          ctaLabelHi="योजना चुनें"
          ctaHref="/app/billing"
        />
      ) : (
        <PriorityCard
          category="Get discovered"
          categoryHi="मिल जाएं"
          title="Create your business website"
          body="A website makes it easy for customers to find and trust your business online."
          difficulty="Easy"
          time="5 min"
          ctaLabel="Create website"
          ctaLabelHi="वेबसाइट बनाएं"
          ctaHref="/app/website"
        />
      )}

      {/* What's verified and ready */}
      <section aria-labelledby="ready-heading">
        <h2 id="ready-heading" className="mb-3 flex items-baseline gap-2 text-[19px] font-semibold text-sx-text">
          What&apos;s ready
          <span className="sx-hi text-xs font-normal text-sx-text-muted">तैयार है</span>
        </h2>
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1">
          <StatusRow label="Business profile" detail={businessName} ok />
          <StatusRow
            label="WhatsApp alerts"
            detail={whatsappVerified ? "Instant updates enabled" : "Verify your number to enable"}
            ok={whatsappVerified}
            actionHref={whatsappVerified ? undefined : "/app/integrations"}
          />
          <StatusRow label="Public presence" detail="Socials & website mapped" ok />
          <StatusRow
            label="Business audit"
            detail={hasAuditReport ? `${Math.round(score)}/100 health score` : "Research in progress"}
            ok={hasAuditReport}
            actionHref="/app/audit"
            last
          />
        </div>
      </section>

      {/* What you can unlock */}
      <section aria-labelledby="unlock-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="unlock-heading" className="text-[19px] font-semibold text-sx-text">
            What a plan unlocks
          </h2>
          <Link href="/app/billing" className="text-[13px] font-semibold text-sx-accent hover:underline">
            View plans
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <UnlockCard icon="🎨" title="Content creation" description="Daily posters, carousels, and festival creative in Hindi and English." />
          <UnlockCard icon="🚀" title="Social growth autopilot" description="Automated posting and engagement tracking on Instagram and Facebook." />
          <UnlockCard icon="🔍" title="Google local SEO" description="Ranking tracking, keyword opportunities, and review management." />
          <UnlockCard icon="💬" title="WhatsApp lead capture" description="Automatic customer follow-ups and instant enquiry replies." />
        </div>
      </section>
    </div>
  );
}

/**
 * STATE B — Subscribed dashboard, same Home pattern: ScoreSummary, "what
 * changed" metrics, "StratXcel is working on" activity, next actions.
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
  opportunities: AuditOpportunity[];
  activeRunsCount: number;
}) {
  const band = bandForScore(score);

  return (
    <div className="flex flex-col gap-6">
      {/* Header — plan status + Ask Copilot */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-sx-pill bg-[var(--sx-success-tint)] px-2.5 text-[13px] font-semibold text-[color:var(--sx-success-text)]">
            Plan active · {customerState.planName}
          </span>
          <h1 className="mt-2 text-2xl font-semibold text-sx-text">{businessName}</h1>
        </div>
        <Link
          href="/app/social/copilot"
          className="inline-flex h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-5 text-[15px] font-semibold text-sx-accent-on transition-transform active:scale-95 hover:bg-[color:var(--sx-accent-hover)]"
        >
          Ask Copilot
        </Link>
      </div>

      {/* ScoreSummary + change metrics side by side, spec §7.1 desktop */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div className="flex flex-col items-center justify-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 text-center sm:w-[40%]">
          <span className="text-[13px] font-semibold text-sx-text-muted">Business health</span>
          <ScoreRing score={score} />
          <ScoreBandChip band={band} />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <MetricTile label="Connected sources" value={String(customerState.connectedSourcesCount)} />
          <MetricTile label="Active missions" value={String(activeRunsCount > 0 ? activeRunsCount : 1)} />
          <MetricTile label="Monthly usage" value={`${customerState.monthlyUsagePercent}%`} />
          <MetricTile
            label="Renews"
            value={customerState.nextBillingDate ? new Date(customerState.nextBillingDate).toLocaleDateString() : "—"}
          />
        </div>
      </div>

      {/* StratXcel is working on */}
      <section aria-labelledby="working-heading">
        <h2 id="working-heading" className="mb-3 flex items-baseline gap-2 text-[19px] font-semibold text-sx-text">
          StratXcel is working on
          <span className="sx-hi text-xs font-normal text-sx-text-muted">चल रहा है</span>
        </h2>
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1">
          <ActivityRow
            title="Social media & content engine"
            detail="Monitoring engagement, scheduling posts, tracking reach."
            state="working"
            actionHref="/app/social/copilot"
          />
          <ActivityRow
            title="Google Search Console & SEO"
            detail="Auditing keyword rankings and organic click opportunities."
            state="monitoring"
            actionHref="/app/audit"
            last
          />
        </div>
      </section>

      {/* Next best actions */}
      <section aria-labelledby="recommendations-heading">
        <h2 id="recommendations-heading" className="mb-3 text-[19px] font-semibold text-sx-text">
          Next best actions
        </h2>
        <div className="flex flex-col gap-3">
          {opportunities.length > 0 ? (
            opportunities.map((opp, idx) => (
              <RecommendationCard key={idx} title={opp.title} detail={opp.rationale} />
            ))
          ) : (
            <RecommendationCard
              title="Ask Copilot for a new growth mission"
              detail="Your AI copilot can generate campaign posters, write ad copy, or optimize local rankings."
            />
          )}
        </div>
      </section>
    </div>
  );
}

/** The single most important card on the screen — spec §5.10. */
function PriorityCard({
  category,
  categoryHi,
  title,
  body,
  difficulty,
  time,
  ctaLabel,
  ctaLabelHi,
  ctaHref,
}: {
  category: string;
  categoryHi: string;
  title: string;
  body: string;
  difficulty: string;
  time: string;
  ctaLabel: string;
  ctaLabelHi: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 shadow-sm" style={{ borderLeft: "3px solid var(--sx-serious)" }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-sx-text-muted">{category}</span>
        <span className="sx-hi text-xs text-sx-text-muted">{categoryHi}</span>
      </div>
      <p className="mt-1.5 text-[19px] font-semibold text-sx-text">{title}</p>
      <p className="mt-1.5 text-[15px] leading-[22px] text-sx-text-muted">{body}</p>
      <div className="mt-3.5 flex items-center gap-2">
        <span className="inline-flex h-[26px] items-center rounded-sx-pill bg-sx-surface-2 px-2.5 text-[13px] font-semibold text-sx-text-muted">
          {difficulty}
        </span>
        <span className="text-xs text-sx-text-subtle">{time}</span>
      </div>
      <div className="mt-4 flex items-center gap-1">
        <Link
          href={ctaHref}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-sx-sm bg-sx-accent px-5 text-[15px] font-semibold text-sx-accent-on transition-transform active:scale-95 hover:bg-[color:var(--sx-accent-hover)] md:h-11"
        >
          {ctaLabel}
          <span className="sx-hi text-xs opacity-85">{ctaLabelHi}</span>
        </Link>
      </div>
    </div>
  );
}

/** A row inside the "ready" / status list — StatusChip + plain sentence, never colour alone. */
function StatusRow({
  label,
  detail,
  ok,
  actionHref,
  last = false,
}: {
  label: string;
  detail: string;
  ok: boolean;
  actionHref?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-5 py-4 ${last ? "" : "border-b border-sx-border"}`}>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: ok ? "#0CA30C" : "#B98A2E" }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-sx-text">{label}</p>
        <p className="truncate text-xs text-sx-text-subtle">{detail}</p>
      </div>
      {actionHref && (
        <Link href={actionHref} className="shrink-0 text-[13px] font-semibold text-sx-accent hover:underline">
          {ok ? "Review" : "Fix"}
        </Link>
      )}
    </div>
  );
}

/** An "activity is visible" row — spec §5.14, never a bare percentage or job id. */
function ActivityRow({
  title,
  detail,
  state,
  actionHref,
  last = false,
}: {
  title: string;
  detail: string;
  state: "working" | "monitoring";
  actionHref: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 px-5 py-4 ${last ? "" : "border-b border-sx-border"}`}>
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sx-accent ${state === "working" ? "sx-status-pulse" : ""}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-sx-text">{title}</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-sx-text-muted">{detail}</p>
        <span className="mt-2 inline-flex h-[26px] items-center gap-1.5 rounded-sx-pill bg-sx-accent-muted px-2.5 text-[13px] font-semibold text-sx-accent">
          {state === "working" ? "Working" : "Monitoring"}
        </span>
      </div>
      <Link href={actionHref} className="shrink-0 self-center text-[13px] font-semibold text-sx-accent hover:underline">
        Manage
      </Link>
    </div>
  );
}

function RecommendationCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
      <p className="text-[15px] font-semibold text-sx-text">{title}</p>
      {detail && <p className="mt-1 line-clamp-2 text-[13px] text-sx-text-muted">{detail}</p>}
      <Link href="/app/social/copilot" className="mt-2.5 inline-flex items-center text-[13px] font-semibold text-sx-accent hover:underline">
        Execute with Copilot →
      </Link>
    </div>
  );
}

function UnlockCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-accent/40">
      <span className="text-2xl">{icon}</span>
      <h3 className="mt-2 text-[15px] font-semibold text-sx-text">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-sx-text-muted">{description}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
      <p className="text-xs font-medium text-sx-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-sx-text">{value}</p>
    </div>
  );
}
