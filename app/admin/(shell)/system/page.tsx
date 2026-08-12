import { requireOwnerContext } from "@/lib/social/db-context";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { heartbeatState } from "@/lib/hermes/mission-control";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import type { AdminProviderStatus } from "@stratxcel/ai-runtime";

type IntegrationStatus = "live" | "test" | "shadow" | "disconnected" | "blocked" | "manual_action_required";

const STATUS_CHIP: Record<IntegrationStatus, { label: string; state: ChipState }> = {
  live: { label: "Live", state: "success" },
  test: { label: "Test", state: "accent" },
  shadow: { label: "Shadow", state: "warning" },
  disconnected: { label: "Disconnected", state: "neutral" },
  blocked: { label: "Blocked", state: "danger" },
  manual_action_required: { label: "Manual action required", state: "warning" },
};

function modeToStatus(mode: string | undefined, disabledIsBlocked = false): IntegrationStatus {
  if (mode === "live") return "live";
  if (mode === "shadow") return "shadow";
  if (mode === "mock") return "test";
  if (mode === "http") return "live";
  return disabledIsBlocked ? "blocked" : "disconnected";
}

function aiStatusToIntegration(status: AdminProviderStatus): IntegrationStatus {
  switch (status) {
    case "operational":
      return "live";
    case "model_available":
    case "reachable":
    case "configured":
      return "test";
    case "degraded":
    case "circuit_open":
      return "manual_action_required";
    case "not_configured":
    default:
      return "disconnected";
  }
}

interface IntegrationRow {
  name: string;
  status: IntegrationStatus;
  detail: string;
}

async function currentHermesStatus(hermesMode: string | undefined): Promise<IntegrationRow> {
  const service = getTenantServiceContext().supabase;
  const [heartbeat, killSwitch] = await Promise.all([
    service.from("worker_heartbeats").select("status,last_heartbeat_at").eq("worker_type", "hermes-gateway").order("last_heartbeat_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("kill_switches").select("enabled").eq("scope", "global_hermes").eq("enabled", true).maybeSingle(),
  ]);
  if (killSwitch.data?.enabled) return { name: "Hermes", status: "blocked", detail: "The global Hermes kill switch is active." };
  const signal = heartbeatState(heartbeat.data?.last_heartbeat_at ?? null, heartbeat.data?.status);
  if (signal === "healthy") return { name: "Hermes", status: "live", detail: "Live Hermes gateway heartbeat received; open Hermes Mission Control for operational telemetry." };
  if (signal === "degraded") return { name: "Hermes", status: "manual_action_required", detail: "Hermes gateway heartbeat is delayed or degraded; inspect Mission Control." };
  if (signal === "offline") return { name: "Hermes", status: "blocked", detail: "Hermes gateway heartbeat is stale or stopped; inspect Mission Control." };
  return {
    name: "Hermes",
    status: hermesMode === "http" ? "manual_action_required" : "disconnected",
    detail: hermesMode === "http" ? "HTTP runtime is configured, but gateway heartbeat telemetry is unavailable." : "Hermes gateway heartbeat and runtime configuration are unavailable.",
  };
}

export default async function SystemHealthPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const hermes = await currentHermesStatus(process.env.HERMES_MODE);
  const service = getTenantServiceContext().supabase;
  const { buildAiAdminHealthSnapshot, SupabaseCanonicalMediaStorage, resolveTenantMonthSpend } = await import("@stratxcel/ai-runtime");
  let estimatedMonthSpendUsd: number | null = null;
  let storage: InstanceType<typeof SupabaseCanonicalMediaStorage> | undefined;
  try {
    const tenant = await import("@/lib/tenants/current-tenant").then((m) =>
      m.resolveCurrentTenant(ctx.supabase, ctx.ownerId),
    );
    if (tenant.active?.tenantId) {
      const spend = await resolveTenantMonthSpend(service as never, tenant.active.tenantId);
      estimatedMonthSpendUsd = spend.ok ? spend.spentUsd : null;
      storage = new SupabaseCanonicalMediaStorage({
        client: service as never,
        ownerId: ctx.ownerId,
        tenantId: tenant.active.tenantId,
      });
    }
  } catch {
    estimatedMonthSpendUsd = null;
  }
  const ai = await buildAiAdminHealthSnapshot({
    supabase: service as never,
    storage,
    estimatedMonthSpendUsd,
    serviceMeteringWriterReady: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
  const rows: IntegrationRow[] = [
    {
      name: "WhatsApp",
      status: modeToStatus(process.env.WHATSAPP_INTEGRATION_MODE, true),
      detail: "Phone-to-tenant routing built; no phone_number_id verified yet (tomorrow's manual action).",
    },
    {
      name: "Razorpay",
      status: modeToStatus(process.env.RAZORPAY_INTEGRATION_MODE, true),
      detail: "Live Payment Links, state machine, webhook route (/api/webhook/razorpay), & refunds built.",
    },
    hermes,
    {
      name: "AI Runtime (Gemini)",
      status: aiStatusToIntegration(ai.gemini.status),
      detail: `Status=${ai.gemini.status}; configured=${ai.gemini.configured}; reachable=${ai.gemini.reachable}; modelAvailable=${ai.gemini.modelAvailable}; circuitOpen=${ai.gemini.circuitOpen}.`,
    },
    {
      name: "AI Runtime (OpenAI)",
      status: aiStatusToIntegration(ai.openai.status),
      detail: `Status=${ai.openai.status}; configured=${ai.openai.configured}; reachable=${ai.openai.reachable}; modelAvailable=${ai.openai.modelAvailable}; circuitOpen=${ai.openai.circuitOpen}.`,
    },
    {
      name: "Research Engine",
      status: aiStatusToIntegration(ai.research.status),
      detail: `Status=${ai.research.status}; runtimeAvailable=${ai.research.aiRuntimeAvailable}; Gemini configured=${ai.research.geminiConfigured}; Gemini callable=${ai.research.geminiModelCallable}; Google grounding=${ai.research.googleSearchGrounding}; OpenAI=${ai.research.openaiLiveStatus}; research.web=${ai.research.researchWebImplementation}; research.serp=${ai.research.researchSerpImplementation}. ${ai.research.searchConsoleNote}`,
    },
    {
      name: "AI Media (Image)",
      status: aiStatusToIntegration(ai.image.status),
      detail: `Status=${ai.image.status}; storageReady=${ai.image.storageReady}; budgetLedgerReady=${ai.budgetLedgerReady}; serviceWriter=${ai.serviceMeteringWriterReady}; primaryModelAvailable=${ai.image.primaryModelAvailable}; primary=${ai.image.primaryModel}. Key presence alone is not Live.`,
    },
    {
      name: "AI Media (Video/Veo)",
      status: aiStatusToIntegration(ai.video.status),
      detail: `Status=${ai.video.status}; durableStoreReady=${ai.video.durableStoreReady}; economyModelAvailable=${ai.video.economyModelAvailable}; storageReady=${ai.image.storageReady}; budgetLedgerReady=${ai.budgetLedgerReady}; serviceWriter=${ai.serviceMeteringWriterReady}; Sora active=false; economy=${ai.video.economyModel}.`,
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
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">System Health</h1>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Integration status</h2>
        <div className="overflow-x-auto rounded-sx-md border border-sx-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-sx-surface-2 text-sx-text-subtle">
              <tr>
                <th className="px-4 py-2 font-sx-mono text-[10px] font-medium uppercase tracking-[0.08em]">Integration</th>
                <th className="px-4 py-2 font-sx-mono text-[10px] font-medium uppercase tracking-[0.08em]">Status</th>
                <th className="px-4 py-2 font-sx-mono text-[10px] font-medium uppercase tracking-[0.08em]">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const chip = STATUS_CHIP[row.status];
                return (
                  <tr key={row.name} className="border-t border-sx-border">
                    <td className="px-4 py-3 font-medium text-sx-text">{row.name}</td>
                    <td className="px-4 py-3">
                      <StatusChip state={chip.state}>{chip.label}</StatusChip>
                    </td>
                    <td className="px-4 py-3 text-sx-text-muted">{row.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Card>
        <CardHeading>Getting started</CardHeading>
        <p className="text-sm text-sx-text-muted">
          Start at <span className="text-sx-text">Clients</span> to create a tenant and become its owner — the
          switcher in the top bar remembers your active client across every page below.
        </p>
      </Card>
    </div>
  );
}
