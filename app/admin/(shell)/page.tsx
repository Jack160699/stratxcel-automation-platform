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
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { OnboardingPanel } from "./OnboardingPanel";
import {
  Zap,
  CheckSquare,
  Inbox,
  Building2,
  Sparkles,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Radio,
} from "lucide-react";

const BOTTLENECK_STATUS_MAP: Record<string, string> = {
  critical: "error",
  high: "needs_attention",
  medium: "waiting",
  low: "healthy",
  info: "paused",
};

const MISSION_STATE_MAP: Record<string, { label: string; status: string }> = {
  DRAFT: { label: "Draft", status: "paused" },
  ESTIMATING: { label: "Estimating", status: "waiting" },
  AWAITING_FUNDS: { label: "Awaiting funds", status: "needs_attention" },
  READY: { label: "Ready", status: "healthy" },
  QUEUED: { label: "Queued", status: "waiting" },
  RUNNING: { label: "Running", status: "running" },
  AWAITING_INPUT: { label: "Awaiting input", status: "needs_attention" },
  AWAITING_APPROVAL: { label: "Awaiting approval", status: "needs_attention" },
  HUMAN_HANDOFF: { label: "Human handoff", status: "needs_attention" },
  RESUMED: { label: "Resumed", status: "running" },
  COMPLETED: { label: "Completed", status: "connected" },
  PARTIALLY_COMPLETED: { label: "Partially completed", status: "connected" },
  FAILED: { label: "Failed", status: "error" },
  CANCELLED: { label: "Cancelled", status: "disabled" },
  BLOCKED: { label: "Blocked", status: "error" },
};

function QuickMetricCard({
  icon,
  label,
  value,
  secondary,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  secondary?: string;
  href?: string;
}) {
  const content = (
    <div className="group flex flex-col justify-between rounded-sx-md border border-sx-border/70 bg-sx-surface-1 p-4.5 transition-all duration-150 hover:border-sx-border-strong hover:bg-sx-surface-2/40">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-sx-text-muted">{label}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sx-border/60 bg-sx-surface-2 text-sx-text-muted transition-colors group-hover:text-sx-accent">
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <span className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text">{value}</span>
        {secondary && <p className="mt-0.5 truncate text-[11px] text-sx-text-subtle">{secondary}</p>}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}

export default async function CommandCenterPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { tenants, active } = await resolveCurrentTenant(ctx.supabase, ctx.ownerId);

  if (!active) {
    return <OnboardingPanel />;
  }

  const [missions, approvals, newMessageCount, driveConnection] = await Promise.all([
    listMissionsForTenant(ctx.supabase, active.tenantId, 6),
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
    getStorageConnection(ctx.supabase as never, active.tenantId, "google_drive").catch(() => null),
  ]);

  const pendingApprovalsCount = approvals?.length ?? 0;

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

  const integrations = [
    {
      name: "WhatsApp",
      status: process.env.WHATSAPP_INTEGRATION_MODE === "live" ? "connected" : "paused",
      label: process.env.WHATSAPP_INTEGRATION_MODE === "live" ? "Live routing" : "Shadow / Test",
    },
    {
      name: "Razorpay",
      status: process.env.RAZORPAY_INTEGRATION_MODE === "live" ? "connected" : "paused",
      label: process.env.RAZORPAY_INTEGRATION_MODE === "live" ? "Live payments" : "Mock / Test",
    },
    {
      name: "Hermes",
      status: process.env.HERMES_MODE === "live" || process.env.HERMES_MODE === "http" ? "connected" : "needs_attention",
      label: process.env.HERMES_MODE === "live" || process.env.HERMES_MODE === "http" ? "Autonomous active" : "Standby",
    },
    {
      name: "Google Drive",
      status: driveConnection?.status === "connected" ? "connected" : "not_configured",
      label: driveConnection?.status === "connected" ? "Sync active" : "Not connected",
    },
  ];

  return (
    <div className="flex flex-col gap-7 pb-16">
      {/* Universal Page Header */}
      <AdminPageHeader
        breadcrumb="Command / Operating Brain"
        title="Operating Brain"
        description={`Active company context: ${active.name} · Role: ${active.role} · ${tenants.length} company workspace${tenants.length === 1 ? "" : "s"} accessible`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/copilot"
              className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:border-sx-border hover:bg-sx-surface-1"
            >
              <Sparkles size={13} className="text-sx-accent" />
              <span>Ask Copilot</span>
            </Link>
            <Link
              href="/admin/missions"
              className="flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent-hover"
            >
              <Zap size={13} />
              <span>New Mission</span>
            </Link>
          </div>
        }
      />

      {/* WHAT MATTERS NOW: High-Impact Summary Bar */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <QuickMetricCard
          icon={<Zap size={15} />}
          label="Active Missions"
          value={missions.length}
          secondary={`Recent for ${active.name}`}
          href="/admin/missions"
        />
        <QuickMetricCard
          icon={<CheckSquare size={15} />}
          label="Pending Approvals"
          value={approvals === null ? "—" : pendingApprovalsCount}
          secondary={pendingApprovalsCount > 0 ? "Requires review" : "Inbox clear"}
          href="/admin/approvals"
        />
        <QuickMetricCard
          icon={<Inbox size={15} />}
          label="Lead Messages"
          value={newMessageCount}
          secondary={newMessageCount > 0 ? `${newMessageCount} new transmission${newMessageCount === 1 ? "" : "s"}` : "All read"}
          href="/admin/leads"
        />
        <QuickMetricCard
          icon={<Building2 size={15} />}
          label="Workspaces"
          value={tenants.length}
          secondary="Agency clients"
          href="/admin/clients"
        />
      </section>

      {/* Main Grid: Missions + Growth Signals */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left Column: Recent Missions */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-sx-text">Recent Missions</h2>
            <Link href="/admin/missions" className="flex items-center gap-1 text-xs font-medium text-sx-accent hover:underline">
              <span>View all</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          {missions.length === 0 ? (
            <AdminEmptyState
              icon={<Zap size={18} />}
              title="No active missions"
              description={`Hermes has nothing currently running for ${active.name}.`}
              action={
                <Link
                  href="/admin/missions"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover"
                >
                  <Zap size={13} />
                  <span>Start Mission</span>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {missions.map((m) => {
                const stateMeta = MISSION_STATE_MAP[m.state] ?? { label: m.state, status: "paused" };
                return (
                  <Link key={m.id} href="/admin/missions" className="block">
                    <AdminEntityRow
                      icon={<Zap size={16} className="text-sx-accent" />}
                      title={m.goal_text}
                      subtitle={`Created ${new Date(m.created_at).toLocaleDateString()}`}
                      status={<AdminStatusDot status={stateMeta.status} customLabel={stateMeta.label} />}
                      detailsAriaLabel={`Inspect mission ${m.id}`}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Growth Priorities & Bottlenecks */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-sx-text">Growth Bottlenecks</h2>
            <Link href="/admin/copilot" className="flex items-center gap-1 text-xs font-medium text-sx-text-subtle hover:text-sx-text">
              <Sparkles size={12} />
              <span>Copilot triage</span>
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {topBottlenecks === null || topBottlenecks.length === 0 ? (
              <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4 text-xs text-sx-text-muted">
                <p className="font-medium text-sx-text">No active bottlenecks identified</p>
                <p className="mt-1 text-sx-text-subtle">
                  Signals are healthy. Connect WhatsApp, social, and website channels to increase diagnostic fidelity.
                </p>
              </div>
            ) : (
              topBottlenecks.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-3 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-border"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[12.5px] font-medium text-sx-text line-clamp-2">{b.description}</span>
                    <span className="text-[11px] text-sx-text-subtle capitalize">
                      {((b as unknown) as Record<string, unknown>).category ? `Category: ${String(((b as unknown) as Record<string, unknown>).category).replaceAll("_", " ")}` : null}
                    </span>
                  </div>
                  <AdminStatusDot status={BOTTLENECK_STATUS_MAP[b.severity] ?? "waiting"} customLabel={b.severity} />
                </div>
              ))
            )}
          </div>

          {/* Integration Posture Panel */}
          <div className="mt-2 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-sx-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-sx-text-muted">
                  Platform Core Status
                </h3>
              </div>
              <Link href="/admin/system" className="text-[11px] font-medium text-sx-accent hover:underline">
                Full Health →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {integrations.map((item) => (
                <div
                  key={item.name}
                  className="flex flex-col rounded-lg border border-sx-border/50 bg-sx-surface-2/60 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-sx-text">{item.name}</span>
                    <AdminStatusDot status={item.status} compact />
                  </div>
                  <span className="mt-1 truncate text-[11px] text-sx-text-subtle">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
