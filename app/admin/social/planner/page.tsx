import { requireOwnerContext } from "@/lib/social/db-context";
import { listAccounts } from "@/lib/social/repositories/accounts";
import { listCampaigns } from "@/lib/social/repositories/campaigns";
import { listRecentVariants } from "@/lib/social/repositories/content";
import { listJobs } from "@/lib/social/repositories/publishing";
import { createCampaignAction, schedulePostAction, cancelScheduledPostAction } from "../actions";

const PLATFORMS = ["instagram", "facebook", "threads", "linkedin", "youtube"] as const;
const PLATFORM_LABEL: Record<(typeof PLATFORMS)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};
const PIPELINE_STAGES = ["GENERATING", "READY", "SCHEDULED", "PUBLISHED", "FAILED"] as const;

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

function publishedResultUrl(result: Record<string, unknown>): string | null {
  if (result.mode !== "live" || typeof result.permalink !== "string") return null;
  try {
    const url = new URL(result.permalink);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function PlannerPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [campaigns, accounts, variants, jobs] = await Promise.all([
    listCampaigns(ctx),
    listAccounts(ctx),
    listRecentVariants(ctx, 100),
    listJobs(ctx, 50),
  ]);

  const connectedAccounts = accounts.filter((a) => a.status === "CONNECTED");
  const readyVariants = variants.filter((v: Record<string, unknown>) => v.status === "READY" || v.status === "GENERATING");

  const stageCounts = PIPELINE_STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = variants.filter((v: Record<string, unknown>) => v.status === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planner</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Campaigns, scheduling, and the content pipeline.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="saut-section-title">Pipeline</h2>
        <div className="grid grid-cols-5 gap-2">
          {PIPELINE_STAGES.map((s) => (
            <div key={s} className="saut-card p-3 text-center">
              <div className="saut-metric text-xl">{stageCounts[s] ?? 0}</div>
              <div className="saut-label mt-1">{s.toLowerCase()}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="saut-card space-y-3 p-5">
          <h2 className="saut-section-title">New campaign</h2>
          <form action={createCampaignAction} className="space-y-2">
            <input name="name" placeholder="Campaign name" required className="saut-input w-full" />
            <input name="goal" placeholder="Goal (e.g. demo leads, awareness)" required className="saut-input w-full" />
            <div className="flex flex-wrap gap-3 text-xs">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5">
                  <input type="checkbox" name="platforms" value={p} />
                  {PLATFORM_LABEL[p]}
                </label>
              ))}
            </div>
            <button className="saut-btn saut-btn-primary">Create campaign</button>
          </form>
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
                <span className="font-medium">{c.name}</span>{" "}
                <span className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>· {c.status.toLowerCase()}</span>
              </div>
            ))}
            {campaigns.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No campaigns yet.</p>}
          </div>
        </section>

        <section className="saut-card space-y-3 p-5">
          <h2 className="saut-section-title">Schedule a post</h2>
          <form action={schedulePostAction} className="space-y-2">
            <select name="variant_id" required className="saut-input w-full">
              <option value="">Content variant…</option>
              {readyVariants.map((v: Record<string, unknown>) => {
                const master = v.content_master as { title?: string } | null;
                return (
                  <option key={v.id as string} value={v.id as string}>
                    {(master?.title ?? (v.caption as string)?.slice(0, 40))} · {v.platform as string}
                  </option>
                );
              })}
            </select>
            <select name="account_id" required className="saut-input w-full">
              <option value="">Account…</option>
              {connectedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {PLATFORM_LABEL[a.platform as (typeof PLATFORMS)[number]] ?? a.platform} · {a.username}
                </option>
              ))}
            </select>
            <input type="datetime-local" name="scheduled_for" required className="saut-input w-full" />
            <button className="saut-btn saut-btn-primary">Schedule</button>
          </form>
          <p className="text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
            Pick the account that matches the variant&apos;s platform.
          </p>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="saut-section-title">Calendar / queue</h2>
        <div className="space-y-2">
          {jobs.map((j) => {
            const resultUrl = publishedResultUrl(j.result);
            return (
              <div key={j.id} className="saut-card flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <span className="saut-mono" style={{ color: "var(--saut-text-subtle)" }}>
                  {fmt(j.scheduled_at)}
                </span>
                <span className="saut-chip saut-chip-neutral">
                  <span className="saut-chip-dot" /> {j.status.toLowerCase()}
                </span>
                <span className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
                  {j.attempts}/{j.max_attempts} attempts
                </span>
                {j.status === "SCHEDULED" && (
                  <form action={cancelScheduledPostAction}>
                    <input type="hidden" name="id" value={j.id} />
                    <button className="saut-btn saut-btn-ghost !h-6 !px-2 text-[10px]">Cancel</button>
                  </form>
                )}
                {resultUrl && (
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="saut-btn saut-btn-ghost !h-6 !px-2 text-[10px]"
                  >
                    View result
                  </a>
                )}
              </div>
            );
          })}
          {jobs.length === 0 && (
            <div className="saut-card p-6 text-center text-sm" style={{ color: "var(--saut-text-subtle)" }}>
              Nothing scheduled yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
