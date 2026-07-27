import { requireOwnerContext } from "@/lib/social/db-context";
import { getAutomationSettings } from "@/lib/social/repositories/automation";
import { listAutomations, listAutomationRuns } from "@/lib/social/automations";
import { createAutomationAction, toggleAutomationAction, deleteAutomationAction, saveGuardrailsAction } from "./actions";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function AutomationsPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [settings, automations, runs] = await Promise.all([getAutomationSettings(ctx), listAutomations(ctx), listAutomationRuns(ctx, 20)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Guardrails bound what the Agent may do automatically; workflows react to real events from the publishing
          worker.
        </p>
      </div>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Guardrails</h2>
        <form action={saveGuardrailsAction} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
            QA threshold (0-100)
            <input name="qa_threshold" type="number" min={0} max={100} defaultValue={settings.qa_threshold} className="saut-input w-full" />
          </label>
          <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
            Minimum confidence to auto-act
            <input name="minConfidenceToAutoAct" type="number" step={0.05} min={0} max={1} defaultValue={settings.min_confidence_to_autoact} className="saut-input w-full" />
          </label>
          <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
            Monthly budget ($)
            <input name="monthly_budget_dollars" type="number" min={0} defaultValue={(settings.monthly_budget_cents / 100).toFixed(2)} className="saut-input w-full" />
          </label>
          <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
            Max spend per content item ($)
            <input name="per_content_max_dollars" type="number" min={0} defaultValue={(settings.per_content_max_cents / 100).toFixed(2)} className="saut-input w-full" />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2" style={{ color: "var(--saut-text-muted)" }}>
            Tools that always require approval (comma separated)
            <input name="requireApprovalFor" defaultValue={settings.require_approval_for.join(", ")} className="saut-input w-full" />
          </label>
          <button className="saut-btn saut-btn-primary w-fit sm:col-span-2">Save guardrails</button>
        </form>
      </section>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">New workflow</h2>
        <form action={createAutomationAction} className="grid gap-2 sm:grid-cols-2">
          <input name="name" placeholder="Workflow name" required className="saut-input" />
          <select name="trigger" className="saut-input">
            <option value="post_published">When a post publishes</option>
            <option value="job_dead_letter">When a publish job fails permanently</option>
          </select>
          <textarea name="description" placeholder="Description" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
          <div className="flex gap-4 text-xs sm:col-span-2">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="actions" value="notify" defaultChecked /> Notify (audit event)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="actions" value="propose_followup" /> Propose a follow-up (needs approval)
            </label>
          </div>
          <button className="saut-btn saut-btn-primary w-fit sm:col-span-2">Create (disabled by default)</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">Workflows</h2>
        <div className="space-y-2">
          {automations.map((a) => (
            <div key={a.id} className="saut-card flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <span className="font-medium">{a.name}</span>{" "}
                <span className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
                  · {a.trigger?.type ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`saut-chip ${a.enabled ? "saut-chip-success" : "saut-chip-neutral"}`}>
                  <span className="saut-chip-dot" /> {a.enabled ? "enabled" : "disabled"}
                </span>
                <form action={toggleAutomationAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="enabled" value={String(!a.enabled)} />
                  <button className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">{a.enabled ? "Disable" : "Enable"}</button>
                </form>
                <form action={deleteAutomationAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Delete</button>
                </form>
              </div>
            </div>
          ))}
          {automations.length === 0 && (
            <div className="saut-card p-6 text-center text-sm" style={{ color: "var(--saut-text-subtle)" }}>
              No workflows yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">Recent runs</h2>
        <div className="space-y-1.5">
          {runs.map((r: Record<string, unknown>) => (
            <div key={r.id as string} className="flex items-center gap-2 text-xs">
              <span className="saut-mono" style={{ color: "var(--saut-text-subtle)" }}>{fmt(r.started_at as string)}</span>
              <span className={`saut-chip ${r.status === "SUCCEEDED" ? "saut-chip-success" : r.status === "FAILED" ? "saut-chip-danger" : "saut-chip-info"}`}>
                <span className="saut-chip-dot" /> {(r.status as string).toLowerCase()}
              </span>
              {r.error ? <span style={{ color: "var(--saut-danger)" }}>{r.error as string}</span> : null}
            </div>
          ))}
          {runs.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No runs yet.</p>}
        </div>
      </section>
    </div>
  );
}
