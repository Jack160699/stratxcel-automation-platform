import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { loadAgencyClientOverview } from "@/lib/tenants/admin-repository";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/Feedback";
import { viewClientWorkspaceAction } from "./staff-workspace-actions";

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

export default async function ClientDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const overview = await loadAgencyClientOverview(tenantId);
  if (!overview) {
    return (
      <EmptyState
        title="Client not found"
        subtitle="This agency client does not exist."
        action={<Link href="/admin/clients" className="text-sx-accent hover:underline">Back to Clients</Link>}
      />
    );
  }

  const { tenant, missions, approvals, wallet, bindings } = overview;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin/clients" className="text-xs text-sx-text-muted hover:text-sx-text">← Clients</Link>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">{tenant.name}</h1>
        <p className="text-sm text-sx-text-muted">{tenant.slug} <span className="text-sx-text-subtle">·</span> agency client</p>
        <form action={viewClientWorkspaceAction.bind(null, tenantId)} className="pt-2">
          <button type="submit" className="rounded-sx-sm bg-sx-accent px-4 py-2.5 text-sm font-semibold text-sx-accent-on hover:bg-sx-accent-hover">
            View client workspace
          </button>
        </form>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Missions" value={missions.length} deltaLabel="recent" />
        <Metric label="Approvals" value={approvals.length} deltaLabel="pending" />
        <Metric label="Wallet" value={wallet ? `${wallet.currency} ${(wallet.balance_cents / 100).toFixed(2)}` : "—"} deltaLabel={wallet ? "balance" : "not created"} />
        <Metric label="WhatsApp" value={bindings.length} deltaLabel="phone bindings" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading>Recent missions</CardHeading>
          {missions.length === 0 ? <p className="text-sm text-sx-text-subtle">No missions yet.</p> : (
            <div>{missions.map((mission) => {
              const chip = MISSION_STATE_CHIP[mission.state] ?? { label: mission.state, state: "neutral" as ChipState };
              return <CardRow key={mission.id}><span className="min-w-0 flex-1 truncate text-sx-text-muted" title={mission.goal_text}>{mission.goal_text}</span><StatusChip state={chip.state} pulse={chip.state === "ai"}>{chip.label}</StatusChip></CardRow>;
            })}</div>
          )}
        </Card>

        <Card>
          <CardHeading>Approvals requiring attention</CardHeading>
          {approvals.length === 0 ? <p className="text-sm text-sx-text-subtle">Nothing pending.</p> : (
            <div>{approvals.map((approval) => <CardRow key={approval.id}><span className="text-sx-text-muted">{approval.kind}</span></CardRow>)}</div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/admin/missions?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong"><p className="text-[13px] font-medium text-sx-text">All missions →</p></Link>
        <Link href={`/admin/finance?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong"><p className="text-[13px] font-medium text-sx-text">Finance →</p></Link>
        <Link href={`/admin/integrations?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong"><p className="text-[13px] font-medium text-sx-text">Integrations →</p></Link>
      </div>
    </div>
  );
}
