/**
 * Legacy lead-analytics panel backed by the WhatsApp-bot backend.
 * Renders only when BOT_BACKEND_URL is configured.
 */

interface Lead {
  phone?: string;
  business_type?: string;
  pain_point?: string;
  intent?: string;
  timestamp_utc?: string;
}

interface DashboardData {
  summary?: {
    daily_leads?: number;
    total_30d?: number;
    hot_leads_count?: number;
    booking_rate?: number;
    bookings_total?: number;
    completion_rate?: number;
    drop_off?: number;
  };
  trend_7d?: { date: string; count?: number }[];
  top_pain_points?: { label: string; count?: number }[];
  recent_leads?: Lead[];
  hot_leads?: Lead[];
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-1 text-[12px] text-slate-400">{hint}</p>
    </div>
  );
}

export default async function LeadAnalytics() {
  const base = process.env.BOT_BACKEND_URL;
  if (!base) return null;

  let data: DashboardData;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/dashboard.json`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Dashboard API error (${res.status})`);
    data = (await res.json()) as DashboardData;
  } catch (e) {
    return (
      <div className="mt-8 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Lead analytics backend unreachable: {e instanceof Error ? e.message : "unknown error"}
      </div>
    );
  }

  const summary = data.summary ?? {};
  const trend = data.trend_7d ?? [];
  const painPoints = data.top_pain_points ?? [];
  const recentLeads = data.recent_leads ?? [];
  const trendMax = Math.max(1, ...trend.map((d) => d.count ?? 0));
  const painMax = Math.max(1, ...painPoints.map((d) => d.count ?? 0));

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">
        WhatsApp lead analytics
      </h2>
      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Daily Leads" value={summary.daily_leads ?? 0} hint={`30-day total: ${summary.total_30d ?? 0}`} />
        <KpiCard label="Hot Leads" value={summary.hot_leads_count ?? 0} hint="High intent and priority pain points" />
        <KpiCard label="Booking Rate" value={`${summary.booking_rate ?? 0}%`} hint={`Bookings: ${summary.bookings_total ?? 0}`} />
        <KpiCard label="Completion Rate" value={`${summary.completion_rate ?? 0}%`} hint={`Drop-off: ${summary.drop_off ?? 0}`} />
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">7 Day Leads</p>
          <div className="mt-4 flex h-40 items-end gap-2 sm:gap-3">
            {trend.map((point) => (
              <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-[#1E3A8A] to-[#45C4FF]"
                    style={{ height: `${Math.max(8, ((point.count ?? 0) / trendMax) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">{point.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">Top Pain Points</p>
          <div className="mt-4 space-y-3">
            {painPoints.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet.</p>
            ) : (
              painPoints.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-300">
                    <span>{item.label}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#45C4FF] to-[#1E3A8A]"
                      style={{ width: `${Math.max(5, ((item.count ?? 0) / painMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-white">Recent Leads</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-4 py-3 sm:px-5">Phone</th>
                <th className="px-4 py-3 sm:px-5">Business Type</th>
                <th className="px-4 py-3 sm:px-5">Pain Point</th>
                <th className="px-4 py-3 sm:px-5">Intent</th>
                <th className="px-4 py-3 sm:px-5">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-400 sm:px-5" colSpan={5}>
                    No leads yet.
                  </td>
                </tr>
              ) : (
                recentLeads.map((lead, i) => (
                  <tr key={`${lead.phone ?? "p"}-${lead.timestamp_utc ?? i}`} className="border-t border-white/5">
                    <td className="px-4 py-3 sm:px-5">{lead.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-300 sm:px-5">{lead.business_type ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-300 sm:px-5">{lead.pain_point ?? "-"}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">
                        {lead.intent ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 sm:px-5">
                      {String(lead.timestamp_utc ?? "-").slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
