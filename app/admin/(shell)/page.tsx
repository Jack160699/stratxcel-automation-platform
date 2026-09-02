import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listMissionsForTenant } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { getConnection as getStorageConnection } from "@stratxcel/storage";
import { diagnoseBusinessGrowth, deriveBottlenecks } from "@stratxcel/workforce-core";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { loadIntegrationsStatusData } from "@/lib/connectors/load-integrations-data";
import { computeRealBusinessSignals } from "@/lib/agent-core/business-signals";
import { computeRealEntitlementSnapshot } from "@/lib/agent-core/business-priorities";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { OnboardingPanel } from "./OnboardingPanel";

const BOTTLENECK_SEVERITY_CHIP: Record<string, ChipState> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "neutral",
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

function IntegrationRow({ label, mode }: { label: string; mode: string | undefined }) {
  const live = mode === "live" || mode === "http";
  const shadow = mode === "shadow" || mode === "mock";
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-sx-text-muted">{label}</span>
      <StatusChip state={live ? "success" : shadow ? "warning" : "neutral"} dot={false}>
        {live ? "Live" : shadow ? "Shadow" : "Disabled"}
      </StatusChip>
    </div>
  );
}

/**
 * Independently re-guards with requireOwnerContext() even though the
 * parent (shell) layout already does — the App Router can still render
 * and serialize a nested page's Server Component output into the RSC
 * payload even when a layout discards {children} for an unauthorized
 * visitor (the exact defect fixed for app/admin/platform/page.tsx earlier
 * this build). As the new default landing page for /admin, this is the
 * single highest-traffic place that guard must hold.
 */
export default async function CommandCenterPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { tenants, active } = await resolveCurrentTenant(ctx.supabase, ctx.ownerId);

  if (!active) {
    return <OnboardingPanel />;
  }

  // All three reads below are user-initiated and go through ctx.supabase —
  // the authenticated, request-bound session client — relying on RLS
  // (missions_tenant_read / approvals_tenant_read / the existing
  // stratxcel_contact_messages admin policy) rather than a service-role
  // client. No SUPABASE_SERVICE_ROLE_KEY dependency anywhere on this page.
  const [missions, approvals, newMessageCount, driveConnection] = await Promise.all([
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
    (async () => {
      const { count } = await ctx.supabase
        .from("stratxcel_contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      return count ?? 0;
    })(),
    // Real per-tenant status via the canonical storage_connections repository
    // (packages/storage) -- previously this row was hardcoded mode={undefined},
    // always rendering "Disabled" regardless of the real connection state.
    getStorageConnection(ctx.supabase as never, active.tenantId, "google_drive").catch(() => null),
  ]);

  const pendingCount = approvals?.length ?? 0;

  // Real, evidence-gated growth diagnosis for the active tenant -- the same
  // classifiers/pipeline check_business_priorities uses (Update 38), called
  // directly here so Admin Home can answer "what opportunities exist / what
  // should happen next" (master brief section 17) from actual signals, not
  // a decorative card. Never blocks the rest of the page: a failure here
  // degrades to an honest "couldn't compute" card, not a broken page.
  const topBottlenecks = await (async () => {
    try {
      const [brandBrainRow, integrations, businessSignalsResult, entitlementSnapshot] = await Promise.all([
        getCurrentBrandBrain(ctx.supabase as never, active.tenantId),
        loadIntegrationsStatusData(ctx.supabase as never, active.tenantId),
        computeRealBusinessSignals(ctx.supabase as never, active.tenantId),
        computeRealEntitlementSnapshot(ctx.supabase as never, active.tenantId),
      ]);
      const brandBrain = brandBrainRow?.content ?? {};
      const connectedChannels: string[] = [];
      if (integrations.whatsapp === "connected") connectedChannels.push("whatsapp");
      if (integrations.facebook === "connected") connectedChannels.push("facebook");
      if (integrations.instagram === "connected") connectedChannels.push("instagram");
      if (integrations.google === "connected") connectedChannels.push("google");

      const diagnosis = diagnoseBusinessGrowth({
        tenantId: active.tenantId,
        missionId: `admin-home-priority-check:${active.tenantId}`,
        timezone: "UTC",
        currentDateIso: new Date().toISOString(),
        brandBrain,
        productsServices: [],
        targetAudience: brandBrain.target_audience ?? "",
        geography: "",
        positioning: "",
        connectedChannels,
        businessGoals: [],
        previousPerformance: [],
        existingResearchEvidence: [],
        activeCampaigns: [],
        availableCapabilities: [],
        entitlementSnapshot,
        budgetEnvelope: { estimatedCents: null, reservedCents: 0, actualCents: null },
        businessSignals: businessSignalsResult.signals,
      });
      return deriveBottlenecks(diagnosis).slice(0, 3);
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Agency Overview</h1>
        <p className="text-sm text-sx-text-muted">
          {active.name} <span className="text-sx-text-subtle">·</span> {active.role}
          {tenants.length > 1 && <span className="text-sx-text-subtle"> · {tenants.length} clients accessible</span>}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Missions" value={missions.length} deltaLabel={`recent for ${active.name}`} />
        <Metric
          label="Approvals"
          value={approvals === null ? "—" : pendingCount}
          deltaLabel={approvals === null ? "no access for your role" : "pending"}
          delta={pendingCount > 0 ? "neutral" : undefined}
        />
        <Metric label="Contact inbox" value={newMessageCount} deltaLabel={`new message${newMessageCount === 1 ? "" : "s"}`} />
        <Metric label="Clients" value={tenants.length} deltaLabel="accessible to you" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/social" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Content / Social Autopilot</p>
          <p className="mt-1 text-xs text-sx-text-subtle">Production-working — campaigns, posts, Copilot.</p>
        </Link>
        <Link href="/admin/missions" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Missions</p>
          <p className="mt-1 text-xs text-sx-text-subtle">{missions.length} recent for {active.name}.</p>
        </Link>
        <Link href="/admin/approvals" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Approvals</p>
          <p className="mt-1 text-xs text-sx-text-subtle">
            {approvals === null ? "No access for your role" : `${approvals.length} pending`}
          </p>
        </Link>
        <Link href="/admin/leads" className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
          <p className="text-[13px] font-medium text-sx-text">Leads</p>
          <p className="mt-1 text-xs text-sx-text-subtle">{newMessageCount} new message{newMessageCount === 1 ? "" : "s"}.</p>
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
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

        <Card>
          <div className="flex items-center justify-between">
            <CardHeading>Growth opportunities for {active.name}</CardHeading>
            <Link href="/admin/copilot" className="font-sx-mono text-xs text-sx-accent hover:underline">
              Ask Copilot →
            </Link>
          </div>
          {topBottlenecks === null ? (
            <p className="text-sm text-sx-text-subtle">Couldn&apos;t compute a diagnosis right now.</p>
          ) : topBottlenecks.length === 0 ? (
            <p className="text-sm text-sx-text-subtle">No evidence-backed bottleneck found yet — connect more channels or add CRM/website activity for a real diagnosis.</p>
          ) : (
            <div>
              {topBottlenecks.map((b) => (
                <CardRow key={b.id}>
                  <span className="min-w-0 flex-1 truncate text-sx-text-muted" title={b.description}>
                    {b.description}
                  </span>
                  <StatusChip state={BOTTLENECK_SEVERITY_CHIP[b.severity] ?? "neutral"}>{b.severity}</StatusChip>
                </CardRow>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeading>Approvals requiring attention</CardHeading>
          {approvals === null ? (
            <p className="text-sm text-sx-text-subtle">Your role ({active.role}) cannot decide approvals for this client.</p>
          ) : approvals.length === 0 ? (
            <p className="text-sm text-sx-text-subtle">Nothing pending.</p>
          ) : (
            <div>
              {approvals.slice(0, 5).map((a) => (
                <CardRow key={a.id}>
                  <span className="text-sx-text-muted">{a.kind}</span>
                </CardRow>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <CardHeading>Integration status</CardHeading>
          <Link href="/admin/system" className="font-sx-mono text-xs text-sx-accent hover:underline">
            Full detail →
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <IntegrationRow label="WhatsApp" mode={process.env.WHATSAPP_INTEGRATION_MODE} />
          <IntegrationRow label="Razorpay" mode={process.env.RAZORPAY_INTEGRATION_MODE} />
          <IntegrationRow label="Hermes" mode={process.env.HERMES_MODE} />
          <IntegrationRow
            label="Google Drive"
            mode={driveConnection?.status === "connected" ? "live" : driveConnection?.status === "connecting" ? "shadow" : undefined}
          />
        </div>
      </Card>
    </div>
  );
}
