import { requireOwnerContext } from "@/lib/social/db-context";
import { getAutomationSettings } from "@/lib/social/repositories/automation";
import { setAutonomyLevelAction } from "./actions";
import { setShadowModeAction } from "../actions";

const MODES = [
  { value: "MANUAL", label: "Manual", detail: "Agent plans and generates; every action requires your approval in the Agent panel." },
  { value: "SUPERVISED", label: "Supervised", detail: "Agent prepares actions; anything that touches an external account still requires approval." },
  { value: "AUTOPILOT", label: "Autopilot", detail: "Agent may complete safe internal work within guardrails. SHADOW remains the independent hard gate on every external provider mutation." },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const settings = await getAutomationSettings(ctx);
  const notice = await searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Autonomy level controls Agent behavior. Shadow mode is the hard gate on whether anything actually reaches a
          real account — the two are independent on purpose: you can plan freely in AUTOPILOT while shadow mode keeps
          every publish simulated.
        </p>
      </div>

      {notice.message && (
        <div
          role={notice.status === "error" ? "alert" : "status"}
          className={`saut-card p-3 text-sm ${notice.status === "error" ? "border-red-500/40" : "border-emerald-500/30"}`}
          style={{ color: notice.status === "error" ? "var(--saut-danger)" : "var(--saut-success)" }}
        >
          {notice.message}
        </div>
      )}

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Agent autonomy level</h2>
        <form action={setAutonomyLevelAction} className="space-y-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg p-3"
              style={{ background: settings.autonomy_level === m.value ? "var(--saut-accent-muted)" : "var(--saut-surface-2)" }}
            >
              <input type="radio" name="mode" value={m.value} defaultChecked={settings.autonomy_level === m.value} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs" style={{ color: "var(--saut-text-subtle)" }}>{m.detail}</span>
              </span>
            </label>
          ))}
          <button className="saut-btn saut-btn-primary">Save autonomy level</button>
        </form>
      </section>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Shadow mode (publishing gate)</h2>
        <p className="text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Currently{" "}
          <span className="font-semibold" style={{ color: settings.shadow_mode ? "var(--saut-success)" : "var(--saut-warning)" }}>
            {settings.shadow_mode ? "SHADOW" : "LIVE"}
          </span>
          . {settings.shadow_mode ? "Scheduled posts run the full pipeline but never call a provider." : "Scheduled posts publish to real accounts."}
        </p>
        <form action={setShadowModeAction}>
          <input type="hidden" name="shadow_mode" value={String(!settings.shadow_mode)} />
          <button className={`saut-btn ${settings.shadow_mode ? "saut-btn-danger" : "saut-btn-secondary"}`}>
            {settings.shadow_mode ? "Enable live publishing" : "Switch to shadow"}
          </button>
        </form>
      </section>
    </div>
  );
}
