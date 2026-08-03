import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { listMyTenants } from "@/lib/tenants/current-tenant";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listMissionsForTenant } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { getWalletAccount } from "@stratxcel/payments-and-wallet";
import { listPhoneBindingsForTenant } from "@stratxcel/whatsapp";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/Feedback";

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
 * New route required by ADMIN_INFORMATION_ARCHITECTURE.md §1
 * (/admin/clients/{id}) — no prior equivalent existed. Reuses the exact
 * same tenant-scoped repository calls the Command Center and platform
 * pages already use, on the authenticated session client (ctx.supabase),
 * never service-role. Access is bounded to tenants the requesting owner
 * actually belongs to (the same set the ClientSwitcher offers) — this is
 * not a raw admin-can-see-everything lookup.
 */
export default async function ClientDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const memberships = await listMyTenants(ctx.supabase, ctx.ownerId);
  const membership = memberships.find((m) => m.tenantId === tenantId);
  if (!membership) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          title="Client not found"
          subtitle="Either it doesn't exist, or you're not a member of it — the same access rule the client switcher uses."
          action={
            <Link href="/admin/clients" className="text-sx-accent hover:underline">
              Back to Clients
            </Link>
          }
        />
      </div>
    );
  }

  const [missions, approvals, wallet, bindings] = await Promise.all([
    listMissionsForTenant(ctx.supabase, tenantId, 10),
    (async () => {
      try {
        requirePermission(membership.role, "approval:decide");
      } catch (err) {
        if (err instanceof PermissionDeniedError) return null;
        throw err;
      }
      return listPendingApprovals(ctx.supabase, tenantId);
    })(),
    (async () => {
      try {
        requirePermission(membership.role, "wallet:view");
      } catch (err) {
        if (err instanceof PermissionDeniedError) return null;
        throw err;
      }
      return getWalletAccount(ctx.supabase, tenantId);
    })(),
    (async () => {
      try {
        requirePermission(membership.role, "integration:configure");
      } catch (err) {
        if (err instanceof PermissionDeniedError) return null;
        throw err;
      }
      return listPhoneBindingsForTenant(ctx.supabase, tenantId);
    })(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin/clients" className="text-xs text-sx-text-muted hover:text-sx-text">
          ← Clients
        </Link>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">{membership.name}</h1>
        <p className="text-sm text-sx-text-muted">
          {membership.slug} <span className="text-sx-text-subtle">·</span> your role: {membership.role}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Missions" value={missions.length} deltaLabel="recent" />
        <Metric
          label="Approvals"
          value={approvals === null ? "—" : approvals.length}
          deltaLabel={approvals === null ? "no access for your role" : "pending"}
        />
        <Metric
          label="Wallet"
          value={wallet ? `${wallet.currency} ${(wallet.balance_cents / 100).toFixed(2)}` : "—"}
          deltaLabel={wallet ? "balance" : "no access for your role"}
        />
        <Metric
          label="WhatsApp"
          value={bindings === null ? "—" : bindings.length}
          deltaLabel={bindings === null ? "no access for your role" : "phone bindings"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading>Recent missions</CardHeading>
          {missions.length === 0 ? (
            <p className="text-sm text-sx-text-subtle">No missions yet.</p>
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

        <Card>
          <CardHeading>Approvals requiring attention</CardHeading>
          {approvals === null ? (
            <p className="text-sm text-sx-text-subtle">Your role ({membership.role}) cannot decide approvals for this client.</p>
          ) : approvals.length === 0 ? (
            <p className="text-sm text-sx-text-subtle">Nothing pending.</p>
          ) : (
            <div>
              {approvals.map((a) => (
                <CardRow key={a.id}>
                  <span className="text-sx-text-muted">{a.kind}</span>
                </CardRow>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/admin/missions?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">All missions →</p>
        </Link>
        <Link href={`/admin/finance?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Finance →</p>
        </Link>
        <Link href={`/admin/integrations?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Integrations →</p>
        </Link>
      </div>
    </div>
  );
}
