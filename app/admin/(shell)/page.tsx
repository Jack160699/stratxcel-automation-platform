import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listMissionsForTenant } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { OnboardingPanel } from "./OnboardingPanel";

const STATE_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-600/20 text-slate-400",
  ESTIMATING: "bg-slate-600/20 text-slate-400",
  AWAITING_FUNDS: "bg-amber-400/15 text-amber-300",
  READY: "bg-sky-400/15 text-sky-300",
  QUEUED: "bg-sky-400/15 text-sky-300",
  RUNNING: "bg-sky-400/25 text-sky-200",
  AWAITING_INPUT: "bg-amber-400/15 text-amber-300",
  AWAITING_APPROVAL: "bg-amber-400/15 text-amber-300",
  HUMAN_HANDOFF: "bg-orange-400/15 text-orange-300",
  RESUMED: "bg-sky-400/15 text-sky-300",
  COMPLETED: "bg-emerald-400/15 text-emerald-300",
  PARTIALLY_COMPLETED: "bg-emerald-400/10 text-emerald-400",
  FAILED: "bg-rose-400/15 text-rose-300",
  CANCELLED: "bg-slate-600/20 text-slate-500",
  BLOCKED: "bg-rose-400/15 text-rose-300",
};

function IntegrationRow({ label, mode }: { label: string; mode: string | undefined }) {
  const live = mode === "live" || mode === "http";
  const shadow = mode === "shadow" || mode === "mock";
  const status = live ? "Live" : shadow ? "Shadow" : "Disabled";
  const style = live
    ? "bg-emerald-400/15 text-emerald-300"
    : shadow
      ? "bg-amber-400/15 text-amber-300"
      : "bg-slate-600/20 text-slate-400";
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>{status}</span>
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
  const [missions, approvals, newMessageCount] = await Promise.all([
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
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-slate-100">Command Center</h1>
        <p className="text-sm text-slate-400">
          {active.name} <span className="text-slate-600">·</span> {active.role}
          {tenants.length > 1 && (
            <span className="text-slate-600"> · {tenants.length} clients accessible</span>
          )}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/social" className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-600">
          <p className="text-sm font-medium text-slate-200">Content / Social Autopilot</p>
          <p className="mt-1 text-xs text-slate-500">Production-working — campaigns, posts, Copilot.</p>
        </Link>
        <Link href="/admin/platform/missions" className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-600">
          <p className="text-sm font-medium text-slate-200">Missions</p>
          <p className="mt-1 text-xs text-slate-500">{missions.length} recent for {active.name}.</p>
        </Link>
        <Link href="/admin/platform/approvals" className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-600">
          <p className="text-sm font-medium text-slate-200">Approvals</p>
          <p className="mt-1 text-xs text-slate-500">
            {approvals === null ? "No access for your role" : `${approvals.length} pending`}
          </p>
        </Link>
        <Link href="/admin/inbox" className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-600">
          <p className="text-sm font-medium text-slate-200">Contact Inbox</p>
          <p className="mt-1 text-xs text-slate-500">{newMessageCount} new message{newMessageCount === 1 ? "" : "s"}.</p>
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-medium text-slate-200">Recent missions</h2>
          {missions.length === 0 ? (
            <p className="text-sm text-slate-500">No missions yet for {active.name}.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {missions.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 border-t border-slate-800 pt-2 first:border-t-0 first:pt-0">
                  <span className="min-w-0 truncate text-sm text-slate-300" title={m.goal_text}>{m.goal_text}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[m.state] ?? "bg-slate-600/20 text-slate-400"}`}>
                    {m.state}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-medium text-slate-200">Approvals requiring attention</h2>
          {approvals === null ? (
            <p className="text-sm text-slate-500">Your role ({active.role}) cannot decide approvals for this client.</p>
          ) : approvals.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing pending.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {approvals.slice(0, 5).map((a) => (
                <li key={a.id} className="border-t border-slate-800 pt-2 text-sm text-slate-300 first:border-t-0 first:pt-0">
                  {a.kind}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-slate-200">Integration status</h2>
          <Link href="/admin/platform" className="text-xs text-sky-400 hover:underline">Full detail →</Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <IntegrationRow label="WhatsApp" mode={process.env.WHATSAPP_INTEGRATION_MODE} />
          <IntegrationRow label="Razorpay" mode={process.env.RAZORPAY_INTEGRATION_MODE} />
          <IntegrationRow label="Hermes" mode={process.env.HERMES_MODE} />
          <IntegrationRow label="Google Drive" mode={undefined} />
        </div>
      </section>
    </div>
  );
}
