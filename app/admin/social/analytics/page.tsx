import { requireOwnerContext } from "@/lib/social/db-context";
import { listRecentMetrics, listCostEvents, listExperiments, listResearchItems } from "@/lib/social/repositories/analytics";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function AnalyticsPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [metrics, costs, experiments, research] = await Promise.all([
    listRecentMetrics(ctx, 50),
    listCostEvents(ctx, 20),
    listExperiments(ctx),
    listResearchItems(ctx),
  ]);

  const totalReach = metrics.reduce((sum, m) => sum + (m.reach ?? 0), 0);
  const totalEngagement = metrics.reduce((sum, m) => sum + (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0), 0);
  const totalCostCents = costs.reduce((sum, c: Record<string, unknown>) => sum + ((c.amount_cents as number) ?? 0), 0);
  const hasMetrics = metrics.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Real content metrics and AI/media spend. Nothing here is fabricated — empty means no publications with
          captured metrics yet.
        </p>
      </div>

      {!hasMetrics && (
        <div className="saut-card p-5">
          <p className="text-sm font-medium">No performance data yet</p>
          <p className="mt-1 text-xs" style={{ color: "var(--saut-text-subtle)" }}>
            Metrics appear after a real publication has been measured. No reach or engagement estimate is being inferred.
          </p>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="saut-card p-5">
          <div className="saut-label">Total reach</div>
          <div className="saut-metric mt-2 text-3xl">{hasMetrics ? totalReach.toLocaleString() : "—"}</div>
        </div>
        <div className="saut-card p-5">
          <div className="saut-label">Total engagement</div>
          <div className="saut-metric mt-2 text-3xl">{hasMetrics ? totalEngagement.toLocaleString() : "—"}</div>
        </div>
        <div className="saut-card p-5">
          <div className="saut-label">AI/media spend</div>
          <div className="saut-metric mt-2 text-3xl">${(totalCostCents / 100).toFixed(2)}</div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">Recent metrics</h2>
        <div className="space-y-2">
          {metrics.map((m) => {
            const variant = (m as unknown as { content_variants?: { platform?: string; caption?: string } }).content_variants;
            return (
              <div key={m.id} className="saut-card flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <span className="capitalize">{variant?.platform ?? "—"}</span>
                <span style={{ color: "var(--saut-text-subtle)" }}>{fmt(m.measured_at)}</span>
                <span className="saut-mono" style={{ color: "var(--saut-text-muted)" }}>
                  reach {m.reach} · likes {m.likes} · comments {m.comments} · shares {m.shares}
                </span>
              </div>
            );
          })}
          {metrics.length === 0 && (
            <div className="saut-card p-6 text-center text-sm" style={{ color: "var(--saut-text-subtle)" }}>
              No metrics captured yet.
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="saut-section-title">Experiments</h2>
          <div className="space-y-2">
            {experiments.map((e: Record<string, unknown>) => (
              <div key={e.id as string} className="saut-card p-3 text-sm">
                <span className="font-medium">{e.name as string}</span>{" "}
                <span className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>· {(e.status as string).toLowerCase()}</span>
                <p className="mt-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>{e.hypothesis as string}</p>
              </div>
            ))}
            {experiments.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No experiments yet.</p>}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="saut-section-title">Research</h2>
          <div className="space-y-2">
            {research.map((r: Record<string, unknown>) => (
              <div key={r.id as string} className="saut-card p-3 text-sm">
                <span className="saut-mono mr-2 text-[10px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>{r.kind as string}</span>
                <span className="font-medium">{r.title as string}</span>
              </div>
            ))}
            {research.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No research items yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
