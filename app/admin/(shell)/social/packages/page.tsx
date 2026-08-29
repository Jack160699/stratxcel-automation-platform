import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { MAX_RECOVERY_ATTEMPTS } from "@/lib/social/package-autopilot";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { listMyTenants } from "@/lib/tenants/current-tenant";
import { StatusBadge } from "../components/StatusBadge";
import { PackageAssignmentPanel } from "./PackageAssignmentPanel";

export const metadata: Metadata = {
  title: "Packages — Social Autopilot — Stratxcel Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin operability for Package Autopilot (Section 51 of the release-
 * candidate brief): producer health (last runs, failures) and every
 * client's package state, so staff can tell Autopilot is healthy without
 * reading logs. Read-only — controls live on the client's own /app surface;
 * staff never needs to (and structurally cannot) bypass a tenant's own
 * pause/cancel decision from here.
 */
export default async function SocialPackagesPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const service = createSupabaseServiceClient();
  const tenants = await listMyTenants(ctx.supabase, ctx.ownerId);
  const [{ data: runs }, { data: authorizations }, { data: blockedItems }] = await Promise.all([
    service.from("social_autopilot_producer_runs").select("*").order("run_at", { ascending: false }).limit(10),
    service.from("social_autopilot_authorizations").select("id, tenant_id, state, publishing_mode, period_number, period_target_units, starts_at, ends_at, allowed_platforms").order("updated_at", { ascending: false }).limit(50),
    service.from("social_autopilot_queue_items").select("id, tenant_id, authorization_id, status, last_error, scheduled_at, retry_count, recovery_exhausted").eq("status", "BLOCKED").order("updated_at", { ascending: false }).limit(20),
  ]);

  const lastRun = runs?.[0] ?? null;
  const totalFailuresRecent = (runs ?? []).reduce((sum, run) => sum + (Array.isArray(run.failures) ? run.failures.length : 0), 0);

  return (
    <div className="p-6">
      <div className="saut-section-title mb-1">Social Autopilot</div>
      <h1 className="mb-6 text-xl font-semibold">Packages</h1>

      <section className="saut-card mb-6 p-4">
        <div className="saut-section-title mb-3">Producer health</div>
        {!lastRun ? (
          <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>The producer has not run yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div><div className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Last run</div><div>{new Date(lastRun.run_at).toLocaleString()}</div></div>
            <div><div className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Tenants processed</div><div>{lastRun.tenants_processed}</div></div>
            <div><div className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Items planned</div><div>{lastRun.items_planned}</div></div>
            <div><div className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Items prepared</div><div>{lastRun.items_prepared}</div></div>
            <div><div className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Failures (last 10 runs)</div><div style={{ color: totalFailuresRecent > 0 ? "var(--saut-danger)" : undefined }}>{totalFailuresRecent}</div></div>
          </div>
        )}
      </section>

      <section className="saut-card mb-6 p-4">
        <div className="saut-section-title mb-3">Workspace assignment</div>
        <PackageAssignmentPanel tenants={tenants} />
      </section>

      <section className="saut-card mb-6 p-4">
        <div className="saut-section-title mb-3">Active packages ({authorizations?.length ?? 0})</div>
        {!authorizations?.length ? (
          <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>No packages activated yet.</p>
        ) : (
          <div className="space-y-2">
            {authorizations.map((authorization) => (
              <div key={authorization.id} className="saut-card-2 flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs">
                <span className="saut-mono">{authorization.tenant_id}</span>
                <StatusBadge label={authorization.state} />
                <span>{authorization.publishing_mode}</span>
                <span>Period {authorization.period_number} · target {authorization.period_target_units}</span>
                <span>{authorization.allowed_platforms.join(", ")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="saut-card p-4">
        {/* Mission F Section 10/12: BLOCKED means "recovery in progress"
            (still eligible for an automatic retry with a materially
            different angle) unless recovery_exhausted is true, which means
            every staged recovery attempt has genuinely been tried and
            failed and this one specifically needs a human/support look --
            distinguished here so staff aren't left guessing which BLOCKED
            rows are self-healing and which aren't. */}
        <div className="saut-section-title mb-3">Blocked items ({blockedItems?.length ?? 0})</div>
        {!blockedItems?.length ? (
          <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>Nothing needs attention.</p>
        ) : (
          <div className="space-y-2">
            {blockedItems.map((item) => (
              <div key={item.id} className="saut-card-2 flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs">
                <span className="saut-mono">{item.tenant_id}</span>
                {item.recovery_exhausted ? (
                  <span style={{ color: "var(--saut-danger)" }}>Recovery exhausted ({item.retry_count}/{MAX_RECOVERY_ATTEMPTS} attempts) — needs a human look</span>
                ) : (
                  <span style={{ color: "var(--saut-text-subtle)" }}>Recovering ({item.retry_count}/{MAX_RECOVERY_ATTEMPTS} attempts) — will retry automatically with a different angle</span>
                )}
                <span style={{ color: "var(--saut-danger)" }}>{item.last_error}</span>
                <span>{new Date(item.scheduled_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
