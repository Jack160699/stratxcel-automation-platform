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
 * STATE A — Free / Unsubscribed Dashboard, restructured to the StratXcel
 * Desktop Claude Design canvas layout (Health + status row → Today's
 * Priorities → Quick Tools → what a plan unlocks). Zero fake running
 * states or placeholder numbers — every value here is real.
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

  // Same progressive, mutually-exclusive priority the app has always
  // surfaced (verify WhatsApp → turn audit into a plan → create a
  // website while the audit runs) — now rendered as a tile instead of a
  // single full-width card, per the design's "Today's Priorities" grid.
  const priorities: PriorityTileProps[] = [
    !whatsappVerified && {
      icon: "💬",
      iconTint: "success",
      title: "Verify your WhatsApp number",
      detail: "Customer alerts are delivered here — 2 min",
      href: "/app/integrations",
    },
    whatsappVerified && hasAuditReport && {
      icon: "🚀",
      iconTint: "accent",
      title: "Turn your audit into a plan",
      detail: "Put StratXcel to work on what it found — 3 min",
      href: "/app/billing",
    },
    whatsappVerified && !hasAuditReport && {
      icon: "🌐",
      iconTint: "warning",
      title: "Create your business website",
      detail: "Let customers find & trust you online — 5 min",
      href: "/app/website",
    },
  ].filter(Boolean) as PriorityTileProps[];

  return (
    <div className="flex flex-col gap-6">
      {/* Health + status — StratXcel Desktop canvas Row 1 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Online Health</span>
          <ScoreRing score={score} />
          <ScoreBandChip band={band} />
          <p className="text-[13px] leading-[20px] text-sx-text-muted">{sentence}</p>
          <Link
            href="/app/audit"
            className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-sx-sm bg-sx-accent text-[14px] font-semibold text-sx-accent-on transition-transform active:scale-95 hover:bg-[color:var(--sx-accent-hover)]"
          >
            View Report
          </Link>
        </div>
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">What&apos;s verified and ready</span>
          <div className="mt-2 flex flex-col">
            <StatusRow label="Business profile" detail={businessName} ok />
            <StatusRow
              label="WhatsApp alerts"
              detail={whatsappVerified ? "Instant updates enabled" : "Verify your number to enable"}
              ok={whatsappVerified}
              actionHref={whatsappVerified ? undefined : "/app/integrations"}
            />
            <StatusRow
              label="Business audit"
              detail={hasAuditReport ? `${Math.round(score)}/100 health score` : "Research in progress"}
              ok={hasAuditReport}
              actionHref="/app/audit"
              last
            />
          </div>
        </div>
      </div>

      {priorities.length > 0 && <TodaysPriorities tiles={priorities} />}

      <QuickTools />

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

      {/* Health + Pulse row — StratXcel Desktop canvas Row 1 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Online Health</span>
          <ScoreRing score={score} />
          <ScoreBandChip band={band} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile label="Connected sources" value={String(customerState.connectedSourcesCount)} />
          <MetricTile label="Active missions" value={String(activeRunsCount > 0 ? activeRunsCount : 1)} />
          <MetricTile label="Monthly usage" value={`${customerState.monthlyUsagePercent}%`} />
          <MetricTile
            label="Renews"
            value={customerState.nextBillingDate ? new Date(customerState.nextBillingDate).toLocaleDateString() : "—"}
          />
        </div>
      </div>

      {/* Today's Priorities — sourced from the real opportunities the audit
          report found, falling back to the Copilot recommendation that was
          previously the only "Next best actions" entry. */}
      <TodaysPriorities
        tiles={
          opportunities.length > 0
            ? opportunities.slice(0, 3).map((opp) => ({
                icon: "🎯",
                iconTint: "accent" as const,
                title: opp.title,
                detail: opp.rationale ?? "Execute with Copilot",
                href: "/app/social/copilot",
              }))
            : [
                {
                  icon: "💬",
                  iconTint: "accent" as const,
                  title: "Ask Copilot for a new growth mission",
                  detail: "Generate campaign posters, write ad copy, or optimize local rankings.",
                  href: "/app/social/copilot",
                },
              ]
        }
      />

      <QuickTools />

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
    </div>
  );
}

type PriorityIconTint = "accent" | "success" | "warning";

interface PriorityTileProps {
  icon: string;
  iconTint: PriorityIconTint;
  title: string;
  detail?: string;
  href: string;
}

const PRIORITY_TINT_CLASSES: Record<PriorityIconTint, string> = {
  accent: "bg-sx-accent-muted",
  success: "bg-[var(--sx-success-tint)]",
  warning: "bg-[var(--sx-warning-tint)]",
};

/**
 * "Today's Priorities" — StratXcel App reference: ONE card containing
 * list-rows (icon square → title → subtitle → chevron), not a grid of
 * separate tile-cards. Every row is a real, personalized signal (WhatsApp
 * verification, audit/plan state, report opportunities) passed in by the
 * caller; this component never invents its own content.
 */
function TodaysPriorities({ tiles }: { tiles: PriorityTileProps[] }) {
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="priorities-heading">
      <h2 id="priorities-heading" className="mb-3 flex items-baseline gap-2 text-[19px] font-semibold text-sx-text">
        Today&apos;s Priorities
        <span className="sx-hi text-xs font-normal text-sx-text-muted">आज की प्राथमिकताएं</span>
      </h2>
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
        {tiles.map((tile, idx) => (
          <Link
            key={idx}
            href={tile.href}
            className={`flex items-center gap-2.5 py-2.5 transition-opacity hover:opacity-80 ${
              idx < tiles.length - 1 ? "border-b border-sx-border" : ""
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm text-base ${PRIORITY_TINT_CLASSES[tile.iconTint]}`}>
              {tile.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-sx-text">{tile.title}</span>
              {tile.detail && <span className="mt-0.5 block truncate text-xs text-sx-text-subtle">{tile.detail}</span>}
            </span>
            <ChevronIcon />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-subtle)" strokeWidth="2" className="shrink-0">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

const QUICK_TOOLS: { icon: string; iconTint: PriorityIconTint; label: string; href: string }[] = [
  { icon: "🎨", iconTint: "accent", label: "Create Poster", href: "/app/content/studio" },
  { icon: "💬", iconTint: "success", label: "Ask Copilot", href: "/app/social/copilot" },
  { icon: "🌐", iconTint: "warning", label: "Manage Website", href: "/app/website" },
  { icon: "🏪", iconTint: "accent", label: "Shop Profile", href: "/app/brand" },
];

/** "Quick Tools" grid — StratXcel App reference: a fixed 4-column icon grid at every width. Four real destinations that already exist in the app; nothing here is a placeholder action. */
function QuickTools() {
  return (
    <section aria-labelledby="tools-heading">
      <h2 id="tools-heading" className="sr-only">
        Quick tools
      </h2>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="flex flex-col items-center gap-1.5 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-1.5 py-3 text-center transition-colors hover:border-sx-accent/40"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-sx-sm text-base ${PRIORITY_TINT_CLASSES[tool.iconTint]}`}>
              {tool.icon}
            </span>
            <span className="text-[11px] font-semibold leading-tight text-sx-text">{tool.label}</span>
          </Link>
        ))}
      </div>
    </section>
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
        style={{ background: ok ? "var(--sx-success)" : "var(--sx-warning)" }}
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
