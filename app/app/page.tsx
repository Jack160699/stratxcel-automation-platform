import Link from "next/link";
import { requireClientContext } from "@/lib/tenants/client-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listMissionsForTenant } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { OnboardingPanel } from "./OnboardingPanel";
import { JourneyPanel } from "./JourneyPanel";
import { deriveJourney, nextAction } from "@/lib/journey/progress";

const MISSION_STATE_CHIP: Record<string, { label: string; state: ChipState }> = {
  DRAFT: { label: "Draft", state: "neutral" },
  ESTIMATING: { label: "Estimating", state: "neutral" },
  AWAITING_FUNDS: { label: "Awaiting funds", state: "warning" },
  READY: { label: "Ready", state: "accent" },
  QUEUED: { label: "Queued", state: "accent" },
  RUNNING: { label: "Running", state: "ai" },
  AWAITING_INPUT: { label: "Awaiting input", state: "warning" },
  AWAITING_APPROVAL: { label: "Awaiting approval", state: "warning" },
  HUMAN_HANDOFF: { label: "Human handoff", state: "warning" },
  RESUMED: { label: "Resumed", state: "accent" },
  COMPLETED: { label: "Completed", state: "success" },
  PARTIALLY_COMPLETED: { label: "Partially completed", state: "success" },
  FAILED: { label: "Failed", state: "danger" },
  CANCELLED: { label: "Cancelled", state: "neutral" },
  BLOCKED: { label: "Blocked", state: "danger" },
};

const ACTIVE_MISSION_STATES = new Set([
  "QUEUED",
  "RUNNING",
  "READY",
  "RESUMED",
  "ESTIMATING",
  "AWAITING_INPUT",
  "AWAITING_APPROVAL",
  "HUMAN_HANDOFF",
  "AWAITING_FUNDS",
  "BLOCKED",
]);

const DONE_MISSION_STATES = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function loadJourneyInput(supabase: SessionClient, tenantId: string) {
  const [user, order, consultation] = await Promise.all([
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
        const { data } = await supabase
          .from("audit_orders")
          .select("status, business_name, industry, website_url, deep_dive_answers, goals_answers, report_data")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
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
  ]);

  return { account: user, order, consultationRequested: consultation };
}

const GROWTH_AREAS = [
  { href: "/app/website", label: "Website", hint: "Get discovered" },
  { href: "/app/search", label: "Search & SEO", hint: "Get discovered" },
  { href: "/app/crm", label: "Leads & CRM", hint: "Capture & convert" },
  { href: "/app/ads", label: "Ads", hint: "Create demand" },
  { href: "/app/reports", label: "Reports", hint: "Measure & improve" },
];

/**
 * V1 Command Center — answers what Stratxcel is doing, what needs attention,
 * what is in progress, recent outcomes, and where to grow next.
 * Uses real available data only; never fabricates inbox/AI metric cards.
 */
export default async function ClientCommandCenterPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const { active } = await resolveCurrentTenant(ctx.supabase, ctx.userId);
  if (!active) return <OnboardingPanel />;

  const [missions, approvals, journeyInput] = await Promise.all([
    listMissionsForTenant(ctx.supabase, active.tenantId, 8),
    (async () => {
      try {
        requirePermission(active.role, "approval:decide");
      } catch (err) {
        if (err instanceof PermissionDeniedError) return null;
        throw err;
      }
      return listPendingApprovals(ctx.supabase, active.tenantId);
    })(),
    loadJourneyInput(ctx.supabase, active.tenantId),
  ]);

  const stages = deriveJourney(journeyInput);
  const next = nextAction(stages);
  const pendingApprovals = approvals ?? [];
  const inProgress = missions.filter((m) => ACTIVE_MISSION_STATES.has(m.state));
  const blocked = missions.filter((m) => m.state === "BLOCKED" || m.state === "FAILED" || m.state === "HUMAN_HANDOFF");
  const recentDone = missions.filter((m) => DONE_MISSION_STATES.has(m.state)).slice(0, 4);

  const attentionItems: { label: string; href: string; detail: string }[] = [];
  if (approvals !== null && pendingApprovals.length > 0) {
    attentionItems.push({
      label: `${pendingApprovals.length} approval${pendingApprovals.length === 1 ? "" : "s"} waiting`,
      href: "/app/approvals",
      detail: "Needs your decision before work can continue.",
    });
  }
  for (const m of blocked.slice(0, 3)) {
    attentionItems.push({
      label: m.goal_text,
      href: `/app/missions/${m.id}`,
      detail: MISSION_STATE_CHIP[m.state]?.label ?? m.state,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Command Center</h1>
        <p className="text-sm text-sx-text-muted">
          {active.name} <span className="text-sx-text-subtle">·</span> what Stratxcel is doing for you
        </p>
      </header>

      {/* A. Growth status / next best action */}
      <JourneyPanel stages={stages} next={next} tenantId={active.tenantId} />

      {/* B. Needs your attention */}
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Needs your attention</h2>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-sx-text-subtle">
            Nothing needs a decision right now.
            {approvals === null ? " Your role cannot decide approvals." : ""}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {attentionItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="rounded-sx-md border border-sx-border bg-sx-surface-1 px-4 py-3 transition-colors hover:border-sx-border-strong"
              >
                <p className="text-sm font-medium text-sx-text">{item.label}</p>
                <p className="mt-0.5 text-xs text-sx-text-subtle">{item.detail}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* C. Work in progress */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Work in progress</h2>
          <Link href="/app/missions" className="text-xs font-medium text-sx-accent hover:underline">
            All work
          </Link>
        </div>
        {inProgress.length === 0 ? (
          <p className="text-sm text-sx-text-subtle">No active work yet. Ask Copilot to start something, or open Work.</p>
        ) : (
          <Card>
            {inProgress.map((m) => {
              const chip = MISSION_STATE_CHIP[m.state] ?? { label: m.state, state: "neutral" as ChipState };
              return (
                <CardRow key={m.id}>
                  <Link href={`/app/missions/${m.id}`} className="min-w-0 flex-1 truncate text-sx-text-muted hover:text-sx-text" title={m.goal_text}>
                    {m.goal_text}
                  </Link>
                  <StatusChip state={chip.state} pulse={chip.state === "ai"}>
                    {chip.label}
                  </StatusChip>
                </CardRow>
              );
            })}
          </Card>
        )}
      </section>

      {/* D. Recent outcomes */}
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Recent outcomes</h2>
        {recentDone.length === 0 ? (
          <p className="text-sm text-sx-text-subtle">Completed work will show up here.</p>
        ) : (
          <Card>
            <CardHeading>Finished recently</CardHeading>
            {recentDone.map((m) => {
              const chip = MISSION_STATE_CHIP[m.state] ?? { label: m.state, state: "success" as ChipState };
              return (
                <CardRow key={m.id}>
                  <span className="min-w-0 flex-1 truncate text-sx-text-muted" title={m.goal_text}>
                    {m.goal_text}
                  </span>
                  <StatusChip state={chip.state}>{chip.label}</StatusChip>
                </CardRow>
              );
            })}
          </Card>
        )}
      </section>

      {/* E. Growth areas */}
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Grow</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GROWTH_AREAS.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="rounded-sx-md border border-sx-border bg-sx-surface-1 px-4 py-3 transition-colors hover:border-sx-border-strong"
            >
              <p className="text-[13px] font-medium text-sx-text">{area.label}</p>
              <p className="mt-0.5 text-xs text-sx-text-subtle">{area.hint}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
