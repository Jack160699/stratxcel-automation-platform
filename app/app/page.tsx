import Link from "next/link";
import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listMissionsForTenant } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { OnboardingPanel } from "./OnboardingPanel";

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

/**
 * /app's Command Center — the client-scoped counterpart of
 * app/admin/(shell)/page.tsx's Agency Overview. Same reused data functions
 * (listMissionsForTenant / listPendingApprovals, both already RLS-safe on
 * the authenticated session client — see the service-role fix earlier in
 * this build), scoped to the one active tenant since that's all a client
 * account can ever see. Independently re-guards with requireClientContext()
 * for the same RSC-disclosure reason every other gated page in this build
 * does — see docs/product-design/EMPTY_LOADING_ERROR_STATE_MATRIX.md §4.
 */
export default async function ClientCommandCenterPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const { active } = await resolveCurrentTenant(ctx.supabase, ctx.userId);
  if (!active) return <OnboardingPanel />;

  const [missions, approvals] = await Promise.all([
    listMissionsForTenant(ctx.supabase, active.tenantId, 5),
    (async () => {
      try {
        requirePermission(active.role, "approval:decide");
      } catch (err) {
        if (err instanceof PermissionDeniedError) return null;
        throw err;
      }
      return listPendingApprovals(ctx.supabase, active.tenantId);
    })(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Command Center</h1>
        <p className="text-sm text-sx-text-muted">
          {active.name} <span className="text-sx-text-subtle">·</span> {active.role}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Missions" value={missions.length} deltaLabel="running now" />
        <Metric label="Approvals" value={approvals === null ? "—" : approvals.length} deltaLabel={approvals === null ? "no access for your role" : "pending"} />
        <Metric label="Unread inbox" value="—" deltaLabel="not yet connected" />
        <Metric label="AI actions" value="—" deltaLabel="not yet connected" ai />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/app/content" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Content</p>
          <p className="mt-1 text-xs text-sx-text-subtle">Campaigns, posts, Copilot.</p>
        </Link>
        <Link href="/app/missions" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Missions</p>
          <p className="mt-1 text-xs text-sx-text-subtle">{missions.length} recent.</p>
        </Link>
        <Link href="/app/approvals" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Approvals</p>
          <p className="mt-1 text-xs text-sx-text-subtle">{approvals === null ? "No access for your role" : `${approvals.length} pending`}</p>
        </Link>
        <Link href="/app/copilot" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Copilot</p>
          <p className="mt-1 text-xs text-sx-text-subtle">Ask Stratxcel to do something.</p>
        </Link>
      </section>

      <Card>
        <CardHeading>Recent missions</CardHeading>
        {missions.length === 0 ? (
          <p className="text-sm text-sx-text-subtle">No missions yet for {active.name}.</p>
        ) : (
          <div>
            {missions.map((m) => {
              const chip = MISSION_STATE_CHIP[m.state] ?? { label: m.state, state: "neutral" as ChipState };
              return (
                <CardRow key={m.id}>
                  <span className="min-w-0 flex-1 truncate text-sx-text-muted" title={m.goal_text}>
                    {m.goal_text}
                  </span>
                  <StatusChip state={chip.state} pulse={chip.state === "ai"}>
                    {chip.label}
                  </StatusChip>
                </CardRow>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
