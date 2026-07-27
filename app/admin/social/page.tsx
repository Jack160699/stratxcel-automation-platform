import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import AdminLogin from "../AdminLogin";
import { Mark } from "@/app/components/Mark";
import {
  disconnectAccountAction,
  setPublishingModeAction,
  createCampaignAction,
  createContentItemAction,
  schedulePostAction,
  cancelScheduledPostAction,
  runWorkerNowAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Social Autopilot — Stratxcel Admin",
  robots: { index: false, follow: false },
};

const PROVIDERS = ["instagram", "facebook", "threads"] as const;
const PROVIDER_LABEL: Record<(typeof PROVIDERS)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
  threads: "Threads",
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function SocialAutopilotPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <AdminLogin />;

  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center">
          <h1 className="text-xl font-semibold text-white">No access</h1>
          <p className="mt-2 text-sm text-slate-400">{user.email} is not authorised.</p>
        </div>
      </main>
    );
  }

  // Admin identity confirmed — safe to use the service client for the rest
  // of this page's reads (sanitized: no token columns are ever selected).
  const service = createSupabaseServiceClient();

  const [
    { data: accounts },
    { data: campaigns },
    { data: contentItems },
    { data: scheduledPosts },
    { data: jobs },
    { data: publications },
    { data: settingsRow },
    { data: systemEvents },
  ] = await Promise.all([
    service
      .from("social_accounts")
      .select(
        "id, provider, external_account_id, display_name, username, profile_picture_url, status, token_expires_at, last_health_check_at, last_error, created_at"
      )
      .order("created_at", { ascending: false }),
    service.from("social_campaigns").select("*").order("created_at", { ascending: false }),
    service
      .from("social_content_items")
      .select("id, title, base_caption, hashtags, status, campaign_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("social_scheduled_posts")
      .select("id, content_item_id, account_id, provider, scheduled_for, status, created_at")
      .order("scheduled_for", { ascending: true })
      .limit(50),
    service
      .from("social_jobs")
      .select("id, scheduled_post_id, status, mode, attempt, max_attempts, last_error, run_after")
      .order("run_after", { ascending: false })
      .limit(50),
    service
      .from("social_publications")
      .select("id, provider, mode, external_post_id, permalink, published_at, scheduled_post_id")
      .order("published_at", { ascending: false })
      .limit(20),
    service.from("social_settings").select("value").eq("key", "publishing_mode").maybeSingle(),
    service
      .from("social_system_events")
      .select("id, category, level, message, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const publishingMode = (settingsRow?.value as string) === "live" ? "live" : "shadow";
  const connectedAccounts = accounts ?? [];
  const activeJobs = (jobs ?? []).filter((j) => ["pending", "claimed", "running"].includes(j.status));
  const failedJobs = (jobs ?? []).filter((j) => ["failed", "dead_letter"].includes(j.status));

  return (
    <main className="min-h-screen bg-[#05070e] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Mark className="h-8 w-8" />
              <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
                STRATXCEL
              </span>
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Social Autopilot
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Signed in as {user.email} ·{" "}
              <span
                className={
                  publishingMode === "live"
                    ? "font-semibold text-amber-300"
                    : "font-semibold text-emerald-300"
                }
              >
                {publishingMode === "live" ? "LIVE PUBLISHING" : "SHADOW MODE"}
              </span>
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]"
          >
            ← Admin console
          </Link>
        </div>

        {/* SYSTEM HEALTH / SAFETY */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">System health &amp; safety</h2>
              <p className="mt-1 text-sm text-slate-400">
                {connectedAccounts.filter((a) => a.status === "connected").length} connected ·{" "}
                {activeJobs.length} active jobs · {failedJobs.length} failed/dead-letter
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form action={runWorkerNowAction}>
                <button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]">
                  Run worker now
                </button>
              </form>
              <form action={setPublishingModeAction} className="flex items-center gap-2">
                <input type="hidden" name="mode" value={publishingMode === "live" ? "shadow" : "live"} />
                <button
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    publishingMode === "live"
                      ? "border border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10"
                      : "border border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
                  }`}
                >
                  {publishingMode === "live" ? "Switch to SHADOW" : "Enable LIVE publishing"}
                </button>
              </form>
            </div>
          </div>
          <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto border-t border-white/5 pt-3">
            {(systemEvents ?? []).length === 0 && (
              <p className="text-xs text-slate-500">No events yet.</p>
            )}
            {(systemEvents ?? []).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-slate-600">{fmt(e.created_at)}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    e.level === "error"
                      ? "bg-rose-400/15 text-rose-300"
                      : e.level === "warn"
                        ? "bg-amber-400/15 text-amber-300"
                        : "bg-sky-400/15 text-sky-300"
                  }`}
                >
                  {e.category}
                </span>
                <span className="text-slate-300">{e.message}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CONNECTED ACCOUNTS */}
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Connected accounts</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {PROVIDERS.map((provider) => {
              const acct = connectedAccounts.find(
                (a) => a.provider === provider && a.status === "connected"
              );
              return (
                <div
                  key={provider}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      {PROVIDER_LABEL[provider]}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        acct ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-600/20 text-slate-400"
                      }`}
                    >
                      {acct ? "connected" : "not connected"}
                    </span>
                  </div>
                  {acct ? (
                    <>
                      <p className="mt-2 truncate text-xs text-slate-400">
                        {acct.username ?? acct.display_name ?? acct.external_account_id}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        token expires {fmt(acct.token_expires_at)}
                      </p>
                      {acct.last_error && (
                        <p className="mt-1 text-[11px] text-rose-300">{acct.last_error}</p>
                      )}
                      <form action={disconnectAccountAction} className="mt-3">
                        <input type="hidden" name="id" value={acct.id} />
                        <button className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:border-rose-400/40 hover:text-rose-300">
                          Disconnect
                        </button>
                      </form>
                    </>
                  ) : (
                    <a
                      href={`/api/social/oauth/${provider}/connect`}
                      className="mt-3 inline-block rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/[0.05]"
                    >
                      Connect
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* CONTENT */}
        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">New campaign</h2>
            <form
              action={createCampaignAction}
              className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <input
                name="name"
                placeholder="Campaign name"
                required
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <textarea
                name="description"
                placeholder="Description"
                rows={2}
                className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                {PROVIDERS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input type="checkbox" name="platforms" value={p} />
                    {PROVIDER_LABEL[p]}
                  </label>
                ))}
              </div>
              <input
                name="cadence"
                placeholder="Cadence (e.g. 3x/week)"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <button className="h-9 rounded-lg bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] px-4 text-xs font-semibold text-white hover:brightness-110">
                Create campaign
              </button>
            </form>

            <div className="space-y-2">
              {(campaigns ?? []).map((c) => (
                <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm">
                  <span className="font-semibold text-white">{c.name}</span>{" "}
                  <span className="text-xs text-slate-500">· {c.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">New content item</h2>
            <form
              action={createContentItemAction}
              className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <select
                name="campaign_id"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none"
              >
                <option value="">No campaign</option>
                {(campaigns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                name="title"
                placeholder="Title (internal)"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <textarea
                name="base_caption"
                placeholder="Caption"
                required
                rows={3}
                className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <input
                name="hashtags"
                placeholder="hashtags, comma or space separated"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <input
                name="cta"
                placeholder="Call to action"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <input
                name="media_urls"
                placeholder="Media URL(s), space separated"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <button className="h-9 rounded-lg bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] px-4 text-xs font-semibold text-white hover:brightness-110">
                Save content item
              </button>
            </form>
          </div>
        </section>

        {/* CALENDAR / QUEUE */}
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Schedule a post</h2>
          <form
            action={schedulePostAction}
            className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-5"
          >
            <select
              name="content_item_id"
              required
              className="h-10 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none sm:col-span-2"
            >
              <option value="">Content item…</option>
              {(contentItems ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ?? c.base_caption?.slice(0, 40)}
                </option>
              ))}
            </select>
            <select
              name="account_id"
              required
              className="h-10 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none"
            >
              <option value="">Account…</option>
              {connectedAccounts
                .filter((a) => a.status === "connected")
                .map((a) => (
                  <option key={a.id} value={a.id} data-provider={a.provider}>
                    {PROVIDER_LABEL[a.provider as (typeof PROVIDERS)[number]]} · {a.username ?? a.display_name}
                  </option>
                ))}
            </select>
            <select
              name="provider"
              required
              className="h-10 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              name="scheduled_for"
              required
              className="h-10 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none"
            />
            <button className="h-10 rounded-lg bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] px-4 text-xs font-semibold text-white hover:brightness-110">
              Schedule
            </button>
          </form>
          <p className="text-[11px] text-slate-500">
            Note: pick the account that matches the destination provider — the worker publishes using
            whichever account ID is stored, so make sure they line up.
          </p>

          <div className="space-y-2">
            {(scheduledPosts ?? []).map((p) => {
              const job = (jobs ?? []).find((j) => j.scheduled_post_id === p.id);
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-white">{PROVIDER_LABEL[p.provider as (typeof PROVIDERS)[number]] ?? p.provider}</span>{" "}
                    <span className="text-slate-500">· {fmt(p.scheduled_for)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-[10px] text-slate-300">
                      {p.status}
                    </span>
                    {job && (
                      <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-[10px] text-slate-400">
                        job: {job.status} ({job.attempt}/{job.max_attempts})
                      </span>
                    )}
                    {p.status === "pending" && (
                      <form action={cancelScheduledPostAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 hover:border-rose-400/40 hover:text-rose-300">
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
            {(scheduledPosts ?? []).length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-center text-sm text-slate-400">
                Nothing scheduled yet.
              </p>
            )}
          </div>
        </section>

        {/* ANALYTICS */}
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Recent publications</h2>
          <div className="space-y-2">
            {(publications ?? []).map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs"
              >
                <span className="text-white">
                  {PROVIDER_LABEL[p.provider as (typeof PROVIDERS)[number]] ?? p.provider}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    p.mode === "live" ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"
                  }`}
                >
                  {p.mode}
                </span>
                <span className="text-slate-500">{fmt(p.published_at)}</span>
                {p.permalink ? (
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                    view
                  </a>
                ) : (
                  <span className="text-slate-600">{p.external_post_id}</span>
                )}
              </div>
            ))}
            {(publications ?? []).length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-center text-sm text-slate-400">
                No publications yet. Engagement metrics appear here once Meta returns them —
                nothing is fabricated.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
