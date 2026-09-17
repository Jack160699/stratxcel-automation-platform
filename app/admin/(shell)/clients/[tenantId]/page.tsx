import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { loadAgencyClientOverview } from "@/lib/tenants/admin-repository";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/Feedback";
import { viewClientWorkspaceAction } from "./staff-workspace-actions";
import { publishNextCampaignItemAction, runTenantWorkerNowAction } from "./campaign-actions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadTenantInstagramCampaigns } from "@/lib/social/instagram-campaign-inventory";

// Paced campaign publishing runs inside this page's server action: token
// refresh, quota check, container processing and provider read-back.
export const maxDuration = 300;

const PUBLISH_OUTCOME_CHIP: Record<string, { label: string; state: ChipState }> = {
  published: { label: "Published", state: "success" },
  already_published: { label: "Already on Instagram", state: "success" },
  nothing_to_publish: { label: "Nothing left to publish", state: "neutral" },
  blocked_by_platform_limit: { label: "Blocked by Instagram limit", state: "warning" },
  connection_not_ready: { label: "Connection not ready", state: "danger" },
  account_mismatch: { label: "Account mismatch", state: "danger" },
  shadow_mode: { label: "Shadow mode", state: "warning" },
  validation_failed: { label: "Blocked by caption validation", state: "warning" },
  failed: { label: "Failed", state: "danger" },
  error: { label: "Error", state: "danger" },
};

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

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantId } = await params;
  const query = await searchParams;
  const param = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
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
  const campaigns = await loadTenantInstagramCampaigns(createSupabaseServiceClient() as unknown as Parameters<typeof loadTenantInstagramCampaigns>[0], tenantId).catch(() => []);
  const lastOutcome = param("publishOutcome");
  const lastOutcomeChip = lastOutcome ? PUBLISH_OUTCOME_CHIP[lastOutcome] ?? { label: lastOutcome, state: "neutral" as ChipState } : null;

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

      {campaigns.map(({ campaign, account, summary }) => (
        <Card key={campaign.id}>
          <CardHeading>{campaign.name}</CardHeading>
          <p className="text-sm text-sx-text-muted">
            Instagram {account ? `${account.username} · ${account.status}/${account.tokenHealth}` : "not connected"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Assets" value={summary.total} deltaLabel={`${summary.feedEligible} feed eligible`} />
            <Metric label="Published" value={summary.published} deltaLabel={`${summary.providerVerified} provider verified`} />
            <Metric label="Scheduled" value={summary.scheduled} deltaLabel={`${summary.notAttempted} not attempted`} />
            <Metric label="Blocked / failed" value={summary.blocked + summary.failed} deltaLabel={`${summary.formatIneligible} format ineligible`} />
          </div>
          {lastOutcomeChip && param("campaign") === campaign.id && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-sx-text-muted">
              <StatusChip state={lastOutcomeChip.state}>{lastOutcomeChip.label}</StatusChip>
              {param("asset") && <span>{param("asset")}</span>}
              {param("mediaId") && <span className="font-sx-mono text-xs">media {param("mediaId")}</span>}
              {param("quota") && <span className="text-xs">quota {param("quota")}</span>}
              {param("message") && <span className="text-xs">{param("message")}</span>}
            </div>
          )}
          <form action={publishNextCampaignItemAction.bind(null, tenantId, campaign.id)} className="pt-3">
            <button type="submit" className="rounded-sx-sm bg-sx-accent px-4 py-2.5 text-sm font-semibold text-sx-accent-on hover:bg-sx-accent-hover">
              Publish next eligible post
            </button>
          </form>
        </Card>
      ))}

      {param("workerOutcome") && (
        <Card>
          <p className="text-sm text-sx-text-muted">
            Worker run: {param("workerOutcome")} · processed {param("processed") ?? "0"}
            {param("firstResult") ? ` · ${param("firstResult")}` : ""}
            {param("message") ? ` · ${param("message")}` : ""}
          </p>
        </Card>
      )}

      <Card>
        <CardHeading>Publishing worker</CardHeading>
        <p className="text-sm text-sx-text-muted">
          Runs this tenant&apos;s own due, SCHEDULED jobs through the canonical worker -- for a job outside the campaign inventory above (e.g. a recovered one-off job).
        </p>
        <form action={runTenantWorkerNowAction.bind(null, tenantId)} className="pt-3">
          <button type="submit" className="rounded-sx-sm bg-sx-surface-2 px-4 py-2.5 text-sm font-semibold text-sx-text hover:bg-sx-border">
            Run worker now for this tenant
          </button>
        </form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/admin/missions?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong"><p className="text-[13px] font-medium text-sx-text">All missions →</p></Link>
        <Link href={`/admin/finance?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong"><p className="text-[13px] font-medium text-sx-text">Finance →</p></Link>
        <Link href={`/admin/integrations?tenantId=${tenantId}`} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong"><p className="text-[13px] font-medium text-sx-text">Integrations →</p></Link>
      </div>
    </div>
  );
}
