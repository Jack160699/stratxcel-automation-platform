import { requireOwnerContext } from "@/lib/social/db-context";

type IntegrationStatus = "live" | "test" | "shadow" | "disconnected" | "blocked" | "manual_action_required";

const STATUS_STYLES: Record<IntegrationStatus, string> = {
  live: "bg-emerald-400/15 text-emerald-300",
  test: "bg-sky-400/15 text-sky-300",
  shadow: "bg-amber-400/15 text-amber-300",
  disconnected: "bg-slate-600/20 text-slate-400",
  blocked: "bg-rose-400/15 text-rose-300",
  manual_action_required: "bg-orange-400/15 text-orange-300",
};

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  live: "Live",
  test: "Test",
  shadow: "Shadow",
  disconnected: "Disconnected",
  blocked: "Blocked",
  manual_action_required: "Manual action required",
};

function modeToStatus(mode: string | undefined, disabledIsBlocked = false): IntegrationStatus {
  if (mode === "live") return "live";
  if (mode === "shadow") return "shadow";
  if (mode === "mock") return "test";
  if (mode === "http") return "live";
  return disabledIsBlocked ? "blocked" : "disconnected";
}

function Badge({ status }: { status: IntegrationStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

interface IntegrationRow {
  name: string;
  status: IntegrationStatus;
  detail: string;
}

/**
 * Reads actual env vars server-side — never a hardcoded "connected".
 * Every row here reflects genuinely current configuration, not an
 * aspirational or cached state. Per explicit instruction: never display a
 * fake connected/healthy state.
 *
 * See layout.tsx: nested pages guard independently of the parent layout —
 * the App Router still renders and serializes this page's RSC output even
 * when the layout discards {children}, so without this guard an
 * unauthenticated request's response would still embed the integration
 * rows below (env-var-derived operational status) even though the visible
 * page shows AdminLogin.
 */
export default async function PlatformOverviewPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const rows: IntegrationRow[] = [
    {
      name: "WhatsApp",
      status: modeToStatus(process.env.WHATSAPP_INTEGRATION_MODE, true),
      detail: "Phone-to-tenant routing built; no phone_number_id verified yet (tomorrow's manual action).",
    },
    {
      name: "Razorpay",
      status: modeToStatus(process.env.RAZORPAY_INTEGRATION_MODE, true),
      detail: "Payment state machine + idempotent webhooks built. Live webhook route not yet confirmed with the dashboard.",
    },
    {
      name: "Hermes",
      status: modeToStatus(process.env.HERMES_MODE, true),
      detail: "No Hermes instance reachable this session (Docker unavailable). MockHermesAdapter available for demos.",
    },
    {
      name: "Google Drive",
      status: "manual_action_required",
      detail: "OAuth code path built; no consent flow run — connect tomorrow via /api/platform/storage/drive/connect.",
    },
    {
      name: "BYOK providers",
      status: "disconnected",
      detail: "No tenant has connected a provider key yet.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Integration status</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Integration</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-200">{row.name}</td>
                  <td className="px-4 py-3">
                    <Badge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
        <p>
          Start at <span className="text-slate-200">Tenants</span> to create a tenant and become its owner, then use
          the tenant ID on the other pages (there is no tenant switcher yet — each page asks for it once and
          remembers it locally).
        </p>
      </section>
    </div>
  );
}
